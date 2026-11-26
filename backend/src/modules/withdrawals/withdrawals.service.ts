import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateWithdrawalDto, QueryWithdrawalsDto } from './withdrawals.dto';
import { buildMeta } from '../../common/dto/pagination.dto';
import { BranchContext, branchFilter, requireActiveBranch } from '../../common/branch.context';

function range(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!from && !to) return undefined;
    const f: Prisma.DateTimeFilter = {};
    if (from) f.gte = new Date(from);
    if (to) { const e = new Date(to); e.setHours(23, 59, 59, 999); f.lte = e; }
    return f;
}

/**
 * برداشت از حساب فروشگاه (شریک/کارمند/صاحب). عمداً جدا از «هزینه» است: به گزارش سود و زیان
 * (فروش، بهای تمام‌شده، هزینه‌ها) هیچ ربطی ندارد و فقط برای سابقه‌ی هر شخص ثبت می‌شود.
 */
@Injectable()
export class WithdrawalsService {
    constructor(private prisma: PrismaService) { }

    create(tenantId: string, userId: string, dto: CreateWithdrawalDto, ctx: BranchContext) {
        return this.prisma.withdrawal.create({
            data: { tenantId, branchId: requireActiveBranch(ctx), personName: dto.personName.trim().replace(/\s+/g, ' '), amount: dto.amount, method: dto.method ?? 'CASH', date: dto.date ? new Date(dto.date) : new Date(), description: dto.description, createdBy: userId },
        });
    }

    async findAll(tenantId: string, q: QueryWithdrawalsDto, ctx: BranchContext) {
        const { page = 1, limit = 20, personName, from, to } = q;
        const where: Prisma.WithdrawalWhereInput = { tenantId, AND: [branchFilter(ctx)], ...(personName ? { personName } : {}), ...(range(from, to) ? { date: range(from, to) } : {}) };
        const [data, total, sum] = await this.prisma.$transaction(async (tx) => [
            await tx.withdrawal.findMany({ where, orderBy: { date: 'desc' }, skip: (page - 1) * limit, take: limit }),
            await tx.withdrawal.count({ where }),
            await tx.withdrawal.aggregate({ where, _sum: { amount: true } }),
        ] as const);
        return { data, meta: { ...buildMeta(total, page, limit), totalAmount: Number(sum._sum.amount ?? 0) } };
    }

    /** جمع برداشت هر شخص در بازه */
    async summary(tenantId: string, ctx: BranchContext, from?: string, to?: string) {
        const rows = await this.prisma.withdrawal.groupBy({ by: ['personName'], where: { tenantId, AND: [branchFilter(ctx)], ...(range(from, to) ? { date: range(from, to) } : {}) }, _sum: { amount: true }, _count: true, orderBy: { _sum: { amount: 'desc' } } });
        const people = rows.map((r) => ({ personName: r.personName, total: Number(r._sum.amount ?? 0), count: r._count }));
        return { total: people.reduce((s, p) => s + p.total, 0), people };
    }

    async remove(tenantId: string, id: string, ctx: BranchContext) {
        const w = await this.prisma.withdrawal.findFirst({ where: { id, tenantId, AND: [branchFilter({ ...ctx, activeId: null })] } });
        if (!w) throw new NotFoundException('برداشت پیدا نشد');
        await this.prisma.withdrawal.delete({ where: { id } });
        return { removed: true };
    }
}
