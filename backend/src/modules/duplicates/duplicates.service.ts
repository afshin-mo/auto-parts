import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { InventoryService, assertWarehouseAllowed } from '../inventory/inventory.service';
import { BranchContext, branchFilter } from '../../common/branch.context';
import { resolveWarehouse } from '../../common/utils/branch.util';
import { normalizeCode, normalizeText } from '../../common/utils/code-normalize.util';
import { syncProductCodes } from '../products/product-codes';
import { MergeLotsDto, MergeProductsDto, RemoveLotDto } from './duplicates.dto';

const r2 = (n: number) => Math.round(n * 100) / 100;
const MANAGED = ['SKU', 'PART_NUMBER', 'OEM', 'BARCODE'] as const;

@Injectable()
export class DuplicatesService {
    constructor(private prisma: PrismaService, private inventory: InventoryService) { }

    // ───────── ۱) ردیف‌های قیمتِ یک کالا ─────────

    /** کالاهایی که در یک انبار بیش از یک ردیف قیمتِ دارای موجودی دارند */
    async lotGroups(tenantId: string, ctx: BranchContext) {
        const lots = await this.prisma.inventoryLot.findMany({
            where: { tenantId, quantity: { gt: 0 }, warehouse: { AND: [branchFilter(ctx)] }, product: { deletedAt: null } },
            select: {
                id: true, productId: true, warehouseId: true, unitCost: true, quantity: true, supplierName: true, createdAt: true,
                product: { select: { sku: true, name: true } }, warehouse: { select: { name: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
        const groups = new Map<string, typeof lots>();
        for (const l of lots) { const k = `${l.productId}|${l.warehouseId}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(l); }
        return [...groups.values()].filter((g) => g.length > 1).map((g) => {
            const qty = g.reduce((s, l) => s + Number(l.quantity), 0);
            const value = g.reduce((s, l) => s + Number(l.quantity) * Number(l.unitCost), 0);
            return {
                productId: g[0].productId, warehouseId: g[0].warehouseId, sku: g[0].product.sku, name: g[0].product.name, warehouse: g[0].warehouse.name,
                totalQuantity: qty, averageCost: r2(value / qty),
                lots: g.map((l) => ({ id: l.id, unitCost: Number(l.unitCost), quantity: Number(l.quantity), supplierName: l.supplierName, createdAt: l.createdAt })),
            };
        }).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    }

    /** ادغام چند ردیف قیمت: موجودی‌ها جمع و قیمت = میانگین موزون می‌شود (ارزش کل موجودی تقریباً ثابت می‌ماند) */
    async mergeLots(tenantId: string, ctx: BranchContext, dto: MergeLotsDto) {
        const wh = await resolveWarehouse(this.prisma, tenantId, ctx.activeId, dto.warehouseId);
        assertWarehouseAllowed(wh, ctx);
        const ids = [...new Set(dto.lotIds)];
        return this.prisma.$transaction(async (tx) => {
            let lots = await tx.inventoryLot.findMany({ where: { tenantId, productId: dto.productId, warehouseId: wh.id, id: { in: ids } }, orderBy: { createdAt: 'asc' } });
            if (lots.length !== ids.length || lots.length < 2) throw new BadRequestException('حداقل دو ردیف قیمتِ معتبر از همین کالا و انبار انتخاب کنید');
            let qty = lots.reduce((s, l) => s + Number(l.quantity), 0);
            if (!(qty > 0)) throw new BadRequestException('جمع موجودی ردیف‌های انتخابی صفر است');
            let avg = r2(lots.reduce((s, l) => s + Number(l.quantity) * Number(l.unitCost), 0) / qty);
            // ردیفِ انتخاب‌نشده‌ای که دقیقاً همین قیمت میانگین را دارد هم وارد ادغام می‌شود (قیمت یکتا بماند)
            const clash = await tx.inventoryLot.findFirst({ where: { productId: dto.productId, warehouseId: wh.id, unitCost: avg, id: { notIn: ids } } });
            let target = lots[0];
            if (clash) { lots = [...lots, clash]; qty += Number(clash.quantity); target = clash; avg = Number(clash.unitCost); }
            const suppliers = new Set(lots.map((l) => l.supplierName ?? ''));
            await tx.inventoryLot.deleteMany({ where: { id: { in: lots.filter((l) => l.id !== target.id).map((l) => l.id) } } });
            await tx.inventoryLot.update({ where: { id: target.id }, data: { unitCost: avg, quantity: qty, supplierName: suppliers.size === 1 ? target.supplierName : null } });
            return { lotId: target.id, unitCost: avg, quantity: qty, merged: lots.length };
        });
    }

    /** حذف یک ردیف قیمت؛ اگر موجودی دارد، به‌صورت «کسر موجودی» در تاریخچه‌ی انبار ثبت می‌شود */
    async removeLot(tenantId: string, userId: string, ctx: BranchContext, dto: RemoveLotDto) {
        const lot = await this.prisma.inventoryLot.findFirst({ where: { id: dto.lotId, tenantId }, include: { warehouse: true, product: { select: { unitId: true } } } });
        if (!lot) throw new NotFoundException('ردیف قیمت پیدا نشد');
        assertWarehouseAllowed(lot.warehouse, ctx);
        return this.prisma.$transaction(async (tx) => {
            const qty = Number(lot.quantity);
            if (qty > 0) {
                await this.inventory.applyMovement(tx, {
                    tenantId, userId, productId: lot.productId, warehouseId: lot.warehouseId,
                    type: 'ADJUSTMENT_DECREASE', direction: 'OUT', quantity: qty, unitId: lot.product.unitId, unitCost: Number(lot.unitCost), lotId: lot.id,
                    referenceType: 'duplicate-cleanup', notes: `حذف ردیف قیمت (کالای تکراری): ${dto.reason.trim()}`,
                });
            }
            await tx.inventoryLot.delete({ where: { id: lot.id } });
            return { removedQuantity: qty };
        });
    }

    // ───────── ۲) کالاهای جداگانه‌ای که در واقع یکی‌اند ─────────

    /**
     * کاندیدهای تکراری: هم‌برند و (کد/شماره فنی/بارکد یکسان) یا (نام یکسان).
     * توجه: یک سریال با دو برند مختلف، دو کالای جداست و تکراری حساب نمی‌شود.
     */
    async productGroups(tenantId: string) {
        const products = await this.prisma.product.findMany({
            where: { tenantId, deletedAt: null },
            select: {
                id: true, sku: true, name: true, partNumber: true, brandId: true, salePrice: true, purchasePrice: true, createdAt: true,
                brand: { select: { name: true } }, inventory: { select: { quantity: true } },
                codes: { where: { type: { in: ['SKU', 'PART_NUMBER', 'BARCODE'] } }, select: { codeNorm: true } },
            },
        });
        const parent = new Map<string, string>(products.map((p) => [p.id, p.id]));
        const find = (x: string): string => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
        const reasons = new Map<string, Set<string>>();
        const seen = new Map<string, string>();
        const link = (key: string, id: string, why: string) => {
            const other = seen.get(key);
            if (other === undefined) { seen.set(key, id); return; }
            parent.set(find(id), find(other));
            for (const x of [id, other]) (reasons.get(x) ?? reasons.set(x, new Set()).get(x)!).add(why);
        };
        for (const p of products) {
            const brand = p.brandId ?? '-';
            for (const c of new Set(p.codes.map((c) => c.codeNorm))) link(`c|${brand}|${c}`, p.id, 'کد/شماره فنی یکسان');
            const n = normalizeCode(normalizeText(p.name));
            if (n.length >= 4) link(`n|${brand}|${n}`, p.id, 'نام یکسان');
        }
        const groups = new Map<string, typeof products>();
        for (const p of products) { const r = find(p.id); (groups.get(r) ?? groups.set(r, []).get(r)!).push(p); }
        return [...groups.values()].filter((g) => g.length > 1).slice(0, 200).map((g) => ({
            reasons: [...new Set(g.flatMap((p) => [...(reasons.get(p.id) ?? [])]))],
            products: g.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((p) => ({
                id: p.id, sku: p.sku, name: p.name, partNumber: p.partNumber, brand: p.brand?.name ?? null,
                stock: p.inventory.reduce((s, i) => s + Number(i.quantity), 0), salePrice: Number(p.salePrice), purchasePrice: Number(p.purchasePrice),
            })),
        }));
    }

    /** ادغام کالاها در کالای اصلی: موجودی، ردیف‌های قیمت، فاکتورها، حرکت‌های انبار، کدها و سازگاری‌ها منتقل و کالای اضافه بایگانی می‌شود */
    async mergeProducts(tenantId: string, dto: MergeProductsDto) {
        const sourceIds = [...new Set(dto.sourceIds)];
        if (sourceIds.includes(dto.targetId)) throw new BadRequestException('کالای اصلی نمی‌تواند هم‌زمان جزو کالاهای ادغام‌شونده باشد');
        return this.prisma.$transaction(async (tx) => {
            const all = await tx.product.findMany({ where: { tenantId, deletedAt: null, id: { in: [dto.targetId, ...sourceIds] } } });
            if (all.length !== sourceIds.length + 1) throw new NotFoundException('یکی از کالاها پیدا نشد یا قبلاً حذف شده است');
            const T = dto.targetId;
            const target = all.find((p) => p.id === T)!;
            const fill: Record<string, unknown> = {};

            for (const S of sourceIds) {
                const src = all.find((p) => p.id === S)!;
                for (const k of ['partNumber', 'oemCode', 'barcode', 'brandId', 'categoryId', 'taxGoodsId'] as const) {
                    if (!(target as Record<string, unknown>)[k] && !fill[k] && (src as Record<string, unknown>)[k]) fill[k] = (src as Record<string, unknown>)[k];
                }
                // کدها: کدهای کالای ادغام‌شده به کالای اصلی می‌رسند تا جستجوی کد قدیمی هنوز همین کالا را پیدا کند
                const mine = new Set((await tx.productCode.findMany({ where: { productId: T }, select: { codeNorm: true } })).map((c) => c.codeNorm));
                for (const c of await tx.productCode.findMany({ where: { productId: S } })) {
                    if (mine.has(c.codeNorm)) { await tx.productCode.delete({ where: { id: c.id } }); continue; }
                    mine.add(c.codeNorm);
                    await tx.productCode.update({ where: { id: c.id }, data: { productId: T, ...((MANAGED as readonly string[]).includes(c.type) ? { type: 'OTHER', note: `کد کالای ادغام‌شده ${src.sku}` } : {}) } });
                }
                // موجودی هر انبار + ردیف‌های قیمت (هم‌قیمت‌ها جمع می‌شوند)
                for (const inv of await tx.inventory.findMany({ where: { productId: S } })) {
                    const has = await tx.inventory.findUnique({ where: { productId_warehouseId: { productId: T, warehouseId: inv.warehouseId } } });
                    if (!has) { await tx.inventory.update({ where: { id: inv.id }, data: { productId: T } }); continue; }
                    await tx.inventory.update({ where: { id: has.id }, data: { quantity: { increment: inv.quantity }, reservedQuantity: { increment: inv.reservedQuantity }, availableQuantity: { increment: inv.availableQuantity } } });
                    await tx.inventory.delete({ where: { id: inv.id } });
                }
                for (const lot of await tx.inventoryLot.findMany({ where: { productId: S } })) {
                    const has = await tx.inventoryLot.findUnique({ where: { productId_warehouseId_unitCost: { productId: T, warehouseId: lot.warehouseId, unitCost: lot.unitCost } } });
                    if (!has) { await tx.inventoryLot.update({ where: { id: lot.id }, data: { productId: T } }); continue; }
                    await tx.inventoryLot.update({ where: { id: has.id }, data: { quantity: { increment: lot.quantity } } });
                    await tx.inventoryLot.delete({ where: { id: lot.id } });
                }
                await tx.invoiceItem.updateMany({ where: { productId: S }, data: { productId: T } });
                await tx.inventoryTransaction.updateMany({ where: { productId: S }, data: { productId: T } });
                // سازگاری با خودرو و کالاهای جایگزین
                const haveVeh = new Set((await tx.productVehicleCompatibility.findMany({ where: { productId: T }, select: { vehicleId: true } })).map((v) => v.vehicleId));
                for (const v of await tx.productVehicleCompatibility.findMany({ where: { productId: S } })) {
                    if (haveVeh.has(v.vehicleId)) await tx.productVehicleCompatibility.delete({ where: { id: v.id } });
                    else { haveVeh.add(v.vehicleId); await tx.productVehicleCompatibility.update({ where: { id: v.id }, data: { productId: T } }); }
                }
                for (const sub of await tx.productSubstitute.findMany({ where: { OR: [{ productId: S }, { substituteId: S }] } })) {
                    const a = sub.productId === S ? T : sub.productId, b = sub.substituteId === S ? T : sub.substituteId;
                    const dup = a === b || await tx.productSubstitute.findFirst({ where: { productId: a, substituteId: b, id: { not: sub.id } } });
                    if (dup) await tx.productSubstitute.delete({ where: { id: sub.id } });
                    else await tx.productSubstitute.update({ where: { id: sub.id }, data: { productId: a, substituteId: b } });
                }
                // بایگانی (نه حذف کامل): سابقه می‌ماند ولی دیگر در فهرست‌ها و جستجو نیست
                await tx.product.update({ where: { id: S }, data: { deletedAt: new Date(), isActive: false } });
            }
            const updated = Object.keys(fill).length ? await tx.product.update({ where: { id: T }, data: fill }) : target;
            await syncProductCodes(tx, tenantId, T, updated);
            return { targetId: T, merged: sourceIds.length };
        });
    }
}
