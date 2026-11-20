import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma, TransactionType, InventoryTransaction } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { StockCountDto } from './dto/stock-count.dto';
import { TransferInventoryDto } from './dto/transfer.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { buildMeta } from '../../common/dto/pagination.dto';
import { resolveWarehouse } from '../../common/utils/branch.util';
import { BranchContext, branchFilter } from '../../common/branch.context';

/** کاربر فقط با انبارهای شعبه‌های مجاز خودش می‌تواند کار کند */
export function assertWarehouseAllowed(w: { branchId: string | null; name: string }, ctx: BranchContext) {
    const ok = w.branchId ? ctx.allowedIds.includes(w.branchId) : ctx.unrestricted;
    if (!ok) throw new ForbiddenException(`به انبار «${w.name}» دسترسی ندارید`);
}

export interface MovementInput {
    tenantId: string;
    userId: string;
    productId: string;
    warehouseId: string;
    type: TransactionType;
    /** مقدار مثبت؛ جهت حرکت از روی direction تعیین می‌شود */
    quantity: number;
    direction: 'IN' | 'OUT';
    unitId: string;
    unitCost: number;
    referenceType?: string;
    referenceId?: string;
    referenceItemId?: string;
    /** ورود: تأمین‌کننده‌ی این ورود (روی ردیف قیمت نمایش داده می‌شود) */
    supplierName?: string;
    notes?: string;
    /** خروج: از همین ردیف قیمت (InventoryLot) کم شود */
    lotId?: string;
    /** خروج: از ردیفی که با همین قیمت خرید وارد شده کم شود (لغو/برگشت خرید) */
    lotCost?: number;
    /** خروج بدون ردیف مشخص: AVERAGE = بهای میانگین موزون؛ وگرنه قدیمی‌ترین ردیف اول (FIFO) */
    costMethod?: 'AVERAGE';
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

@Injectable()
export class InventoryService {
    constructor(private prisma: PrismaService) { }

    /**
     * یک حرکت انبار را داخل تراکنش اعمال می‌کند.
     * خروج با شرط «موجودی کافی» در خود دستور آپدیت انجام می‌شود تا با درخواست‌های هم‌زمان هم موجودی منفی نشود.
     */
    async applyMovement(tx: Prisma.TransactionClient, m: MovementInput) {
        const qty = m.quantity;
        if (!(qty > 0)) throw new BadRequestException('مقدار باید بیشتر از صفر باشد');

        // هر ردیف حرکت: چه مقدار با چه بهایی (ورود = یک ردیف؛ خروج = یک ردیف برای هر قیمتِ مصرف‌شده)
        let parts: { cost: number; qty: number }[];

        if (m.direction === 'OUT') {
            const res = await tx.inventory.updateMany({
                where: { productId: m.productId, warehouseId: m.warehouseId, availableQuantity: { gte: qty } },
                data: { quantity: { decrement: qty }, availableQuantity: { decrement: qty } },
            });
            if (res.count === 0) {
                const product = await tx.product.findUnique({ where: { id: m.productId }, select: { name: true } });
                const inv = await tx.inventory.findUnique({
                    where: { productId_warehouseId: { productId: m.productId, warehouseId: m.warehouseId } },
                });
                throw new BadRequestException(
                    `موجودی «${product?.name ?? ''}» کافی نیست (موجود: ${Number(inv?.availableQuantity ?? 0)}، درخواست: ${qty})`,
                );
            }
            parts = await this.consumeLots(tx, m);
        } else {
            const cost = r2(m.unitCost);
            await tx.inventory.upsert({
                where: { productId_warehouseId: { productId: m.productId, warehouseId: m.warehouseId } },
                create: { tenantId: m.tenantId, productId: m.productId, warehouseId: m.warehouseId, quantity: qty, availableQuantity: qty },
                update: { quantity: { increment: qty }, availableQuantity: { increment: qty } },
            });
            // هر قیمت خرید یک ردیف جدا؛ همان قیمت دوباره بیاید فقط به همان ردیف اضافه می‌شود.
            // اگر آن ردیف تمام شده بود، این ورودِ تازه است و در نوبتِ فروش (قدیمی‌ترین اول) آخر می‌ایستد
            await tx.inventoryLot.updateMany({ where: { productId: m.productId, warehouseId: m.warehouseId, unitCost: cost, quantity: { lte: 0 } }, data: { createdAt: new Date() } });
            await tx.inventoryLot.upsert({
                where: { productId_warehouseId_unitCost: { productId: m.productId, warehouseId: m.warehouseId, unitCost: cost } },
                create: { tenantId: m.tenantId, productId: m.productId, warehouseId: m.warehouseId, unitCost: cost, quantity: qty, supplierName: m.supplierName || null },
                update: { quantity: { increment: qty }, ...(m.supplierName ? { supplierName: m.supplierName } : {}) },
            });
            parts = [{ cost, qty }];
        }

        const txns: InventoryTransaction[] = [];
        for (const p of parts) {
            txns.push(await tx.inventoryTransaction.create({
                data: {
                    tenantId: m.tenantId,
                    productId: m.productId,
                    warehouseId: m.warehouseId,
                    transactionType: m.type,
                    quantity: m.direction === 'IN' ? p.qty : -p.qty,
                    unitId: m.unitId,
                    unitCost: p.cost,
                    totalCost: Math.round(p.cost * p.qty),
                    referenceType: m.referenceType,
                    referenceId: m.referenceId,
                    referenceItemId: m.referenceItemId,
                    notes: m.notes,
                    createdBy: m.userId,
                },
            }));
        }
        return txns;
    }

