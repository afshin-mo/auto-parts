import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { authUserCache } from '../../common/auth-user-cache';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

const SELECT = {
    id: true, name: true, phone: true, email: true, role: true, roleId: true,
    allBranches: true, defaultBranchId: true,
    isActive: true, lastLoginAt: true, createdAt: true,
    customRole: { select: { id: true, name: true } },
    branches: { select: { branchId: true } },
} as const;

type Row = {
    id: string; name: string; phone: string; email: string | null; role: string; roleId: string | null;
    allBranches: boolean; defaultBranchId: string | null; isActive: boolean; lastLoginAt: Date | null; createdAt: Date;
    customRole: { id: string; name: string } | null; branches: { branchId: string }[];
};
const shape = ({ branches, customRole, ...u }: Row) => ({ ...u, roleName: customRole?.name ?? null, branchIds: branches.map((b) => b.branchId) });

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    async findAll(tenantId: string) {
        const rows = await this.prisma.user.findMany({ where: { tenantId }, select: SELECT, orderBy: { createdAt: 'asc' } });
        return rows.map(shape);
    }

    /** نقش دلخواه و شعبه‌ها باید متعلق به همین فروشگاه باشند */
    private async checkRefs(tenantId: string, roleId?: string | null, branchIds?: string[], defaultBranchId?: string | null) {
        if (roleId && !(await this.prisma.role.findFirst({ where: { id: roleId, tenantId }, select: { id: true } }))) {
            throw new NotFoundException('نقش پیدا نشد');
        }
        const ids = [...new Set([...(branchIds ?? []), ...(defaultBranchId ? [defaultBranchId] : [])])];
        if (ids.length) {
            const n = await this.prisma.branch.count({ where: { tenantId, id: { in: ids } } });
            if (n !== ids.length) throw new NotFoundException('شعبه پیدا نشد');
        }
    }

    async create(tenantId: string, dto: CreateUserDto) {
        const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
        const count = await this.prisma.user.count({ where: { tenantId, isActive: true } });
        if (count >= tenant.maxUsers) {
            throw new ForbiddenException(`سقف تعداد کاربران طرح شما (${tenant.maxUsers} کاربر) پر شده است`);
        }
        if (await this.prisma.user.findUnique({ where: { phone: dto.phone } })) {
            throw new ConflictException('این شماره موبایل قبلاً ثبت شده است');
        }
        const { password, role, roleId, allBranches, branchIds, defaultBranchId, ...rest } = dto;
        await this.checkRefs(tenantId, roleId, branchIds, defaultBranchId);
        const restricted = allBranches === false;
        if (restricted && !branchIds?.length) throw new BadRequestException('دست‌کم یک شعبه انتخاب کنید');

        const created = await this.prisma.user.create({
            data: {
                ...rest, tenantId, passwordHash: await bcrypt.hash(password, 10),
                // کاربر با نقش دلخواه، نقش پایه‌ی بی‌اختیار می‌گیرد؛ دسترسی واقعی از نقش دلخواه می‌آید
                role: roleId ? 'SALESMAN' : role ?? 'SALESMAN', roleId: roleId ?? null,
                allBranches: !restricted, defaultBranchId: defaultBranchId ?? null,
                ...(restricted ? { branches: { create: branchIds!.map((branchId) => ({ branchId, tenantId })) } } : {}),
            },
            select: SELECT,
        });
        return shape(created);
    }

    async update(tenantId: string, actorId: string, id: string, dto: UpdateUserDto) {
        const user = await this.prisma.user.findFirst({ where: { id, tenantId } });
        if (!user) throw new NotFoundException('کاربر پیدا نشد');
        if (user.role === 'SUPER_ADMIN') throw new ForbiddenException('ویرایش این کاربر مجاز نیست');

        const { roleId, allBranches, branchIds, defaultBranchId, role, ...plain } = dto;
        await this.checkRefs(tenantId, roleId, branchIds, defaultBranchId);

        // نقش پایه‌ی جدید: نقش دلخواه → SALESMAN ؛ بازگشت به سیستمی → role درخواستی یا نقش فعلی
        const newRole = roleId ? 'SALESMAN' : role ?? user.role;
        const losesAdmin = user.role === 'TENANT_ADMIN' && (dto.isActive === false || newRole !== 'TENANT_ADMIN');
        if (losesAdmin) {
            if (id === actorId) throw new BadRequestException('نمی‌توانید دسترسی مدیر خودتان را بردارید یا خودتان را غیرفعال کنید');
            const admins = await this.prisma.user.count({ where: { tenantId, role: 'TENANT_ADMIN', isActive: true } });
            if (admins <= 1) throw new BadRequestException('فروشگاه باید حداقل یک مدیر فعال داشته باشد');
        }
        if (dto.isActive === true && !user.isActive) {
            const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
            const count = await this.prisma.user.count({ where: { tenantId, isActive: true } });
            if (count >= tenant.maxUsers) throw new ForbiddenException('سقف تعداد کاربران طرح شما پر شده است');
        }
        if (allBranches === false && !(branchIds?.length) && !(await this.prisma.userBranch.count({ where: { userId: id } }))) {
            throw new BadRequestException('دست‌کم یک شعبه انتخاب کنید');
        }

        const data: Record<string, unknown> = { ...plain };
        if (role !== undefined || roleId !== undefined) data.role = newRole;
        if (roleId !== undefined) data.roleId = roleId;
        if (allBranches !== undefined) data.allBranches = allBranches;
        if (defaultBranchId !== undefined) data.defaultBranchId = defaultBranchId;

        const updated = await this.prisma.$transaction(async (tx) => {
            if (branchIds !== undefined) {
                await tx.userBranch.deleteMany({ where: { userId: id } });
                if (branchIds.length) await tx.userBranch.createMany({ data: [...new Set(branchIds)].map((branchId) => ({ userId: id, branchId, tenantId })) });
            }
            return tx.user.update({ where: { id }, data, select: SELECT });
        });
        authUserCache.clear(id);
        return shape(updated);
    }

    async resetPassword(tenantId: string, id: string, password: string, actorRole: string) {
        const user = await this.prisma.user.findFirst({ where: { id, tenantId } });
        if (!user) throw new NotFoundException('کاربر پیدا نشد');
        if (user.role === 'SUPER_ADMIN') throw new ForbiddenException('ویرایش این کاربر مجاز نیست');
        // نقش دلخواهِ دارای users.manage نباید بتواند حساب مدیر فروشگاه را با تغییر رمز تصاحب کند
        if (user.role === 'TENANT_ADMIN' && actorRole !== 'TENANT_ADMIN' && actorRole !== 'SUPER_ADMIN') {
            throw new ForbiddenException('فقط مدیر فروشگاه می‌تواند رمز مدیر را تغییر دهد');
        }
        await this.prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
        return { reset: true };
    }
}
