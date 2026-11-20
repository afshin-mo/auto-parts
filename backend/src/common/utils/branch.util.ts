import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * انبار عملیات را تعیین می‌کند:
 *  - اگر انبار مشخص شده باشد، باید فعال باشد و متعلق به شعبه‌ی جاری (یا بدون شعبه) باشد؛
 *  - وگرنه انبار پیش‌فرض همان شعبه، و در نبود آن انبار پیش‌فرض فروشگاه.
 */
export async function resolveWarehouse(db: Db, tenantId: string, branchId: string | null, warehouseId?: string | null) {
    if (warehouseId) {
        const w = await db.warehouse.findFirst({ where: { id: warehouseId, tenantId, isActive: true } });
        if (!w) throw new NotFoundException('انبار پیدا نشد');
        if (w.branchId && branchId && w.branchId !== branchId) {
            throw new BadRequestException('این انبار متعلق به شعبه‌ی دیگری است');
        }
        return w;
    }
    const own = branchId
        ? await db.warehouse.findFirst({ where: { tenantId, branchId, isActive: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] })
        : null;
    const w = own ?? (await db.warehouse.findFirst({ where: { tenantId, isDefault: true, isActive: true } }));
    if (!w) throw new NotFoundException('انبار پیدا نشد');
    return w;
}

/** کد شعبه برای شماره‌ی فاکتور؛ شعبه‌ی پیش‌فرض کد نمی‌گیرد تا شماره‌های قبلی ادامه پیدا کنند */
export async function invoiceBranchCode(db: Db, branchId: string | null): Promise<string | null> {
    if (!branchId) return null;
    const b = await db.branch.findUnique({ where: { id: branchId }, select: { code: true, isDefault: true } });
    return b && !b.isDefault ? b.code : null;
}
