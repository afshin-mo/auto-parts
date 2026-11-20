import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import { CreateProformaDto, ConvertProformaDto, QueryProformasDto } from './dto/proforma.dto';
import { calculateInvoice } from '../../common/utils/invoice-calc';
import { nextInvoiceNumber } from '../../common/utils/invoice-number.util';
import { retryOnUnique } from '../../common/utils/retry.util';
import { buildMeta } from '../../common/dto/pagination.dto';
import { BranchContext, branchFilter, requireActiveBranch } from '../../common/branch.context';
import { invoiceBranchCode } from '../../common/utils/branch.util';

/** وضعیت پیش‌فاکتور: DRAFT = باز ، CONFIRMED = تبدیل‌شده به فاکتور ، CANCELLED = ابطال */
@Injectable()
export class ProformasService {
    constructor(private prisma: PrismaService, private sales: SalesService) { }

    async create(tenantId: string, userId: string, dto: CreateProformaDto, ctx: BranchContext) {
        const branchId = requireActiveBranch(ctx);
        const vatPercent = dto.vatPercent ?? 9;
        const party = dto.partyId ? await this.prisma.party.findFirst({ where: { id: dto.partyId, tenantId } }) : null;
        if (dto.partyId && !party) throw new NotFoundException('مشتری پیدا نشد');

        const ids = [...new Set(dto.items.map((i) => i.productId))];
        const products = await this.prisma.product.findMany({ where: { id: { in: ids }, tenantId, deletedAt: null } });
        const byId = new Map(products.map((p) => [p.id, p]));
        for (const id of ids) if (!byId.has(id)) throw new NotFoundException('یکی از کالاهای پیش‌فاکتور پیدا نشد');

        const calc = calculateInvoice(dto.items, { discountAmount: dto.discountAmount, vatPercent });
        const date = dto.date ? new Date(dto.date) : new Date();

        return retryOnUnique(() => this.prisma.$transaction(async (tx) => {
            const invoiceNumber = await nextInvoiceNumber(tx, tenantId, 'PROFORMA', date, await invoiceBranchCode(tx, branchId));
            return tx.invoice.create({
                data: {
                    tenantId, invoiceNumber, invoiceType: 'PROFORMA', status: 'DRAFT', date, branchId,
                    dueDate: dto.validUntil ? new Date(dto.validUntil) : new Date(date.getTime() + 7 * 86400000),
                    partyId: party?.id, partyName: party?.name ?? dto.partyName,
                    subtotal: calc.subtotal, discountAmount: calc.invoiceDiscount, vatAmount: calc.vatAmount, vatPercent,
                    totalAmount: calc.totalAmount, paidAmount: 0, remainingAmount: calc.totalAmount,
                    notes: dto.notes, createdBy: userId,
                    items: {
                        create: dto.items.map((it, i) => {
                            const p = byId.get(it.productId)!;
                            const c = calc.items[i];
                            return {
                                tenantId, productId: p.id, productName: p.name, sku: p.sku, unitId: p.unitId,
                                quantity: it.quantity, unitPrice: it.unitPrice, discountAmount: c.lineDiscount, discountPercent: it.discountPercent ?? 0,
                                vatAmount: c.vat, vatPercent, totalPrice: c.total, sortOrder: i,
                            };
                        }),
                    },
                },
                include: { items: { orderBy: { sortOrder: 'asc' } }, party: true },
            });
        }));
    }

    async findAll(tenantId: string, q: QueryProformasDto, ctx: BranchContext) {
        const { page = 1, limit = 20, state, search } = q;
        const where: Prisma.InvoiceWhereInput = { tenantId, invoiceType: 'PROFORMA', deletedAt: null, AND: [branchFilter(ctx)] };
        if (state === 'OPEN') where.status = 'DRAFT';
        if (state === 'CONVERTED') where.status = 'CONFIRMED';
        if (state === 'CANCELLED') where.status = 'CANCELLED';
        if (search) where.OR = [{ invoiceNumber: { contains: search, mode: 'insensitive' } }, { partyName: { contains: search, mode: 'insensitive' } }];
        const [data, total] = await this.prisma.$transaction(async (tx) => [
            await tx.invoice.findMany({
                where, orderBy: [{ date: 'desc' }, { invoiceNumber: 'desc' }], skip: (page - 1) * limit, take: limit,
                include: { party: { select: { id: true, name: true } }, _count: { select: { items: true } } },
            }),
            await tx.invoice.count({ where }),
        ] as const);
        return { data, meta: buildMeta(total, page, limit) };
    }

    async findOne(tenantId: string, id: string, ctx: BranchContext) {
        const inv = await this.prisma.invoice.findFirst({
            where: { id, tenantId, invoiceType: 'PROFORMA', deletedAt: null, AND: [branchFilter({ ...ctx, activeId: null })] },
            include: { party: true, creator: { select: { id: true, name: true } }, items: { include: { unit: true }, orderBy: { sortOrder: 'asc' } } },
        });
        if (!inv) throw new NotFoundException('پیش‌فاکتور پیدا نشد');
        const sale = inv.convertedToId ? await this.prisma.invoice.findUnique({ where: { id: inv.convertedToId }, select: { id: true, invoiceNumber: true } }) : null;
        return { ...inv, convertedTo: sale };
    }

    /** تبدیل به فاکتور فروش: همان قیمت‌های پیش‌فاکتور، با کنترل موجودی لحظه‌ی تبدیل */
    async convert(tenantId: string, userId: string, id: string, dto: ConvertProformaDto, ctx: BranchContext) {
        const pf = await this.prisma.invoice.findFirst({
            where: { id, tenantId, invoiceType: 'PROFORMA', deletedAt: null, AND: [branchFilter({ ...ctx, activeId: null })] }, include: { items: { orderBy: { sortOrder: 'asc' } } },
        });
        if (!pf) throw new NotFoundException('پیش‌فاکتور پیدا نشد');
        if (pf.status !== 'DRAFT') throw new BadRequestException(pf.status === 'CONFIRMED' ? 'این پیش‌فاکتور قبلاً تبدیل شده است' : 'پیش‌فاکتور باطل شده است');

        const sale = await this.sales.createSale(tenantId, userId, {
            partyId: pf.partyId ?? undefined, partyName: pf.partyId ? undefined : pf.partyName ?? undefined,
            items: pf.items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), discountPercent: Number(i.discountPercent) })),
            discountAmount: Number(pf.discountAmount) || undefined, vatPercent: Number(pf.vatPercent),
            paidAmount: dto.paidAmount ?? 0, paymentMethod: dto.paymentMethod, warehouseId: dto.warehouseId,
            date: dto.date, notes: pf.notes ?? undefined, internalNotes: `تبدیل از پیش‌فاکتور ${pf.invoiceNumber}`,
        }, ctx);
        await this.prisma.invoice.update({ where: { id }, data: { status: 'CONFIRMED', convertedToId: sale.id } });
        return sale;
    }

    async cancel(tenantId: string, id: string, ctx: BranchContext) {
        const pf = await this.prisma.invoice.findFirst({ where: { id, tenantId, invoiceType: 'PROFORMA', deletedAt: null, AND: [branchFilter({ ...ctx, activeId: null })] } });
        if (!pf) throw new NotFoundException('پیش‌فاکتور پیدا نشد');
        if (pf.status !== 'DRAFT') throw new BadRequestException('فقط پیش‌فاکتور باز قابل ابطال است');
        return this.prisma.invoice.update({ where: { id }, data: { status: 'CANCELLED' } });
    }
}
