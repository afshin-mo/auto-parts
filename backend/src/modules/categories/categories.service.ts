import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { assertOwnership, catalogScope, isSuper, scopedCode } from '../../common/utils/catalog-scope.util';

@Injectable()
export class CategoriesService {
    constructor(private prisma: PrismaService) { }

    /** فهرست تخت دسته‌ها (فرانت درخت را از parentId می‌سازد) — سیستمی + اختصاصی فروشگاه */
    findAll(tenantId: string) {
        return this.prisma.category.findMany({
            where: { isActive: true, AND: [catalogScope(tenantId)] },
            orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        });
    }

    async create(tenantId: string, role: string, dto: CreateCategoryDto) {
        const owner = isSuper(role) ? null : tenantId;
        let level = 1;
        if (dto.parentId) {
            const parent = await this.prisma.category.findFirst({ where: { id: dto.parentId, AND: [catalogScope(tenantId)] } });
            if (!parent) throw new NotFoundException('دسته والد پیدا نشد');
            level = parent.level + 1;
        }
        const code = scopedCode(owner, dto.code?.trim() || `cat-${Date.now().toString(36)}`);
        if (await this.prisma.category.findUnique({ where: { code } })) {
            throw new ConflictException('دسته‌ای با این کد وجود دارد');
        }
        const { code: _c, ...rest } = dto;
        void _c;
        return this.prisma.category.create({ data: { ...rest, code, level, tenantId: owner } });
    }

    async update(tenantId: string, role: string, id: string, dto: UpdateCategoryDto) {
        const existing = assertOwnership(await this.prisma.category.findUnique({ where: { id } }), tenantId, role, 'دسته');
        if (dto.parentId === id) throw new BadRequestException('دسته نمی‌تواند والد خودش باشد');

        let level = existing.level;
        if (dto.parentId !== undefined && dto.parentId !== existing.parentId) {
            if (dto.parentId) {
                // جلوگیری از حلقه: والد جدید نباید زیرمجموعه‌ی همین دسته باشد
                let cursor = await this.prisma.category.findFirst({ where: { id: dto.parentId, AND: [catalogScope(tenantId)] } });
                if (!cursor) throw new NotFoundException('دسته والد پیدا نشد');
                level = cursor.level + 1;
                while (cursor?.parentId) {
                    if (cursor.parentId === id) throw new BadRequestException('انتقال به زیرمجموعه‌ی خودش ممکن نیست');
                    cursor = await this.prisma.category.findUnique({ where: { id: cursor.parentId } });
                }
            } else {
                level = 1;
            }
        }
        const { code: _c, ...rest } = dto;
        void _c;
        return this.prisma.category.update({ where: { id }, data: { ...rest, level } });
    }

    async remove(tenantId: string, role: string, id: string) {
        assertOwnership(await this.prisma.category.findUnique({ where: { id } }), tenantId, role, 'دسته');
        const [children, products] = await this.prisma.$transaction(async (tx) => [
            await tx.category.count({ where: { parentId: id } }),
            await tx.product.count({ where: { categoryId: id } }),
        ] as const);
        if (children > 0) throw new ConflictException('ابتدا زیرمجموعه‌های این دسته را حذف کنید');
        if (products > 0) throw new ConflictException('این دسته در کالاها استفاده شده و قابل حذف نیست');
        return this.prisma.category.delete({ where: { id } });
    }
}
