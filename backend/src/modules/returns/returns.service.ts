import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreateReturnDto, CreateStandaloneReturnDto, QueryReturnsDto } from './dto/return.dto';
import { calculateInvoice } from '../../common/utils/invoice-calc';
import { nextInvoiceNumber } from '../../common/utils/invoice-number.util';
import { retryOnUnique } from '../../common/utils/retry.util';
import { buildMeta } from '../../common/dto/pagination.dto';
import { BranchContext, branchFilter, requireActiveBranch } from '../../common/branch.context';
import { resolveWarehouse, invoiceBranchCode } from '../../common/utils/branch.util';

type Kind = 'sale' | 'purchase';
const BASE = { sale: 'SALE', purchase: 'PURCHASE' } as const;
const RET = { sale: 'SALE_RETURN', purchase: 'PURCHASE_RETURN' } as const;

@Injectable()
export class ReturnsService {
    constructor(private prisma: PrismaService, private inventory: InventoryService) { }

    private async returnedMap(db: Prisma.TransactionClient | PrismaService, kind: Kind, itemIds: string[]) {
        const rows = await db.invoiceItem.groupBy({
            by: ['originalItemId'],
            where: { originalItemId: { in: itemIds }, invoice: { invoiceType: RET[kind], status: { not: 'CANCELLED' }, deletedAt: null } },
            _sum: { quantity: true },
        });
        return new Map(rows.map((r) => [r.originalItemId as string, Number(r._sum.quantity ?? 0)]));
    }

    private async loadOriginal(db: Prisma.TransactionClient | PrismaService, tenantId: string, kind: Kind, id: string, ctx: BranchContext) {
        const inv = await db.invoice.findFirst({
            where: { id, tenantId, invoiceType: BASE[kind], deletedAt: null, AND: [branchFilter({ ...ctx, activeId: null })] },
            include: { items: { orderBy: { sortOrder: 'asc' } }, party: true },
        });
        if (!inv) throw new NotFoundException('فاکتور پیدا نشد');
        if (inv.status === 'CANCELLED' || inv.status === 'DRAFT') throw new BadRequestException('برای فاکتور لغوشده یا پیش‌نویس نمی‌توان برگشتی ثبت کرد');
        return inv;
    }

    /** ردیف‌های فاکتور به‌همراه مقدار قابل برگشت */
    async returnable(tenantId: string, kind: Kind, invoiceId: string, ctx: BranchContext) {
        const inv = await this.loadOriginal(this.prisma, tenantId, kind, invoiceId, ctx);
        const done = await this.returnedMap(this.prisma, kind, inv.items.map((i) => i.id));
        return {
            invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, partyName: inv.party?.name ?? inv.partyName,
            items: inv.items.map((i) => {
                const sold = Number(i.quantity), returned = done.get(i.id) ?? 0;
                return {
                    originalItemId: i.id, productId: i.productId, productName: i.productName, sku: i.sku,
                    soldQuantity: sold, returnedQuantity: returned, returnableQuantity: sold - returned,
                    unitRefund: Math.round(Number(i.totalPrice) / sold), // قیمت هر واحد با احتساب تخفیف و مالیات
                };
            }),
        };
    }

