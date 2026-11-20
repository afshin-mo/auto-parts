import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ImportProductsDto, ImportRowDto } from './dto/import-products.dto';
import { BranchContext } from '../../common/branch.context';
import { resolveWarehouse } from '../../common/utils/branch.util';
import { catalogScope } from '../../common/utils/catalog-scope.util';
import { normalizeCode, normalizeName } from '../../common/utils/code-normalize.util';
import { syncProductCodes } from './product-codes';

export interface ImportResult {
    dryRun: boolean; created: number; updated: number; skipped: number;
    errors: { row: number; sku: string; message: string }[];
    createdBrands: string[]; createdCategories: string[];
    /** ردیف‌های تکراریِ یک کالا (مثلاً چند فاکتور با قیمت‌های مختلف) که با ردیف اول ادغام شدند؛ خطا نیستند */
    merged: number;
}

const norm = (s?: string | null) => normalizeName(s ?? '').toLowerCase();

/**
 * یک کالا در فایل فاکتور می‌تواند چندبار و با قیمت‌های مختلف بیاید (خرید نقدی و اعتباری)، پس تکرار خطا نیست:
 * ردیف‌های هم‌کد در یک ردیف ادغام می‌شوند؛ تعداد اولیه جمع می‌شود (ولی در `initialLots` به تفکیک قیمت می‌ماند)، قیمت کالا از آخرین ردیف می‌آید و بقیه‌ی فیلدها از اولین
 * مقدار پُر. `origin` شماره‌ی ردیف اولِ هر کالا در فایل است تا خطاها به ردیف درست اشاره کنند.
 */
/** موجودی اولیه‌ی هر ردیف را با قیمت خودش نگه می‌دارد؛ هم‌قیمت‌ها جمع می‌شوند، قیمت‌های مختلف ردیف جدا می‌مانند */
function addLot(base: Record<string, unknown>, row: Record<string, unknown>) {
    const qty = Number(row.initialQuantity ?? 0);
    if (!(qty > 0)) return;
    const cost = Number(row.purchasePrice ?? base.purchasePrice ?? 0);
    const lots = ((base.initialLots as { cost: number; quantity: number }[] | undefined) ??= []);
    const l = lots.find((x) => x.cost === cost);
    if (l) l.quantity += qty; else lots.push({ cost, quantity: qty });
}

export function mergeDuplicateRows(rows: ImportRowDto[]): { rows: ImportRowDto[]; origin: number[]; merged: number } {
    const at = new Map<string, number>();
    const out: Record<string, unknown>[] = []; const origin: number[] = []; let merged = 0;
    rows.forEach((r, i) => {
        const key = r.sku.trim().toLowerCase();
        const found = at.get(key);
        if (found === undefined) { at.set(key, out.length); const first: Record<string, unknown> = { ...r }; addLot(first, first); out.push(first); origin.push(i + 1); return; }
        merged++;
        const base = out[found];
        const row = r as unknown as Record<string, unknown>;
        addLot(base, row);
        for (const k of ['purchasePrice', 'salePrice', 'wholesalePrice']) if (row[k] !== undefined) base[k] = row[k];
        if (row.initialQuantity !== undefined) base.initialQuantity = Number(base.initialQuantity ?? 0) + Number(row.initialQuantity);
        for (const [k, v] of Object.entries(row)) if ((base[k] === undefined || base[k] === '') && v !== undefined && v !== '') base[k] = v;
    });
    return { rows: out as unknown as ImportRowDto[], origin, merged };
}

@Injectable()
export class ProductsImportService {
    constructor(private prisma: PrismaService) { }

