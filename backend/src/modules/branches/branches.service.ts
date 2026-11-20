import { Injectable, ForbiddenException, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BranchContext } from '../../common/branch.context';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

interface CachedBranch { id: string; isDefault: boolean }
export interface BranchUser {
    id: string; tenantId: string; role: string;
    allBranches?: boolean; branchIds?: string[]; defaultBranchId?: string | null;
}

const TTL_MS = 15_000;

@Injectable()
export class BranchesService {
    private cache = new Map<string, { at: number; list: CachedBranch[] }>();

    constructor(private prisma: PrismaService) { }

    invalidate(tenantId: string) { this.cache.delete(tenantId); }

    /** شعبه‌های فعال فروشگاه (با کش کوتاه). اگر فروشگاهی هنوز شعبه نداشت، شعبه‌ی مرکزی ساخته و انبارهای بدون شعبه به آن وصل می‌شوند */
    private async activeBranches(tenantId: string): Promise<CachedBranch[]> {
        const hit = this.cache.get(tenantId);
        if (hit && Date.now() - hit.at < TTL_MS) return hit.list;

        let list = await this.prisma.branch.findMany({ where: { tenantId, isActive: true }, select: { id: true, isDefault: true }, orderBy: { createdAt: 'asc' } });
        if (list.length === 0 && (await this.prisma.branch.count({ where: { tenantId } })) === 0) {
            try {
                const b = await this.prisma.branch.create({ data: { tenantId, name: 'شعبه مرکزی', code: 'HQ', isDefault: true } });
                await this.prisma.warehouse.updateMany({ where: { tenantId, branchId: null }, data: { branchId: b.id } });
            } catch (e) {
                if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
            }
            list = await this.prisma.branch.findMany({ where: { tenantId, isActive: true }, select: { id: true, isDefault: true }, orderBy: { createdAt: 'asc' } });
        }
        this.cache.set(tenantId, { at: Date.now(), list });
        return list;
    }

    async resolveContext(user: BranchUser, header?: string | string[]): Promise<BranchContext> {
        const list = await this.activeBranches(user.tenantId);
        const unrestricted = user.role === 'SUPER_ADMIN' || user.allBranches !== false;
        const mine = new Set(user.branchIds ?? []);
        const allowedIds = (unrestricted ? list : list.filter((b) => mine.has(b.id))).map((b) => b.id);

        const raw = (Array.isArray(header) ? header[0] : header)?.trim();
        let activeId: string | null;
        if (raw === 'all') {
            activeId = allowedIds.length > 1 ? null : allowedIds[0] ?? null;
        } else if (raw) {
            if (!allowedIds.includes(raw)) throw new ForbiddenException('به این شعبه دسترسی ندارید');
            activeId = raw;
        } else {
            const tenantDefault = list.find((b) => b.isDefault)?.id;
            activeId = [user.defaultBranchId, tenantDefault, allowedIds[0]].find((id) => !!id && allowedIds.includes(id)) ?? null;
        }
        const ctx = new BranchContext();
        ctx.activeId = activeId;
        ctx.allowedIds = allowedIds;
        ctx.unrestricted = unrestricted;
        return ctx;
    }

    /** شعبه‌هایی که کاربر می‌تواند ببیند */
    async findAll(tenantId: string, ctx: BranchContext) {
        const rows = await this.prisma.branch.findMany({
            where: { tenantId, OR: [{ id: { in: ctx.allowedIds } }, ...(ctx.unrestricted ? [{ isActive: false }] : [])] },
            include: { _count: { select: { warehouses: true, users: true } } },
            orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        });
        return rows;
    }

    async create(tenantId: string, dto: CreateBranchDto) {
        const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
        const count = await this.prisma.branch.count({ where: { tenantId, isActive: true } });
        if (count >= tenant.maxBranches) {
            throw new ForbiddenException(`سقف تعداد شعبه‌های طرح شما (${tenant.maxBranches} شعبه) پر شده است`);
        }
        const code = dto.code.toUpperCase();
        if (await this.prisma.branch.findUnique({ where: { tenantId_code: { tenantId, code } } })) {
            throw new ConflictException('شعبه‌ای با این کد وجود دارد');
        }
        const { createWarehouse, ...data } = dto;
        const branch = await this.prisma.$transaction(async (tx) => {
            const b = await tx.branch.create({ data: { ...data, code, tenantId, isDefault: count === 0 } });
            if (createWarehouse !== false) {
                await tx.warehouse.create({ data: { tenantId, branchId: b.id, name: `انبار ${b.name}`, code: `${code}-W1`.slice(0, 50), isDefault: false } });
            }
            return b;
        });
        this.invalidate(tenantId);
        return branch;
    }

    async update(tenantId: string, id: string, dto: UpdateBranchDto) {
        const existing = await this.prisma.branch.findFirst({ where: { id, tenantId } });
        if (!existing) throw new NotFoundException('شعبه پیدا نشد');
        if (existing.isDefault && dto.isActive === false) throw new BadRequestException('شعبه‌ی پیش‌فرض را نمی‌توان غیرفعال کرد؛ ابتدا شعبه‌ی دیگری را پیش‌فرض کنید');
        if (existing.isDefault && dto.isDefault === false) throw new BadRequestException('همیشه باید یک شعبه‌ی پیش‌فرض داشته باشید');
        if (dto.isActive === true && !existing.isActive) {
            const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
            const count = await this.prisma.branch.count({ where: { tenantId, isActive: true } });
            if (count >= tenant.maxBranches) throw new ForbiddenException('سقف تعداد شعبه‌های طرح شما پر شده است');
        }
        const branch = await this.prisma.$transaction(async (tx) => {
            if (dto.isDefault) await tx.branch.updateMany({ where: { tenantId }, data: { isDefault: false } });
            return tx.branch.update({ where: { id }, data: dto });
        });
        this.invalidate(tenantId);
        return branch;
    }
}