    async create(tenantId: string, userId: string, kind: Kind, invoiceId: string, dto: CreateReturnDto, ctx: BranchContext) {
        const date = dto.date ? new Date(dto.date) : new Date();

        return retryOnUnique(() => this.prisma.$transaction(async (tx) => {
            const orig = await this.loadOriginal(tx, tenantId, kind, invoiceId, ctx);
            const done = await this.returnedMap(tx, kind, orig.items.map((i) => i.id));
            const byId = new Map(orig.items.map((i) => [i.id, i]));

            const seen = new Set<string>();
            const lines = dto.items.map((l) => {
                if (seen.has(l.originalItemId)) throw new BadRequestException('یک ردیف نمی‌تواند دو بار در برگشتی بیاید');
                seen.add(l.originalItemId);
                const item = byId.get(l.originalItemId);
                if (!item) throw new BadRequestException('ردیف انتخاب‌شده متعلق به این فاکتور نیست');
                const left = Number(item.quantity) - (done.get(item.id) ?? 0);
                if (l.quantity > left + 1e-9) throw new BadRequestException(`تعداد برگشتی «${item.productName}» از مقدار قابل برگشت (${left}) بیشتر است`);
                const ratio = l.quantity / Number(item.quantity);
                const total = Math.round(Number(item.totalPrice) * ratio);
                const vat = Math.round(Number(item.vatAmount) * ratio);
                return { item, qty: l.quantity, total, vat, discount: Math.round(Number(item.discountAmount) * ratio) };
            });

            const total = lines.reduce((s, l) => s + l.total, 0);
            const vatAmount = lines.reduce((s, l) => s + l.vat, 0);
            const party = orig.party;
            const refund = dto.refundAmount ?? (party ? 0 : total);
            if (refund > total) throw new BadRequestException('مبلغ بازپرداخت از مبلغ برگشتی بیشتر است');
            if (!party && refund < total) throw new BadRequestException('برای فاکتور بدون طرف‌حساب، کل مبلغ برگشتی باید نقد تسویه شود');

            // انبار و بهای تمام‌شده از روی حرکت‌های فاکتور اصلی
            const moves = await tx.inventoryTransaction.findMany({
                where: { tenantId, referenceType: 'invoice', referenceId: orig.id, transactionType: BASE[kind] },
            });
            const defaultWh = await tx.warehouse.findFirst({ where: { tenantId, isDefault: true } });

            const invoiceNumber = await nextInvoiceNumber(tx, tenantId, RET[kind], date, await invoiceBranchCode(tx, orig.branchId));
            const ret = await tx.invoice.create({
                data: {
                    tenantId, invoiceNumber, invoiceType: RET[kind], status: refund >= total ? 'PAID' : 'CONFIRMED', date,
                    branchId: orig.branchId, warehouseId: orig.warehouseId,
                    partyId: party?.id, partyName: party?.name ?? orig.partyName,
                    subtotal: total - vatAmount, vatAmount, vatPercent: orig.vatPercent, totalAmount: total,
                    paidAmount: refund, remainingAmount: total - refund,
                    notes: dto.reason, originalInvoiceId: orig.id, createdBy: userId,
                    items: {
                        create: lines.map((l, i) => ({
                            tenantId, productId: l.item.productId, productName: l.item.productName, sku: l.item.sku, unitId: l.item.unitId,
                            quantity: l.qty, unitPrice: l.item.unitPrice, discountAmount: l.discount, discountPercent: l.item.discountPercent,
                            vatAmount: l.vat, vatPercent: l.item.vatPercent, totalPrice: l.total, sortOrder: i, originalItemId: l.item.id,
                        })),
                    },
                },
            });

            // برگشتیِ قبلیِ هر ردیف به تفکیک قیمت، تا برگشت جدید فقط به قیمت‌هایی برود که هنوز برنگشته‌اند
            const prior = await tx.inventoryTransaction.findMany({ where: { tenantId, referenceItemId: { in: orig.items.map((i) => i.id) }, transactionType: RET[kind] } });
            for (const l of lines) {
                const product = await tx.product.findUniqueOrThrow({ where: { id: l.item.productId } });
                if (product.isService) continue;
                // خودکار: کالا به همان انبار و همان قیمتی برمی‌گردد که از آن فروخته/خریده شده بود (بدون پرسیدن از کاربر)
                const mine = moves.filter((m) => (m as { referenceItemId?: string | null }).referenceItemId === l.item.id);
                const parts: { cost: number; qty: number; wh?: string }[] = [];
                let left = l.qty;
                for (const m of mine) {
                    const cost = Number(m.unitCost);
                    const back = prior.filter((r) => (r as { referenceItemId?: string | null }).referenceItemId === l.item.id && Number(r.unitCost) === cost).reduce((a, r) => a + Math.abs(Number(r.quantity)), 0);
                    const t = Math.min(left, Math.abs(Number(m.quantity)) - back);
                    if (t > 0) { parts.push({ cost, qty: t, wh: m.warehouseId }); left -= t; }
                }
                if (left > 1e-9) { // فاکتورهای قدیمی بدون پیوند ردیف
                    const mv = moves.find((m) => m.productId === product.id);
                    parts.push({ cost: mv ? Number(mv.unitCost) : Number(product.purchasePrice), qty: left, wh: mv?.warehouseId });
                }
                for (const pt of parts) {
                    await this.inventory.applyMovement(tx, {
                        tenantId, userId, productId: product.id, warehouseId: pt.wh ?? defaultWh!.id,
                        type: RET[kind], direction: kind === 'sale' ? 'IN' : 'OUT', quantity: pt.qty,
                        unitId: product.unitId, unitCost: pt.cost,
                        lotCost: kind === 'purchase' ? pt.cost : undefined,
                        referenceType: 'invoice', referenceId: ret.id, referenceItemId: l.item.id, notes: `برگشت از ${orig.invoiceNumber}: ${dto.reason}`,
                    });
                }
            }

            if (party) await tx.party.update({ where: { id: party.id }, data: { currentBalance: { decrement: total } } });
            if (refund > 0) {
                // بازپرداخت نقدی: برخلاف دریافت/پرداخت عادی، مانده‌ی طرف‌حساب را برمی‌گرداند
                await tx.payment.create({
                    data: {
                        tenantId, direction: kind === 'sale' ? 'PAID' : 'RECEIVED', method: dto.refundMethod ?? 'CASH', amount: refund, date,
                        partyId: party?.id, invoiceId: ret.id, branchId: orig.branchId, notes: `بازپرداخت برگشتی ${invoiceNumber}`, createdBy: userId,
                    },
                });
                if (party) await tx.party.update({ where: { id: party.id }, data: { currentBalance: { increment: refund } } });
            }

            return tx.invoice.findUniqueOrThrow({ where: { id: ret.id }, include: { items: { orderBy: { sortOrder: 'asc' } }, party: true } });
        }));
    }

