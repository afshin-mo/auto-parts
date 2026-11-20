import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateExpenseDto, QueryExpensesDto } from './dto/expense.dto';
import { buildMeta } from '../../common/dto/pagination.dto';
import { BranchContext, branchFilter, requireActiveBranch } from '../../common/branch.context';

function range(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!from && !to) return undefined;
    const f: Prisma.DateTimeFilter = {};
    if (from) f.gte = new Date(from);
    if (to) { const e = new Date(to); e.setHours(23, 59, 59, 999); f.lte = e; }
    return f;
}

@Injectable()
export class ExpensesService {
    constructor(private prisma: PrismaService) { }

    create(tenantId: string, userId: string, dto: CreateExpenseDto, ctx: BranchContext) {
        return this.prisma.expense.create({
            data: { tenantId, branchId: requireActiveBranch(ctx), category: dto.category.trim(), amount: dto.amount, date: dto.date ? new Date(dto.date) : new Date(), method: dto.method ?? 'CASH', description: dto.description, createdBy: userId },
        });
    }

    async findAll(tenantId: string, q: QueryExpensesDto, ctx: BranchContext) {
        const { page = 1, limit = 20, category, from, to, search } = q;
        const where: Prisma.ExpenseWhereInput = { tenantId, AND: [branchFilter(ctx)], ...(category ? { category } : {}), ...(range(from, to) ? { date: range(from, to) } : {}), ...(search ? { description: { contains: search, mode: 'insensitive' } } : {}) };
        const [data, total, sum] = await this.prisma.$transaction(async (tx) => [
            await tx.expense.findMany({ where, orderBy: { date: 'desc' }, skip: (page - 1) * limit, take: limit }),
            await tx.expense.count({ where }),
            await tx.expense.aggregate({ where, _sum: { amount: true } }),
        ] as const);
        return { data, meta: { ...buildMeta(total, page, limit), totalAmount: Number(sum._sum.amount ?? 0) } };
    }

    async summary(tenantId: string, ctx: BranchContext, from?: string, to?: string) {
        const rows = await this.prisma.expense.groupBy({ by: ['category'], where: { tenantId, AND: [branchFilter(ctx)], ...(range(from, to) ? { date: range(from, to) } : {}) }, _sum: { amount: true }, _count: true, orderBy: { _sum: { amount: 'desc' } } });
        const categories = rows.map((r) => ({ category: r.category, total: Number(r._sum.amount ?? 0), count: r._count }));
        return { total: categories.reduce((s, c) => s + c.total, 0), categories };
    }

    async remove(tenantId: string, id: string, ctx: BranchContext) {
        const e = await this.prisma.expense.findFirst({ where: { id, tenantId, AND: [branchFilter({ ...ctx, activeId: null })] } });
        if (!e) throw new NotFoundException('هزینه پیدا نشد');
        await this.prisma.expense.delete({ where: { id } });
        return { removed: true };
    }
}