    /** مقدار خروج را از ردیف‌های قیمت کم می‌کند و بهای هر بخش را برمی‌گرداند */
    private async consumeLots(tx: Prisma.TransactionClient, m: MovementInput): Promise<{ cost: number; qty: number }[]> {
        const qty = m.quantity;
        const take = async (id: string, q: number) => {
            const r = await tx.inventoryLot.updateMany({ where: { id, quantity: { gte: q } }, data: { quantity: { decrement: q } } });
            if (r.count === 0) throw new BadRequestException('موجودی این قیمت کافی نیست یا هم‌زمان تغییر کرد؛ دوباره تلاش کنید');
        };

        if (m.lotId || m.lotCost !== undefined) {
            const lot = await tx.inventoryLot.findFirst({
                where: m.lotId
                    ? { id: m.lotId, productId: m.productId, warehouseId: m.warehouseId }
                    : { productId: m.productId, warehouseId: m.warehouseId, unitCost: r2(m.lotCost!) },
            });
            if (!lot) throw new BadRequestException('ردیف قیمت انتخاب‌شده در این انبار پیدا نشد');
            if (Number(lot.quantity) < qty) throw new BadRequestException(`موجودیِ این قیمت (${Number(lot.quantity)}) از مقدار درخواستی (${qty}) کمتر است`);
            await take(lot.id, qty);
            return [{ cost: Number(lot.unitCost), qty }];
        }

        const lots = await tx.inventoryLot.findMany({
            where: { productId: m.productId, warehouseId: m.warehouseId, quantity: { gt: 0 } }, orderBy: { createdAt: 'asc' },
        });
        const layers: { id: string | null; cost: number; q: number }[] = lots.map((l) => ({ id: l.id, cost: Number(l.unitCost), q: Number(l.quantity) }));
        const have = layers.reduce((s, l) => s + l.q, 0);
        // shortcut: موجودیِ قدیمی که هنوز ردیف قیمت ندارد (قبل از اجرای 004_inventory_lots_backfill.sql) با بهای ورودی حساب می‌شود
        if (have < qty) layers.push({ id: null, cost: m.unitCost, q: r4(qty - have) });

        const out: { layer: (typeof layers)[number]; t: number }[] = [];
        if (m.costMethod === 'AVERAGE') {
            const total = layers.reduce((s, l) => s + l.q, 0);
            let left = qty;
            layers.forEach((l, i) => { const t = i === layers.length - 1 ? left : Math.min(left, r4((qty * l.q) / total)); left = r4(left - t); if (t > 0) out.push({ layer: l, t }); });
        } else {
            let left = qty;
            for (const l of layers) { if (left <= 0) break; const t = Math.min(left, l.q); left = r4(left - t); out.push({ layer: l, t }); }
        }
        for (const o of out) if (o.layer.id) await take(o.layer.id, o.t);

        if (m.costMethod === 'AVERAGE') return [{ cost: Math.round(out.reduce((s, o) => s + o.layer.cost * o.t, 0) / qty), qty }];
        return out.map((o) => ({ cost: o.layer.cost, qty: o.t }));
    }