    /**
     * برگشتی مستقل از فاکتور اصلی. چون فاکتور مرجع ندارد، قابل ارسال به سامانه مودیان نیست؛
     * مبلغ از روی قیمت واردشده و مالیات محاسبه می‌شود و بهای تمام‌شده، قیمت خرید فعلی کالاست.
     */
    async createStandalone(tenantId: string, userId: string, kind: Kind, dto: CreateStandaloneReturnDto, ctx: BranchContext) {
        const branchId = requireActiveBranch(ctx);
        const date = dto.date ? new Date(dto.date) : new Date();
        const vatPercent = dto.vatPercent ?? 9;
        const party = dto.partyId ? await this.prisma.party.findFirst({ where: { id: dto.partyId, tenantId } }) : null;
        if (dto.partyId && !party) throw new NotFoundException('طرف‌حساب پیدا نشد');
        if (party && party.partyType !== (kind === 'sale' ? 'CUSTOMER' : 'SUPPLIER')) throw new BadRequestException(kind === 'sale' ? 'برای برگشت از فروش باید مشتری انتخاب شود' : 'برای برگشت از خرید باید تأمین‌کننده انتخاب شود');

        const ids = [...new Set(dto.items.map((i) => i.productId))];
        const products = await this.prisma.product.findMany({ where: { id: { in: ids }, tenantId, deletedAt: null } });
        const byId = new Map(products.map((p) => [p.id, p]));
        for (const id of ids) if (!byId.has(id)) throw new NotFoundException('یکی از کالاها پیدا نشد');

        const warehouse = await resolveWarehouse(this.prisma, tenantId, branchId, dto.warehouseId);

        const calc = calculateInvoice(dto.items, { vatPercent });
        const total = calc.totalAmount;
        const refund = dto.refundAmount ?? (party ? 0 : total);
        if (refund > total) throw new BadRequestException('مبلغ بازپرداخت از مبلغ برگشتی بیشتر است');
        if (!party && refund < total) throw new BadRequestException('بدون طرف‌حساب، کل مبلغ برگشتی باید نقد تسویه شود');

        return retryOnUnique(() => this.prisma.$transaction(async (tx) => {
            const invoiceNumber = await nextInvoiceNumber(tx, tenantId, RET[kind], date, await invoiceBranchCode(tx, branchId));
            const ret = await tx.invoice.create({
                data: {
                    tenantId, invoiceNumber, invoiceType: RET[kind], status: refund >= total ? 'PAID' : 'CONFIRMED', date, branchId, warehouseId: warehouse.id,
                    partyId: party?.id, partyName: party?.name,
                    subtotal: calc.subtotal, discountAmount: 0, vatAmount: calc.vatAmount, vatPercent, totalAmount: total,
                    paidAmount: refund, remainingAmount: total - refund, notes: dto.reason, internalNotes: 'برگشتی مستقل (بدون فاکتور اصلی)', createdBy: userId,
                    items: {
                        create: dto.items.map((it, i) => {
                            const p = byId.get(it.productId)!; const c = calc.items[i];
                            return { tenantId, productId: p.id, productName: p.name, sku: p.sku, unitId: p.unitId, quantity: it.quantity, unitPrice: it.unitPrice, discountAmount: 0, discountPercent: 0, vatAmount: c.vat, vatPercent, totalPrice: c.total, sortOrder: i };
                        }),
                    },
                },
            });
            for (const it of dto.items) {
                const p = byId.get(it.productId)!;
                if (p.isService) continue;
                await this.inventory.applyMovement(tx, {
                    tenantId, userId, productId: p.id, warehouseId: warehouse.id, type: RET[kind], direction: kind === 'sale' ? 'IN' : 'OUT', quantity: it.quantity,
                    unitId: p.unitId, unitCost: Number(p.purchasePrice), referenceType: 'invoice', referenceId: ret.id, notes: `برگشتی مستقل: ${dto.reason}`,
                });
            }
            if (party) await tx.party.update({ where: { id: party.id }, data: { currentBalance: { decrement: total } } });
            if (refund > 0) {
                await tx.payment.create({ data: { tenantId, direction: kind === 'sale' ? 'PAID' : 'RECEIVED', method: dto.refundMethod ?? 'CASH', amount: refund, date, branchId, partyId: party?.id, invoiceId: ret.id, notes: `بازپرداخت برگشتی ${invoiceNumber}`, createdBy: userId } });
                if (party) await tx.party.update({ where: { id: party.id }, data: { currentBalance: { increment: refund } } });
            }
            return tx.invoice.findUniqueOrThrow({ where: { id: ret.id }, include: { items: { orderBy: { sortOrder: 'asc' } }, party: true } });
        }));
    }

