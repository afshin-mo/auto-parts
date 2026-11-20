import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, PaymentDirection, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreatePaymentDto, QueryPaymentDto } from './dto/payment.dto';
import { buildMeta } from '../../common/dto/pagination.dto';
import { BranchContext, branchFilter, requireActiveBranch } from '../../common/branch.context';

export interface RecordPaymentInput {
    tenantId: string;
    userId: string;
    direction: PaymentDirection;
    method: PaymentMethod;
    amount: number;
    partyId?: string | null;
    invoiceId?: string | null;
    /** شعبه‌ی ثبت؛ اگر خالی باشد از روی فاکتور مرتبط خوانده می‌شود */
    branchId?: string | null;
    date?: Date;
    reference?: string | null;
    notes?: string | null;
}

@Injectable()
export class PaymentsService {
    constructor(private prisma: PrismaService) { }

    /**
     * ثبت پرداخت داخل یک تراکنش:
     *  - رکورد Payment
     *  - به‌روزرسانی مبلغ پرداخت‌شده/مانده/وضعیت فاکتور
     *  - کاهش مانده‌ی طرف حساب
     */
    async record(tx: Prisma.TransactionClient, input: RecordPaymentInput) {
        const { tenantId, userId, direction, method, amount } = input;
        let partyId = input.partyId ?? null;
        let branchId = input.branchId ?? null;

        if (!(amount > 0)) throw new BadRequestException('مبلغ پرداخت باید بیشتر از صفر باشد');

        if (input.invoiceId) {
            const invoice = await tx.invoice.findFirst({ where: { id: input.invoiceId, tenantId, deletedAt: null } });
            if (!invoice) throw new NotFoundException('فاکتور پیدا نشد');
            if (invoice.status === 'CANCELLED') throw new BadRequestException('فاکتور لغو شده است');
            if (invoice.status === 'DRAFT') throw new BadRequestException('فاکتور پیش‌نویس است');
            if (partyId && invoice.partyId && partyId !== invoice.partyId) {
                throw new BadRequestException('طرف حساب با فاکتور هم‌خوانی ندارد');
            }
            partyId = partyId ?? invoice.partyId;
            branchId = branchId ?? invoice.branchId;

            const remaining = Number(invoice.remainingAmount);
            if (amount > remaining) {
                throw new BadRequestException(`مبلغ از مانده‌ی فاکتور (${remaining}) بیشتر است`);
            }
            const paid = Number(invoice.paidAmount) + amount;
            const left = Number(invoice.totalAmount) - paid;
            await tx.invoice.update({
                where: { id: invoice.id },
                data: { paidAmount: paid, remainingAmount: left, status: left <= 0 ? 'PAID' : 'PARTIALLY_PAID' },
            });
        }

        if (partyId) {
            const party = await tx.party.findFirst({ where: { id: partyId, tenantId } });
            if (!party) throw new NotFoundException('طرف حساب پیدا نشد');
            await tx.party.update({ where: { id: partyId }, data: { currentBalance: { decrement: amount } } });
        }

        return tx.payment.create({
            data: {
                tenantId, direction, method, amount, partyId, branchId,
                invoiceId: input.invoiceId ?? null,
                date: input.date ?? new Date(),
                reference: input.reference ?? null,
                notes: input.notes ?? null,
                createdBy: userId,
            },
            include: { party: { select: { id: true, name: true } }, invoice: { select: { id: true, invoiceNumber: true } } },
        });
    }

    create(tenantId: string, userId: string, dto: CreatePaymentDto, ctx: BranchContext) {
        // دریافت/پرداخت بدون فاکتور هم باید به یک شعبه (صندوق) تعلق بگیرد
        const branchId = dto.invoiceId ? undefined : requireActiveBranch(ctx);
        return this.prisma.$transaction((tx) =>
            this.record(tx, {
                tenantId, userId, branchId,
                direction: dto.direction, method: dto.method, amount: dto.amount,
                partyId: dto.partyId, invoiceId: dto.invoiceId,
                date: dto.date ? new Date(dto.date) : undefined,
                reference: dto.reference, notes: dto.notes,
            }),
        );
    }

    async findAll(tenantId: string, q: QueryPaymentDto, ctx: BranchContext) {
        const { page = 1, limit = 20, direction, method, partyId, from, to } = q;
        const where: Prisma.PaymentWhereInput = { tenantId, AND: [branchFilter(ctx)] };
        if (direction) where.direction = direction;
        if (method) where.method = method;
        if (partyId) where.partyId = partyId;
        if (from || to) where.date = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };

        const [data, total] = await this.prisma.$transaction(async (tx) => [
            await tx.payment.findMany({
                where,
                include: { party: { select: { id: true, name: true } }, invoice: { select: { id: true, invoiceNumber: true } } },
                orderBy: { date: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            await tx.payment.count({ where }),
        ] as const);
        return { data, meta: buildMeta(total, page, limit) };
    }
}