    async getInventory(tenantId: string, ctx: BranchContext, productId?: string, warehouseId?: string) {
        const rows = await this.prisma.inventory.findMany({
            where: {
                warehouse: { tenantId, AND: [branchFilter(ctx)] },
                product: { deletedAt: null },
                ...(productId ? { productId } : {}),
                ...(warehouseId ? { warehouseId } : {}),
            },
            include: {
                product: { select: { id: true, sku: true, name: true, salePrice: true, purchasePrice: true, minStock: true, location: true, unit: { select: { name: true } } } },
                warehouse: { select: { id: true, name: true, code: true, branchId: true } },
            },
            orderBy: { product: { name: 'asc' } },
        });
        // هر ردیف موجودی + ردیف‌های قیمتش (یک کالا با چند قیمت خرید)
        const lots = await this.prisma.inventoryLot.findMany({
            where: { tenantId, quantity: { gt: 0 }, productId: { in: rows.map((r) => r.productId) }, ...(warehouseId ? { warehouseId } : {}) },
            select: { id: true, productId: true, warehouseId: true, unitCost: true, quantity: true, supplierName: true }, orderBy: { createdAt: 'asc' },
        });
        return rows.map((r) => ({ ...r, lots: lots.filter((l) => l.productId === r.productId && l.warehouseId === r.warehouseId) }));
    }

    /** ردیف‌های قیمتِ موجود یک کالا برای انتخاب هنگام فروش؛ انبار مشخص‌نشده = انبار پیش‌فرض شعبه */
    async getLots(tenantId: string, ctx: BranchContext, productId: string, warehouseId?: string) {
        const wh = await resolveWarehouse(this.prisma, tenantId, ctx.activeId, warehouseId);
        assertWarehouseAllowed(wh, ctx);
        const lots = await this.prisma.inventoryLot.findMany({
            where: { tenantId, productId, warehouseId: wh.id, quantity: { gt: 0 } },
            select: { id: true, unitCost: true, quantity: true, supplierName: true }, orderBy: { createdAt: 'asc' },
        });
        return { warehouseId: wh.id, lots };
    }

    /** همه‌ی ردیف‌های قیمتِ یک انبار در یک درخواست (برای ذخیره‌ی آفلاین فروش سریع) */
    async getAllLots(tenantId: string, ctx: BranchContext, warehouseId?: string) {
        const wh = await resolveWarehouse(this.prisma, tenantId, ctx.activeId, warehouseId);
        assertWarehouseAllowed(wh, ctx);
        const lots = await this.prisma.inventoryLot.findMany({
            where: { tenantId, warehouseId: wh.id, quantity: { gt: 0 }, product: { deletedAt: null } },
            select: { id: true, productId: true, unitCost: true, quantity: true }, orderBy: { createdAt: 'asc' }, take: 50000,
        });
        return { warehouseId: wh.id, lots };
    }

