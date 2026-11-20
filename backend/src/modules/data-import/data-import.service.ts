import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { ProductsImportService } from '../products/products-import.service';
import { BranchContext } from '../../common/branch.context';
import { resolveWarehouse } from '../../common/utils/branch.util';
import { normalizeCode } from '../../common/utils/code-normalize.util';
import { normalizePhone } from '../../common/utils/phone.util';
import { ImportPartiesDto, ImportProductsLoggedDto, ImportStockDto } from './dto/data-import.dto';

export interface RowError { row: number; key: string; message: string }
const norm = (s?: string | null) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک');

@Injectable()
export class DataImportService {
    constructor(private prisma: PrismaService, private inventory: InventoryService, private products: ProductsImportService) { }

    private log(tenantId: string, userId: string, kind: string, meta: { source?: string; fileName?: string }, r: { created: number; updated: number; skipped: number; failed: number }, summary?: object) {
        return this.prisma.dataImport.create({
            data: { tenantId, createdBy: userId, kind, source: meta.source, fileName: meta.fileName, ...r, summary: summary as object | undefined },
        });
    }

    history(tenantId: string) {
        return this.prisma.dataImport.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 50 });
    }

    // ---------- کالاها (با ثبت سابقه) ----------
    async importProducts(tenantId: string, userId: string, dto: ImportProductsLoggedDto, ctx: BranchContext) {
        const { source, fileName, ...rest } = dto;
        const r = await this.products.importRows(tenantId, userId, rest, ctx);
        if (!r.dryRun) await this.log(tenantId, userId, 'products', { source, fileName }, { created: r.created, updated: r.updated, skipped: r.skipped, failed: r.errors.length });
        return r;
    }

    // ---------- مشتریان و تأمین‌کنندگان به‌همراه مانده‌ی اول دوره ----------
    async importParties(tenantId: string, userId: string, dto: ImportPartiesDto) {
        const dry = !!dto.dryRun;
        const res = { dryRun: dry, created: 0, updated: 0, skipped: 0, errors: [] as RowError[], totalOpeningDebit: 0, totalOpeningCredit: 0 };

        const existing = await this.prisma.party.findMany({ where: { tenantId }, select: { id: true, code: true, name: true, partyType: true } });
        const byCode = new Map(existing.map((p) => [p.code.toLowerCase(), p]));
        const byName = new Map(existing.map((p) => [`${p.partyType}|${norm(p.name)}`, p]));
        const usedCodes = new Set(byCode.keys());
        const seen = new Set<string>();
        const counters: Record<string, number> = { CUSTOMER: existing.filter((p) => p.partyType === 'CUSTOMER').length, SUPPLIER: existing.filter((p) => p.partyType === 'SUPPLIER').length };
        const nextCode = (type: 'CUSTOMER' | 'SUPPLIER') => {
            for (;;) {
                counters[type] += 1;
                const c = `${type === 'CUSTOMER' ? 'C' : 'S'}-${String(counters[type]).padStart(4, '0')}`;
                if (!usedCodes.has(c.toLowerCase())) return c;
            }
        };

        const toCreate: Prisma.PartyCreateManyInput[] = [];
        const updates: { id: string; data: Record<string, unknown> }[] = [];

        dto.rows.forEach((row, i) => {
            const rowNo = i + 1;
            const fail = (message: string) => res.errors.push({ row: rowNo, key: row.name, message });
            const type = row.partyType ?? dto.defaultType;
            const name = row.name?.trim();
            if (!name) return fail('نام خالی است');

            const mobile = row.mobile ? String(normalizePhone(row.mobile)) : undefined;
            if (mobile && !/^09\d{9}$/.test(mobile)) return fail(`شماره موبایل «${row.mobile}» معتبر نیست`);

            const key = row.code?.trim() ? `c:${row.code.trim().toLowerCase()}` : `n:${type}|${norm(name)}`;
            if (seen.has(key)) return fail('این طرف‌حساب در همین فایل تکراری است');
            seen.add(key);

            const found = (row.code?.trim() && byCode.get(row.code.trim().toLowerCase())) || byName.get(`${type}|${norm(name)}`);
            const common = {
                mobile, phone: row.phone?.trim() || undefined, city: row.city?.trim() || undefined, address: row.address?.trim() || undefined,
                nationalId: row.nationalId?.trim() || undefined, economicCode: row.economicCode?.trim() || undefined, email: row.email?.trim() || undefined,
                notes: row.notes?.trim() || undefined, creditLimit: row.creditLimit, discountPercent: row.discountPercent, paymentTerms: row.paymentTerms,
            };
            if (found) {
                if (!dto.updateExisting) { res.skipped++; return; }
                updates.push({ id: found.id, data: Object.fromEntries(Object.entries({ name, ...common }).filter(([, v]) => v !== undefined)) });
                res.updated++;
                return;
            }
            const code = row.code?.trim() || nextCode(type);
            if (usedCodes.has(code.toLowerCase())) return fail(`کد «${code}» قبلاً استفاده شده است`);
            usedCodes.add(code.toLowerCase());
            const opening = Math.round(row.openingBalance ?? 0);
            if (opening > 0) res.totalOpeningDebit += opening; else res.totalOpeningCredit += -opening;
            toCreate.push({
                tenantId, partyType: type, name, code, ...common, openingBalance: opening, currentBalance: opening,
            });
            res.created++;
        });

        if (!dry && toCreate.length + updates.length > 0) {
            await this.prisma.$transaction(async (tx) => {
                if (toCreate.length) await tx.party.createMany({ data: toCreate });
                for (const u of updates) await tx.party.update({ where: { id: u.id }, data: u.data });
            }, { timeout: 60_000 });
            await this.log(tenantId, userId, 'parties', dto, { created: res.created, updated: res.updated, skipped: res.skipped, failed: res.errors.length }, { totalOpeningDebit: res.totalOpeningDebit, totalOpeningCredit: res.totalOpeningCredit });
        }
        return res;
    }

    // ---------- موجودی اول دوره / انتقال موجودی انبار ----------
    async importStock(tenantId: string, userId: string, dto: ImportStockDto, ctx: BranchContext) {
        const dry = !!dto.dryRun;
        const res = { dryRun: dry, updated: 0, unchanged: 0, errors: [] as RowError[], totalQuantityChange: 0 };

        const [products, warehouses] = await this.prisma.$transaction(async (tx) => [
            await tx.product.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, sku: true, unitId: true, purchasePrice: true, isService: true, name: true } }),
            await tx.warehouse.findMany({ where: { tenantId, isActive: true } }),
        ] as const);
        const bySku = new Map(products.map((p) => [p.sku.toLowerCase(), p]));
        const codes = await this.prisma.productCode.findMany({ where: { tenantId, product: { deletedAt: null } }, select: { codeNorm: true, productId: true } });
        const byId = new Map(products.map((p) => [p.id, p]));
        const byNorm = new Map<string, string | null>(); // null = مبهم (چند کالا)
        codes.forEach((c) => byNorm.set(c.codeNorm, byNorm.has(c.codeNorm) ? null : c.productId));
        const whMap = new Map<string, (typeof warehouses)[number]>();
        warehouses.forEach((w) => { whMap.set(norm(w.name), w); whMap.set(norm(w.code), w); });

        let defaultWh = null as (typeof warehouses)[number] | null;
        if (dto.warehouseId) defaultWh = await resolveWarehouse(this.prisma, tenantId, ctx.activeId, dto.warehouseId);
        else defaultWh = await resolveWarehouse(this.prisma, tenantId, ctx.activeId).catch(() => null);

        const allowed = (w: { branchId: string | null }) => (w.branchId ? ctx.allowedIds.includes(w.branchId) : ctx.unrestricted);
        const seen = new Set<string>();
        const occurrences = new Map<string, number>();

        for (let i = 0; i < dto.rows.length; i++) {
            const row = dto.rows[i]; const rowNo = i + 1;
            const fail = (message: string) => res.errors.push({ row: rowNo, key: row.code, message });
            const p = bySku.get(row.code.trim().toLowerCase()) ?? (() => { const id = byNorm.get(normalizeCode(row.code)); return id ? byId.get(id) : undefined; })();
            if (!p) { fail(byNorm.get(normalizeCode(row.code)) === null ? 'این شماره به چند کالا تعلق دارد؛ از «کد کالا» استفاده کنید' : 'کالا پیدا نشد (ابتدا کالاها را وارد کنید)'); continue; }
            if (p.isService) { fail('کالای خدماتی موجودی ندارد'); continue; }
            const wh = row.warehouse ? whMap.get(norm(row.warehouse)) : defaultWh;
            if (!wh) { fail(row.warehouse ? `انبار «${row.warehouse}» پیدا نشد` : 'انبار مشخص نیست'); continue; }
            if (!allowed(wh)) { fail(`به انبار «${wh.name}» دسترسی ندارید`); continue; }
            // یک کالا با چند قیمت خرید = چند ردیف موجودی جدا (خطای تکراری نیست و با هم ادغام نمی‌شوند)
            const cost = Math.round((row.unitCost ?? Number(p.purchasePrice)) * 100) / 100;
            const dupKey = `${p.id}|${wh.id}|${cost}`;
            // «تنظیم موجودی» برای یک کالا با یک قیمت فقط یک بار معنی دارد؛ «افزودن» چندباره (فاکتورهای متعدد) مجاز است
            if (dto.mode === 'SET' && seen.has(dupKey)) { fail('این کالا با همین قیمت برای همین انبار در فایل تکراری است'); continue; }
            seen.add(dupKey);

            try {
                // ورود دوباره‌ی همان فایل فاکتور نباید موجودی را دو برابر کند: ردیفی با همان کالا، انبار، توضیح (شماره‌ی فاکتور) و تعداد
                // که قبلاً وارد شده، «بدون تغییر» حساب می‌شود (n‌امین ردیف مشابه فقط وقتی رد می‌شود که n ورود قبلی هم باشد)
                if (dto.mode === 'ADD' && row.note?.trim()) {
                    const note = row.note.trim();
                    const key = `${p.id}|${wh.id}|${note}|${row.quantity}`;
                    const nth = (occurrences.get(key) ?? 0) + 1; occurrences.set(key, nth);
                    const already = await this.prisma.inventoryTransaction.count({ where: { tenantId, productId: p.id, warehouseId: wh.id, referenceType: 'import', notes: note, quantity: row.quantity, unitCost: cost } });
                    if (nth <= already) { res.unchanged++; continue; }
                }
                // موجودیِ فعلیِ همین قیمت (نه جمع همه‌ی قیمت‌ها)
                const cur = await this.prisma.inventoryLot.findUnique({ where: { productId_warehouseId_unitCost: { productId: p.id, warehouseId: wh.id, unitCost: cost } } });
                const have = Number(cur?.quantity ?? 0);
                const delta = dto.mode === 'SET' ? row.quantity - have : row.quantity;
                if (delta === 0) { res.unchanged++; continue; }
                if (!dry) {
                    await this.prisma.$transaction((tx) => this.inventory.applyMovement(tx, {
                        tenantId, userId, productId: p.id, warehouseId: wh.id,
                        type: delta > 0 ? 'ADJUSTMENT_INCREASE' : 'ADJUSTMENT_DECREASE', direction: delta > 0 ? 'IN' : 'OUT', quantity: Math.abs(delta),
                        unitId: p.unitId, unitCost: cost, lotCost: delta < 0 ? cost : undefined,
                        referenceType: 'import', supplierName: row.supplier?.trim() || undefined,
                        notes: row.note?.trim() || (dto.mode === 'ADD' ? 'ورود موجودی از فایل' : 'موجودی اول دوره (انتقال از نرم‌افزار قبلی)'),
                    }));
                }
                res.updated++; res.totalQuantityChange += delta;
            } catch (e) {
                fail((e as Error).message || 'خطا در ثبت');
            }
        }
        if (!dry && res.updated > 0) await this.log(tenantId, userId, 'stock', dto, { created: 0, updated: res.updated, skipped: res.unchanged, failed: res.errors.length }, { mode: dto.mode });
        return res;
    }

    assertRows(n: number) { if (!n) throw new BadRequestException('فایل خالی است'); }
}
