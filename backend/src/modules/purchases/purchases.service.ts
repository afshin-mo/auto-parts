import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { PaymentsService } from '../payments/payments.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { QueryInvoicesDto, InvoicePaymentDto } from '../sales/dto/sales-query.dto';
import { calculateInvoice } from '../../common/utils/invoice-calc';
import { nextInvoiceNumber } from '../../common/utils/invoice-number.util';
import { retryOnUnique } from '../../common/utils/retry.util';
import { buildMeta } from '../../common/dto/pagination.dto';
import { BranchContext, branchFilter, requireActiveBranch } from '../../common/branch.context';
import { resolveWarehouse, invoiceBranchCode } from '../../common/utils/branch.util';

@Injectable()
export class PurchasesService {
    constructor(
        private prisma: PrismaService,
        private inventory: InventoryService,
        private payments: PaymentsService,
    ) { }

    async createPurchase(tenantId: string, userId: string, dto: CreatePurchaseDto, ctx: BranchContext) {
        const branchId = requireActiveBranch(ctx);
        const { items } = dto;
        const vatPercent = dto.vatPercent ?? 9;

        const party = dto.partyId ? await this.prisma.party.findFirst({ where: { id: dto.partyId, tenantId, isActive: true } }) : null;
        if (dto.partyId && !party) throw new NotFoundException('تأمین‌کننده پیدا نشد');
        if (party && party.partyType !== 'SUPPLIER') throw new BadRequestException('برای فاکتور خرید باید تأمین‌کننده انتخاب شود، نه مشتری');

        const warehouse = await resolveWarehouse(this.prisma, tenantId, branchId, dto.warehouseId);

        const ids = [...new Set(items.map((i) => i.productId))];
        const products = await this.prisma.product.findMany({ where: { id: { in: ids }, tenantId, deletedAt: null } });
        const byId = new Map(products.map((p) => [p.id, p]));
        for (const id of ids) if (!byId.has(id)) throw new NotFoundException('یکی از کالاهای فاکتور پیدا نشد');

        const calc = calculateInvoice(items, {
            discountPercent: dto.discountPercent, discountAmount: dto.discountAmount, vatPercent,
        });
        const total = calc.totalAmount;
        const paid = dto.paidAmount ?? 0;
        if (paid > total) throw new BadRequestException('مبلغ پرداختی از جمع فاکتور بیشتر است');
        if (!party && paid < total) throw new BadRequestException('برای خرید نسیه ابتدا تأمین‌کننده را انتخاب کنید');

        const date = dto.date ? new Date(dto.date) : new Date();
        const updatePrice = dto.updatePurchasePrice !== false;

        return retryOnUnique(() =>
            this.prisma.$transaction(async (tx) => {
                const invoiceNumber = await nextInvoiceNumber(tx, tenantId, 'PURCHASE', date, await invoiceBranchCode(tx, branchId));

                const invoice = await tx.invoice.create({
                    data: {
                        tenantId, invoiceNumber, invoiceType: 'PURCHASE', status: 'CONFIRMED', branchId, warehouseId: warehouse.id,
                        date, dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
                        partyId: party?.id, partyName: party?.name ?? dto.partyName,
                        subtotal: calc.subtotal, discountAmount: calc.invoiceDiscount,
                        discountPercent: dto.discountAmount ? 0 : dto.discountPercent ?? 0,
                        vatAmount: calc.vatAmount, vatPercent,
                        totalAmount: total, paidAmount: 0, remainingAmount: total,
                        notes: dto.notes,
                        internalNotes: dto.supplierInvoiceNumber ? `شماره فاکتور تأمین‌کننده: ${dto.supplierInvoiceNumber}` : undefined,
                        createdBy: userId,
                        items: {
                            create: items.map((it, i) => {
                                const p = byId.get(it.productId)!;
                                const c = calc.items[i];
                                return {
                                    tenantId, productId: p.id, productName: p.name, sku: p.sku, unitId: p.unitId,
                                    quantity: it.quantity, unitPrice: it.unitPrice,
                                    discountAmount: c.lineDiscount, discountPercent: it.discountPercent ?? 0,
                                    vatAmount: c.vat, vatPercent, totalPrice: c.total, sortOrder: i,
                                };
                            }),
                        },
                    },
                });

                const rows = await tx.invoiceItem.findMany({ where: { invoiceId: invoice.id }, orderBy: { sortOrder: 'asc' }, select: { id: true } });
                for (let i = 0; i < items.length; i++) {
                    const it = items[i];
                    const p = byId.get(it.productId)!;
                    if (p.isService) continue;
                    const unitCost = Math.round(calc.items[i].net / it.quantity); // قیمت خرید پس از تخفیف ردیف
                    await this.inventory.applyMovement(tx, {
                        referenceItemId: rows[i].id, supplierName: party?.name ?? dto.partyName,
                        tenantId, userId, productId: p.id, warehouseId: warehouse.id,
                        type: 'PURCHASE', direction: 'IN', quantity: it.quantity,
                        unitId: p.unitId, unitCost, referenceType: 'invoice', referenceId: invoice.id,
                    });
                    if (updatePrice) await tx.product.update({ where: { id: p.id }, data: { purchasePrice: unitCost } });
                }

                if (party) await tx.party.update({ where: { id: party.id }, data: { currentBalance: { increment: total } } });
                if (paid > 0) {
                    await this.payments.record(tx, {
                        tenantId, userId, direction: 'PAID', method: dto.paymentMethod ?? 'CASH',
                        amount: paid, partyId: party?.id, invoiceId: invoice.id, date, branchId, reference: dto.paymentReference,
                    });
                }

                return tx.invoice.findUniqueOrThrow({
                    where: { id: invoice.id },
                    include: { items: { orderBy: { sortOrder: 'asc' } }, party: true },
                });
            }),
        );
    }