    async findAll(tenantId: string, q: QueryReturnsDto, ctx: BranchContext) {
        const { page = 1, limit = 20, kind, search, originalInvoiceId } = q;
        const where: Prisma.InvoiceWhereInput = {
            tenantId, deletedAt: null, AND: [branchFilter(ctx)], ...(originalInvoiceId ? { originalInvoiceId } : {}),
            invoiceType: kind ? RET[kind] : { in: ['SALE_RETURN', 'PURCHASE_RETURN'] },
            ...(search ? { OR: [{ invoiceNumber: { contains: search, mode: 'insensitive' } }, { partyName: { contains: search, mode: 'insensitive' } }] } : {}),
        };
        const [data, total] = await this.prisma.$transaction(async (tx) => [
            await tx.invoice.findMany({
                where, orderBy: [{ date: 'desc' }, { invoiceNumber: 'desc' }], skip: (page - 1) * limit, take: limit,
                include: { party: { select: { id: true, name: true } }, original: { select: { id: true, invoiceNumber: true } }, _count: { select: { items: true } } },
            }),
            await tx.invoice.count({ where }),
        ] as const);
        return { data, meta: buildMeta(total, page, limit) };
    }

    async findOne(tenantId: string, id: string, ctx: BranchContext) {
        const inv = await this.prisma.invoice.findFirst({
            where: { id, tenantId, invoiceType: { in: ['SALE_RETURN', 'PURCHASE_RETURN'] }, deletedAt: null, AND: [branchFilter({ ...ctx, activeId: null })] },
            include: { party: true, original: { select: { id: true, invoiceNumber: true, invoiceType: true } }, items: { include: { unit: true }, orderBy: { sortOrder: 'asc' } }, creator: { select: { name: true } } },
        });
        if (!inv) throw new NotFoundException('فاکتور برگشتی پیدا نشد');
        return inv;
    }
}
