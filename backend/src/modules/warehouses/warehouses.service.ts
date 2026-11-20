import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto';
import { BranchContext, branchFilter } from '../../common/branch.context';

@Injectable()
export class WarehousesService {
    constructor(private prisma: PrismaService) { }

    findAll(tenantId: string, ctx: BranchContext) {
        // همه‌ی انبارهای شعبه‌های مجاز (فرانت بر اساس شعبه‌ی فعال فیلتر می‌کند)
        return this.prisma.warehouse.findMany({
            where: { tenantId, AND: [branchFilter({ ...ctx, activeId: null })] },
            include: { branch: { select: { id: true, name: true, code: true } } },
            orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        });
    }

    private async checkBranch(tenantId: string, branchId?: string | null) {
        if (branchId && !(await this.prisma.branch.findFirst({ where: { id: branchId, tenantId } }))) throw new NotFoundException('شعبه پیدا نشد');
    }

    async create(tenantId: string, dto: CreateWarehouseDto, ctx: BranchContext) {
        const branchId = dto.branchId ?? ctx.activeId ?? null;
        await this.checkBranch(tenantId, branchId);
        if (await this.prisma.warehouse.findUnique({ where: { tenantId_code: { tenantId, code: dto.code } } })) {
            throw new ConflictException('انباری با این کد وجود دارد');
        }
        return this.prisma.$transaction(async (tx) => {
            if (dto.isDefault) await tx.warehouse.updateMany({ where: { tenantId }, data: { isDefault: false } });
            return tx.warehouse.create({ data: { ...dto, branchId, tenantId } });
        });
    }

    async update(tenantId: string, id: string, dto: UpdateWarehouseDto) {
        const existing = await this.prisma.warehouse.findFirst({ where: { id, tenantId } });
        if (!existing) throw new NotFoundException('انبار پیدا نشد');
        await this.checkBranch(tenantId, dto.branchId);

        if (dto.code && dto.code !== existing.code) {
            if (await this.prisma.warehouse.findUnique({ where: { tenantId_code: { tenantId, code: dto.code } } })) {
                throw new ConflictException('انباری با این کد وجود دارد');
            }
        }
        if (existing.isDefault && dto.isDefault === false) {
            throw new BadRequestException('همیشه باید یک انبار پیش‌فرض داشته باشید؛ انبار دیگری را پیش‌فرض کنید');
        }
        if (existing.isDefault && dto.isActive === false) {
            throw new BadRequestException('انبار پیش‌فرض را نمی‌توان غیرفعال کرد');
        }

        return this.prisma.$transaction(async (tx) => {
            if (dto.isDefault) await tx.warehouse.updateMany({ where: { tenantId }, data: { isDefault: false } });
            return tx.warehouse.update({ where: { id }, data: dto });
        });
    }

    async remove(tenantId: string, id: string) {
        const existing = await this.prisma.warehouse.findFirst({ where: { id, tenantId } });
        if (!existing) throw new NotFoundException('انبار پیدا نشد');
        if (existing.isDefault) throw new BadRequestException('انبار پیش‌فرض قابل حذف نیست');

        const [stock, txns] = await this.prisma.$transaction(async (tx) => [
            await tx.inventory.count({ where: { warehouseId: id, quantity: { not: 0 } } }),
            await tx.inventoryTransaction.count({ where: { warehouseId: id } }),
        ] as const);
        if (stock > 0) throw new ConflictException('این انبار هنوز موجودی دارد');
        if (txns > 0) throw new ConflictException('این انبار گردش دارد؛ به‌جای حذف، آن را غیرفعال کنید');

        await this.prisma.inventory.deleteMany({ where: { warehouseId: id } });
        return this.prisma.warehouse.delete({ where: { id } });
    }
}