    async findAll(tenantId: string, q: QueryInvoicesDto, ctx: BranchContext) {
        const { page = 1, limit = 20, status, partyId, from, to, search } = q;
        const where: Prisma.InvoiceWhereInput = { tenantId, invoiceType: 'PURCHASE', deletedAt: null, AND: [branchFilter(ctx)] };
        if (status) where.status = status;
        if (partyId) where.partyId = partyId;
        if (from || to) where.date = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
        if (search) {
            where.OR = [
                { invoiceNumber: { contains: search, mode: 'insensitive' } },
                { partyName: { contains: search, mode: 'insensitive' } },
            ];
        }
        const [data, total] = await this.prisma.$transaction(async (tx) => [
            await tx.invoice.findMany({
                where,
                include: {
                    party: { select: { id: true, name: true, code: true } },
                    creator: { select: { id: true, name: true } },
                    _count: { select: { items: true } },
                },
                orderBy: [{ date: 'desc' }, { invoiceNumber: 'desc' }],
                skip: (page - 1) * limit,
                take: limit,
            }),
            await tx.invoice.count({ where }),
        ] as const);
        return { data, meta: buildMeta(total, page, limit) };
    }

    async findOne(tenantId: string, id: string, ctx: BranchContext) {
        const invoice = await this.prisma.invoice.findFirst({
            where: { id, tenantId, invoiceType: 'PURCHASE', deletedAt: null, AND: [branchFilter({ ...ctx, activeId: null })] },
            include: {
                party: true,
                creator: { select: { id: true, name: true, phone: true } },
                items: { include: { unit: true }, orderBy: { sortOrder: 'asc' } },
                payments: { orderBy: { date: 'asc' } },
                checks: true,
            },
        });
        if (!invoice) throw new NotFoundException('فاکتور خرید پیدا نشد');
        return invoice;
    }

    addPayment(tenantId: string, userId: string, id: string, dto: InvoicePaymentDto, ctx: BranchContext) {
        return this.prisma.$transaction(async (tx) => {
            const invoice = await tx.invoice.findFirst({ where: { id, tenantId, invoiceType: 'PURCHASE', deletedAt: null, AND: [branchFilter({ ...ctx, activeId: null })] } });
            if (!invoice) throw new NotFoundException('فاکتور خرید پیدا نشد');
            return this.payments.record(tx, {
                tenantId, userId, direction: 'PAID', method: dto.method, amount: dto.amount,
                invoiceId: id, partyId: invoice.partyId, branchId: invoice.branchId,
                date: dto.date ? new Date(dto.date) : undefined, reference: dto.reference, notes: dto.notes,
            });
        });
    }

    /** لغو فاکتور خرید؛ اگر بخشی از کالا فروخته شده باشد انبار اجازه‌ی کاهش نمی‌دهد */
    async cancelPurchase(tenantId: string, userId: string, id: string, reason: string, ctx: BranchContext) {
        const invoice = await this.prisma.invoice.findFirst({ where: { id, tenantId, invoiceType: 'PURCHASE', deletedAt: null, AND: [branchFilter({ ...ctx, activeId: null })] } });
        if (!invoice) throw new NotFoundException('فاکتور خرید پیدا نشد');
        if (invoice.status === 'CANCELLED') throw new BadRequestException('فاکتور قبلاً لغو شده است');

        if (await this.prisma.invoice.count({ where: { originalInvoiceId: id, status: { not: 'CANCELLED' }, deletedAt: null } }) > 0) {
            throw new BadRequestException('برای این فاکتور برگشتی ثبت شده؛ لغو کامل ممکن نیست');
        }
        return this.prisma.$transaction(async (tx) => {
            const movements = await tx.inventoryTransaction.findMany({
                where: { tenantId, referenceType: 'invoice', referenceId: id, transactionType: 'PURCHASE' },
            });
            for (const m of movements) {
                await this.inventory.applyMovement(tx, {
                    tenantId, userId, productId: m.productId, warehouseId: m.warehouseId,
                    type: 'PURCHASE_RETURN', direction: 'OUT', quantity: Math.abs(Number(m.quantity)),
                    unitId: m.unitId, unitCost: Number(m.unitCost), lotCost: Number(m.unitCost),
                    referenceType: 'invoice', referenceId: id, notes: `لغو فاکتور خرید ${invoice.invoiceNumber}: ${reason}`,
                });
            }
            if (invoice.partyId) {
                await tx.party.update({ where: { id: invoice.partyId }, data: { currentBalance: { decrement: Number(invoice.totalAmount) } } });
            }
            return tx.invoice.update({
                where: { id },
                data: { status: 'CANCELLED', remainingAmount: 0, internalNotes: `${invoice.internalNotes ?? ''}\nلغو شد: ${reason}`.trim() },
            });
        });
    }
}
