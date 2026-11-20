import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
    constructor(private prisma: PrismaService) { }

    async getCurrent(tenantId: string) {
        const [tenant, products, users] = await this.prisma.$transaction(async (tx) => [
            await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
            await tx.product.count({ where: { tenantId, deletedAt: null } }),
            await tx.user.count({ where: { tenantId, isActive: true } }),
        ] as const);
        return { ...tenant, usage: { products, users } };
    }

    async update(tenantId: string, dto: UpdateTenantDto) {
        const current = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
        const { settings, ...rest } = dto;
        await this.prisma.tenant.update({
            where: { id: tenantId },
            data: {
                ...rest,
                ...(settings ? { settings: { ...(current.settings as object), ...settings } } : {}),
            },
        });
        return this.getCurrent(tenantId);
    }
}