    async adjustInventory(tenantId: string, userId: string, dto: AdjustInventoryDto, ctx: BranchContext) {
        const [warehouse, product] = await this.prisma.$transaction(async (tx) => [
            await tx.warehouse.findFirst({ where: { id: dto.warehouseId, tenantId } }),
            await tx.product.findFirst({ where: { id: dto.productId, tenantId, deletedAt: null } }),
        ] as const);
        if (!warehouse) throw new NotFoundException('انبار پیدا نشد');
        assertWarehouseAllowed(warehouse, ctx);
        if (!product) throw new NotFoundException('کالا پیدا نشد');
        if (product.isService) throw new BadRequestException('کالای خدماتی موجودی ندارد');

        return this.prisma.$transaction(async (tx) => {
            const [transaction] = await this.applyMovement(tx, {
                tenantId, userId, productId: product.id, warehouseId: warehouse.id,
                type: dto.transactionType,
                direction: dto.transactionType === 'ADJUSTMENT_INCREASE' ? 'IN' : 'OUT',
                quantity: dto.quantity,
                unitId: product.unitId,
                unitCost: dto.unitCost ?? Number(product.purchasePrice),
                referenceType: 'adjustment',
                notes: dto.notes,
            });
            const inventory = await tx.inventory.findUniqueOrThrow({
                where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
            });
            return { transaction, inventory };
        });
    }

    async transfer(tenantId: string, userId: string, dto: TransferInventoryDto, ctx: BranchContext) {
        if (dto.fromWarehouseId === dto.toWarehouseId) throw new BadRequestException('انبار مبدأ و مقصد یکی است');

        const [from, to, product] = await this.prisma.$transaction(async (tx) => [
            await tx.warehouse.findFirst({ where: { id: dto.fromWarehouseId, tenantId } }),
            await tx.warehouse.findFirst({ where: { id: dto.toWarehouseId, tenantId } }),
            await tx.product.findFirst({ where: { id: dto.productId, tenantId, deletedAt: null } }),
        ] as const);
        if (!from || !to) throw new NotFoundException('انبار پیدا نشد');
        assertWarehouseAllowed(from, ctx);
        assertWarehouseAllowed(to, ctx);
        if (!product) throw new NotFoundException('کالا پیدا نشد');

        const base = {
            tenantId, userId, productId: product.id, unitId: product.unitId,
            unitCost: Number(product.purchasePrice), quantity: dto.quantity,
            referenceType: 'transfer', notes: dto.notes ?? `انتقال از ${from.name} به ${to.name}`,
        };
        return this.prisma.$transaction(async (tx) => {
            const outs = await this.applyMovement(tx, { ...base, warehouseId: from.id, type: 'TRANSFER_OUT', direction: 'OUT' });
            // هر قیمتی که از مبدأ خارج شد با همان قیمت وارد مقصد می‌شود
            for (const o of outs) await this.applyMovement(tx, { ...base, quantity: -Number(o.quantity), unitCost: Number(o.unitCost), warehouseId: to.id, type: 'TRANSFER_IN', direction: 'IN' });
            return { transferred: dto.quantity, from: from.name, to: to.name };
        });
    }

    async performStockCount(tenantId: string, userId: string, dto: StockCountDto, ctx: BranchContext) {
        const now = new Date();
        return this.prisma.$transaction(async (tx) => {
            const results: any[] = [];

            for (const item of dto.items) {
                const [product, warehouse] = await Promise.all([
                    tx.product.findFirst({ where: { id: item.productId, tenantId, deletedAt: null } }),
                    tx.warehouse.findFirst({ where: { id: item.warehouseId, tenantId } }),
                ]);
                if (!product || !warehouse) throw new NotFoundException('کالا یا انبار پیدا نشد');
                assertWarehouseAllowed(warehouse, ctx);

                // با lotId: شمارش همان قیمت؛ اختلاف فقط به/از همان ردیف قیمت می‌رود
                const lot = item.lotId ? await tx.inventoryLot.findFirst({ where: { id: item.lotId, productId: item.productId, warehouseId: item.warehouseId } }) : null;
                if (item.lotId && !lot) throw new NotFoundException('ردیف قیمت پیدا نشد');
                const inventory = await tx.inventory.findUnique({
                    where: { productId_warehouseId: { productId: item.productId, warehouseId: item.warehouseId } },
                });
                const previous = Number(lot ? lot.quantity : inventory?.quantity ?? 0);
                const difference = item.countedQuantity - previous;

                if (difference !== 0) {
                    await this.applyMovement(tx, {
                        tenantId, userId, productId: product.id, warehouseId: warehouse.id,
                        type: difference > 0 ? 'ADJUSTMENT_INCREASE' : 'ADJUSTMENT_DECREASE',
                        direction: difference > 0 ? 'IN' : 'OUT',
                        quantity: Math.abs(difference),
                        unitId: product.unitId, unitCost: lot ? Number(lot.unitCost) : Number(product.purchasePrice), lotId: lot?.id,
                        referenceType: 'stock-count', notes: dto.notes || 'انبارگردانی',
                    });
                }
                await tx.inventory.update({
                    where: { productId_warehouseId: { productId: item.productId, warehouseId: item.warehouseId } },
                    data: { lastCountedAt: now },
                });
                results.push({
                    productId: product.id, productName: product.name, warehouseId: warehouse.id, lotId: lot?.id,
                    previousQuantity: previous, countedQuantity: item.countedQuantity, difference,
                });
            }
            return results;
        });
    }

