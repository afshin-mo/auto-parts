import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { CreateCheckDto, QueryChecksDto } from './dto/create-check.dto';
import { buildMeta } from '../../common/dto/pagination.dto';
import { BranchContext, branchFilter, requireActiveBranch } from '../../common/branch.context';

const INCLUDE = {
    party: { select: { id: true, name: true, code: true } },
    invoice: { select: { id: true, invoiceNumber: true, totalAmount: true } },
} as const;

@Injectable()
export class ChecksService {
    constructor(private prisma: PrismaService, private payments: PaymentsService) { }

    async createCheck(tenantId: string, dto: CreateCheckDto, ctx: BranchContext) {
        if (dto.partyId && !(await this.prisma.party.findFirst({ where: { id: dto.partyId, tenantId } }))) {
            throw new NotFoundException('طرف حساب پیدا نشد');
        }
        // چک مربوط به فاکتور، به شعبه‌ی همان فاکتور تعلق می‌گیرد؛ وگرنه شعبه‌ی فعال
        const invoice = dto.invoiceId ? await this.prisma.invoice.findFirst({ where: { id: dto.invoiceId, tenantId } }) : null;
        if (dto.invoiceId && !invoice) throw new NotFoundException('فاکتور پیدا نشد');
        const branchId = invoice?.branchId ?? requireActiveBranch(ctx);
        return this.prisma.check.create({
            data: {
                ...dto, tenantId, branchId,
                dueDate: new Date(dto.dueDate),
                issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
            },
            include: INCLUDE,
        });
    }

    async findAll(tenantId: string, q: QueryChecksDto, ctx: BranchContext) {
        const { page = 1, limit = 20, checkType, status, partyId, search } = q;
        const where: Prisma.CheckWhereInput = { tenantId, AND: [branchFilter(ctx)] };
        if (checkType) where.checkType = checkType;
        if (status) where.status = status;
        if (partyId) where.partyId = partyId;
        if (search) {
            where.OR = [
                { checkNumber: { contains: search } },
                { bankName: { contains: search, mode: 'insensitive' } },
                { partyName: { contains: search, mode: 'insensitive' } },
                { party: { name: { contains: search, mode: 'insensitive' } } },
            ];
        }
        const [data, total] = await this.prisma.$transaction(async (tx) => [
            await tx.check.findMany({ where, include: INCLUDE, orderBy: { dueDate: 'asc' }, skip: (page - 1) * limit, take: limit }),
            await tx.check.count({ where }),
        ] as const);
        return { data, meta: buildMeta(total, page, limit) };
    }

    async findOne(tenantId: string, id: string, ctx: BranchContext) {
        const check = await this.prisma.check.findFirst({ where: { id, tenantId, AND: [branchFilter({ ...ctx, activeId: null })] }, include: { party: true, invoice: true } });
        if (!check) throw new NotFoundException('چک پیدا نشد');
        return check;
    }

    /** وصول چک: یک «پرداخت» با روش چک ثبت می‌شود که فاکتور و مانده‌ی طرف حساب را به‌روز می‌کند */
    async cashCheck(tenantId: string, userId: string, id: string, ctx: BranchContext) {
        const check = await this.findOne(tenantId, id, ctx);
        if (check.status !== 'PENDING') throw new BadRequestException('فقط چک‌های در انتظار وصول قابل وصول هستند');

        return this.prisma.$transaction(async (tx) => {
            await this.payments.record(tx, {
                tenantId, userId,
                direction: check.checkType === 'RECEIVED' ? 'RECEIVED' : 'PAID',
                method: 'CHECK', amount: Number(check.amount),
                partyId: check.partyId, invoiceId: check.invoiceId, branchId: check.branchId,
                reference: `چک ${check.checkNumber} - ${check.bankName}`,
            });
            return tx.check.update({
                where: { id }, data: { status: 'CASHED', cashedAt: new Date() }, include: INCLUDE,
            });
        });
    }

    async bounceCheck(tenantId: string, id: string, reason: string, ctx: BranchContext) {
        const check = await this.findOne(tenantId, id, ctx);
        if (check.status !== 'PENDING') throw new BadRequestException('فقط چک‌های در انتظار وصول قابل برگشت هستند');
        return this.prisma.check.update({ where: { id }, data: { status: 'BOUNCED', bouncedReason: reason }, include: INCLUDE });
    }

    async cancelCheck(tenantId: string, id: string, ctx: BranchContext) {
        const check = await this.findOne(tenantId, id, ctx);
        if (check.status !== 'PENDING') throw new BadRequestException('فقط چک‌های در انتظار وصول قابل ابطال هستند');
        return this.prisma.check.update({ where: { id }, data: { status: 'CANCELLED' }, include: INCLUDE });
    }

    /** چک‌های در انتظار که سررسیدشان تا `days` روز آینده است (شامل سررسید گذشته‌ها) */
    async getDueChecks(tenantId: string, ctx: BranchContext, days = 7) {
        const until = new Date();
        until.setDate(until.getDate() + days);
        until.setHours(23, 59, 59, 999);
        return this.prisma.check.findMany({
            where: { tenantId, AND: [branchFilter(ctx)], status: 'PENDING', dueDate: { lte: until } },
            include: INCLUDE,
            orderBy: { dueDate: 'asc' },
        });
    }
}
