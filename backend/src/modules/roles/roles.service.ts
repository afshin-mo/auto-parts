import { Injectable, ConflictException, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { authUserCache } from '../../common/auth-user-cache';
import { PrismaService } from '../../database/prisma/prisma.service';
import { PERMISSIONS, isValidPermission, systemRolePermissions } from '../../common/permissions';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

export interface Actor { id: string; role: string; permissions?: string[] }

const SYSTEM_ROLES = ['TENANT_ADMIN', 'MANAGER', 'SALESMAN', 'ACCOUNTANT', 'WAREHOUSE'] as const;

@Injectable()
export class RolesService {
    constructor(private prisma: PrismaService) { }

    /** فهرست مجوزها و پیش‌فرض نقش‌های سیستمی (برای ساخت صفحه‌ی ویرایش نقش) */
    catalog() {
        return {
            permissions: PERMISSIONS.map(({ key, label, group }) => ({ key, label, group })),
            systemRoles: SYSTEM_ROLES.map((role) => ({ role, permissions: systemRolePermissions(role) })),
        };
    }

    findAll(tenantId: string) {
        return this.prisma.role.findMany({
            where: { tenantId },
            include: { _count: { select: { users: true } } },
            orderBy: { name: 'asc' },
        });
    }

    /** هر کس فقط می‌تواند مجوزهایی را بدهد که خودش دارد (جلوگیری از ارتقای دسترسی) */
    private validate(permissions: string[], actor: Actor) {
        const unique = [...new Set(permissions)];
        const bad = unique.filter((k) => !isValidPermission(k));
        if (bad.length) throw new BadRequestException(`مجوز نامعتبر: ${bad.join('، ')}`);
        if (actor.role !== 'TENANT_ADMIN' && actor.role !== 'SUPER_ADMIN') {
            const mine = new Set(actor.permissions ?? []);
            const over = unique.filter((k) => !mine.has(k));
            if (over.length) throw new ForbiddenException('نمی‌توانید مجوزی را بدهید که خودتان ندارید');
        }
        return unique;
    }

    async create(tenantId: string, actor: Actor, dto: CreateRoleDto) {
        const name = dto.name.trim();
        if (await this.prisma.role.findUnique({ where: { tenantId_name: { tenantId, name } } })) {
            throw new ConflictException('نقشی با این نام وجود دارد');
        }
        return this.prisma.role.create({ data: { tenantId, name, description: dto.description, permissions: this.validate(dto.permissions, actor) } });
    }

    async update(tenantId: string, actor: Actor, id: string, dto: UpdateRoleDto) {
        const role = await this.prisma.role.findFirst({ where: { id, tenantId } });
        if (!role) throw new NotFoundException('نقش پیدا نشد');
        const data: { name?: string; description?: string; permissions?: string[] } = {};
        if (dto.name !== undefined) {
            const name = dto.name.trim();
            if (name !== role.name && (await this.prisma.role.findUnique({ where: { tenantId_name: { tenantId, name } } }))) {
                throw new ConflictException('نقشی با این نام وجود دارد');
            }
            data.name = name;
        }
        if (dto.description !== undefined) data.description = dto.description;
        if (dto.permissions !== undefined) data.permissions = this.validate(dto.permissions, actor);
        const updated = await this.prisma.role.update({ where: { id }, data });
        authUserCache.clear(); // مجوزهای همه‌ی کاربرانِ این نقش عوض شده
        return updated;
    }

    async remove(tenantId: string, id: string) {
        const role = await this.prisma.role.findFirst({ where: { id, tenantId }, include: { _count: { select: { users: true } } } });
        if (!role) throw new NotFoundException('نقش پیدا نشد');
        if (role._count.users > 0) throw new ConflictException('این نقش به کاربر داده شده است؛ ابتدا نقش آن کاربران را عوض کنید');
        await this.prisma.role.delete({ where: { id } });
        return { removed: true };
    }
}