    async getTransactions(tenantId: string, q: QueryTransactionsDto, ctx: BranchContext) {
        const { page = 1, limit = 20, productId, warehouseId, type, from, to } = q;
        const where: Prisma.InventoryTransactionWhereInput = { tenantId, warehouse: { AND: [branchFilter(ctx)] } };
        if (productId) where.productId = productId;
        if (warehouseId) where.warehouseId = warehouseId;
        if (type) where.transactionType = type;
        if (from || to) where.createdAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };

        const [data, total] = await this.prisma.$transaction(async (tx) => [
            await tx.inventoryTransaction.findMany({
                where,
                include: {
                    product: { select: { id: true, name: true, sku: true } },
                    warehouse: { select: { id: true, name: true } },
                    creator: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            await tx.inventoryTransaction.count({ where }),
        ] as const);
        return { data, meta: buildMeta(total, page, limit) };
    }

    /** کالاهایی که جمع موجودی همه انبارها از حداقل موجودی کمتر یا مساوی است (حتی اگر هیچ ردیف موجودی نداشته باشند) */
    async getLowStockItems(tenantId: string, ctx: BranchContext) {
        const products = await this.prisma.product.findMany({
            where: { tenantId, deletedAt: null, isActive: true, isService: false, minStock: { gt: 0 } },
            select: {
                id: true, sku: true, name: true, minStock: true, salePrice: true, location: true,
                unit: { select: { name: true } },
                inventory: { where: { warehouse: { AND: [branchFilter(ctx)] } }, select: { quantity: true } },
            },
        });
        return products
            .map((p) => {
                const stock = p.inventory.reduce((s, i) => s + Number(i.quantity), 0);
                const { inventory, ...rest } = p;
                return { ...rest, stock, shortage: Math.max(0, p.minStock - stock) };
            })
            .filter((p) => p.stock <= p.minStock)
            .sort((a, b) => a.stock - a.minStock - (b.stock - b.minStock));
    }

    async getInventoryValue(tenantId: string, ctx: BranchContext) {
        const rows = await this.prisma.inventory.findMany({
            where: { warehouse: { tenantId, AND: [branchFilter(ctx)] }, product: { deletedAt: null } },
            select: { quantity: true, product: { select: { purchasePrice: true, salePrice: true } } },
        });
        const lots = await this.prisma.inventoryLot.findMany({
            where: { tenantId, warehouse: { AND: [branchFilter(ctx)] }, product: { deletedAt: null }, quantity: { gt: 0 } },
            select: { quantity: true, unitCost: true },
        });
        const totalPurchaseValue = lots.reduce((s, l) => s + Number(l.quantity) * Number(l.unitCost), 0);
        const totalSaleValue = rows.reduce((s, r) => s + Number(r.quantity) * Number(r.product.salePrice), 0);
        return {
            totalPurchaseValue,
            totalSaleValue,
            potentialProfit: totalSaleValue - totalPurchaseValue,
            itemCount: rows.length,
        };
    }
}