    /** خروجی همه‌ی کالاها به‌صورت سطرهای تخت (فرانت آن را CSV می‌کند) */
    async exportAll(tenantId: string) {
        const rows = await this.prisma.product.findMany({
            where: { tenantId, deletedAt: null }, orderBy: { sku: 'asc' }, take: 20000,
            include: { category: { select: { name: true } }, brand: { select: { name: true } }, unit: { select: { name: true } }, inventory: { select: { quantity: true } } },
        });
        return rows.map((p) => ({
            sku: p.sku, name: p.name, unit: p.unit.name, category: p.category?.name ?? '', brand: p.brand?.name ?? '',
            purchasePrice: Number(p.purchasePrice), salePrice: Number(p.salePrice), wholesalePrice: p.wholesalePrice ? Number(p.wholesalePrice) : '',
            minStock: p.minStock, stock: p.inventory.reduce((s, i) => s + Number(i.quantity), 0),
            oemCode: p.oemCode ?? '', partNumber: p.partNumber ?? '', barcode: p.barcode ?? '', location: p.location ?? '', warrantyMonths: p.warrantyMonths ?? '', taxGoodsId: p.taxGoodsId ?? '',
        }));
    }

    async importRows(tenantId: string, userId: string, dto: ImportProductsDto, ctx?: BranchContext): Promise<ImportResult> {
        const dry = !!dto.dryRun;
        const res: ImportResult = { dryRun: dry, created: 0, updated: 0, skipped: 0, errors: [], createdBrands: [], createdCategories: [], merged: 0 };
        const { rows, origin, merged } = mergeDuplicateRows(dto.rows);
        res.merged = merged;

        const scope = { AND: [catalogScope(tenantId)] };
        const [units, cats, brands, existing, tenant, warehouse, count, allWh] = await Promise.all([
            this.prisma.unit.findMany({ where: scope }),
            this.prisma.category.findMany({ where: scope }),
            this.prisma.brand.findMany({ where: { kind: 'PART', ...scope } }),
            this.prisma.product.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, sku: true } }),
            this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
            resolveWarehouse(this.prisma, tenantId, ctx?.activeId ?? null).catch(() => null),
            this.prisma.product.count({ where: { tenantId, deletedAt: null } }),
            this.prisma.warehouse.findMany({ where: { tenantId, isActive: true } }),
        ]);
        const whMap = new Map<string, (typeof allWh)[number]>();
        allWh.forEach((w) => { whMap.set(norm(w.name), w); whMap.set(norm(w.code), w); });

        const unitMap = new Map<string, string>();
        units.forEach((u) => { unitMap.set(norm(u.name), u.id); unitMap.set(norm(u.code), u.id); });
        const defaultUnit = unitMap.get('عدد') ?? units[0]?.id;
        const catMap = new Map(cats.map((c) => [norm(c.name), c.id]));
        const brandMap = new Map(brands.map((b) => [norm(b.name), b.id]));
        const skuMap = new Map(existing.map((p) => [p.sku.toLowerCase(), p.id]));
        let room = tenant.maxProducts - count;
        let seq = 0;

        const resolveBrand = async (name?: string) => {
            if (!name?.trim()) return undefined;
            const k = norm(name);
            if (brandMap.has(k)) return brandMap.get(k);
            if (dry) { brandMap.set(k, 'dry'); res.createdBrands.push(name.trim()); return undefined; }
            const b = await this.prisma.brand.create({ data: { name: normalizeName(name), code: `${tenantId.slice(0, 6)}:imp-${Date.now().toString(36)}-${++seq}`, kind: 'PART', tenantId } });
            brandMap.set(k, b.id); res.createdBrands.push(b.name); return b.id;
        };
        const resolveCategory = async (name?: string) => {
            if (!name?.trim()) return undefined;
            const k = norm(name);
            if (catMap.has(k)) return catMap.get(k);
            if (dry) { catMap.set(k, 'dry'); res.createdCategories.push(name.trim()); return undefined; }
            const c = await this.prisma.category.create({ data: { name: normalizeName(name), code: `${tenantId.slice(0, 6)}:imp-${Date.now().toString(36)}-${++seq}`, level: 1, tenantId } });
            catMap.set(k, c.id); res.createdCategories.push(c.name); return c.id;
        };

        for (let i = 0; i < rows.length; i++) {
            const row: ImportRowDto = rows[i];
            const rowNo = origin[i];
            const fail = (message: string) => res.errors.push({ row: rowNo, sku: row.sku, message });
            const key = row.sku.trim().toLowerCase();

            const existingId = skuMap.get(key);

            try {
                if (existingId) {
                    // کد از قبل هست: تعدادِ فایل همیشه «ورودِ جدید» است (با قیمت همین ردیف، جدا از ورودهای قبلی)؛ بازنویسی موجودی هرگز
                    const hasStock = !!(row.initialQuantity && row.initialQuantity > 0);
                    if (!dto.updateExisting && !hasStock) { res.skipped++; continue; }
                    const data: Record<string, unknown> = {};
                    if (dto.updateExisting) {
                        if (row.name) data.name = normalizeName(row.name);
                        for (const k of ['purchasePrice', 'salePrice', 'wholesalePrice', 'minStock', 'warrantyMonths'] as const) if (row[k] !== undefined) data[k] = row[k];
                        for (const k of ['oemCode', 'partNumber', 'barcode', 'location', 'taxGoodsId'] as const) if (row[k]) data[k] = row[k];
                        if (row.unit) { const u = unitMap.get(norm(row.unit)); if (!u) { fail(`واحد «${row.unit}» تعریف نشده است`); continue; } data.unitId = u; }
                        const brandId = await resolveBrand(row.brand); if (brandId) data.brandId = brandId;
                        const categoryId = await resolveCategory(row.category); if (categoryId) data.categoryId = categoryId;
                    }
                    const wh = row.warehouse ? whMap.get(norm(row.warehouse)) : warehouse;
                    if (hasStock && row.warehouse && !wh) throw new Error(`انبار «${row.warehouse}» پیدا نشد`);
                    if (!dry) {
                        await this.prisma.$transaction(async (tx) => {
                            if (dto.updateExisting) {
                                const up = await tx.product.update({ where: { id: existingId }, data });
                                await syncProductCodes(tx, tenantId, existingId as string, up);
                                await this.extraCodes(tx, tenantId, existingId as string, row.altCodes);
                            }
                            if (hasStock && wh) {
                                const prod = await tx.product.findUniqueOrThrow({ where: { id: existingId }, select: { unitId: true, purchasePrice: true } });
                                const lots = (row as { initialLots?: { cost: number; quantity: number }[] }).initialLots ?? [{ cost: row.purchasePrice ?? Number(prod.purchasePrice), quantity: row.initialQuantity! }];
                                for (const l of lots) {
                                    const cost = Math.round((l.cost || Number(prod.purchasePrice)) * 100) / 100;
                                    await tx.inventory.upsert({
                                        where: { productId_warehouseId: { productId: existingId, warehouseId: wh.id } },
                                        create: { tenantId, productId: existingId, warehouseId: wh.id, quantity: l.quantity, availableQuantity: l.quantity },
                                        update: { quantity: { increment: l.quantity }, availableQuantity: { increment: l.quantity } },
                                    });
                                    // قیمت تازه = ردیف تازه؛ همان قیمتِ قبلی فقط به ردیف خودش اضافه می‌شود
                                    await tx.inventoryLot.updateMany({ where: { productId: existingId, warehouseId: wh.id, unitCost: cost, quantity: { lte: 0 } }, data: { createdAt: new Date() } });
                                    await tx.inventoryLot.upsert({
                                        where: { productId_warehouseId_unitCost: { productId: existingId, warehouseId: wh.id, unitCost: cost } },
                                        create: { tenantId, productId: existingId, warehouseId: wh.id, unitCost: cost, quantity: l.quantity },
                                        update: { quantity: { increment: l.quantity } },
                                    });
                                    await tx.inventoryTransaction.create({
                                        data: { tenantId, productId: existingId, warehouseId: wh.id, transactionType: 'ADJUSTMENT_INCREASE', quantity: l.quantity, unitId: prod.unitId, unitCost: cost, totalCost: Math.round(cost * l.quantity), referenceType: 'import', notes: 'ورود موجودی از فایل', createdBy: userId },
                                    });
                                }
                            }
                        });
                    }
                    res.updated++;
                    continue;
                }

                if (!row.name?.trim()) { fail('نام کالا خالی است'); continue; }
                const unitId = row.unit ? unitMap.get(norm(row.unit)) : defaultUnit;
                if (!unitId) { fail(row.unit ? `واحد «${row.unit}» تعریف نشده است` : 'واحد پیش‌فرض (عدد) تعریف نشده است؛ ابتدا واحدها را از «اطلاعات پایه» بسازید'); continue; }
                if (room <= 0) { fail(`سقف تعداد کالاهای طرح (${tenant.maxProducts}) پر شده است`); continue; }

                if (!dry) {
                    const brandId = await resolveBrand(row.brand); const categoryId = await resolveCategory(row.category);
                    await this.prisma.$transaction(async (tx) => {
                        const p = await tx.product.create({
                            data: {
                                tenantId, sku: row.sku.trim(), name: normalizeName(row.name!), unitId, brandId, categoryId,
                                purchasePrice: row.purchasePrice ?? 0, salePrice: row.salePrice ?? 0, wholesalePrice: row.wholesalePrice, minStock: row.minStock ?? 0,
                                warrantyMonths: row.warrantyMonths, oemCode: row.oemCode || null, partNumber: row.partNumber || null, barcode: row.barcode || null, location: row.location || null, taxGoodsId: row.taxGoodsId || null,
                            },
                        });
                        await syncProductCodes(tx, tenantId, p.id, p);
                        await this.extraCodes(tx, tenantId, p.id, row.altCodes);
                        const wh = row.warehouse ? whMap.get(norm(row.warehouse)) : warehouse;
                        if (row.warehouse && !wh) throw new Error(`انبار «${row.warehouse}» پیدا نشد`);
                        if (row.initialQuantity && row.initialQuantity > 0 && wh) {
                            await tx.inventory.create({ data: { tenantId, productId: p.id, warehouseId: wh.id, quantity: row.initialQuantity, availableQuantity: row.initialQuantity } });
                            // هر قیمت خرید یک ردیف موجودی و یک حرکت انبار جدا
                            const lots = (row as { initialLots?: { cost: number; quantity: number }[] }).initialLots ?? [{ cost: row.purchasePrice ?? 0, quantity: row.initialQuantity }];
                            for (const l of lots) {
                                await tx.inventoryLot.create({ data: { tenantId, productId: p.id, warehouseId: wh.id, unitCost: l.cost, quantity: l.quantity } });
                                await tx.inventoryTransaction.create({
                                    data: { tenantId, productId: p.id, warehouseId: wh.id, transactionType: 'ADJUSTMENT_INCREASE', quantity: l.quantity, unitId, unitCost: l.cost, totalCost: Math.round(l.cost * l.quantity), referenceType: 'import', notes: 'موجودی اولیه (ورود از فایل)', createdBy: userId },
                                });
                            }
                        }
                    });
                } else { await resolveBrand(row.brand); await resolveCategory(row.category); }
                room--; res.created++;
            } catch (e) {
                fail((e as Error).message?.includes('Unique') ? 'کد یا بارکد تکراری است' : (e as Error).message?.startsWith('انبار') ? (e as Error).message : 'خطا در ذخیره‌ی این ردیف');
            }
        }
        return res;
    }

    /** شماره‌های معادل ستون «altCodes» (جداشده با , ، ؛ |) را به‌عنوان شماره‌ی جستجوی کالا ثبت می‌کند */
    private async extraCodes(tx: Prisma.TransactionClient, tenantId: string, productId: string, raw?: string) {
        if (!raw) return;
        const parts = raw.split(/[,،;؛|]/).map((x) => x.trim()).filter(Boolean).slice(0, 20);
        for (const code of parts) {
            const codeNorm = normalizeCode(code);
            if (!codeNorm) continue;
            await tx.productCode.upsert({
                where: { productId_codeNorm: { productId, codeNorm } },
                create: { tenantId, productId, type: 'AFTERMARKET', code: code.slice(0, 100), codeNorm },
                update: {},
            });
        }
    }
}
