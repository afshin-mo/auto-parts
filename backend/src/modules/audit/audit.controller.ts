import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../database/prisma/prisma.service';
import { PaginationDto, buildMeta } from '../../common/dto/pagination.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { Perm } from '../../common/decorators/permissions.decorator';

class QueryAuditDto extends PaginationDto {
    @IsString() @IsOptional() userId?: string;
    @IsString() @IsOptional() entityType?: string;
    @IsDateString() @IsOptional() from?: string;
    @IsDateString() @IsOptional() to?: string;
}

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
    constructor(private prisma: PrismaService) { }

    @Get()
    @Perm('audit.view')
    async findAll(@TenantId() tenantId: string, @Query() q: QueryAuditDto) {
        const { page = 1, limit = 30, userId, entityType, from, to } = q;
        const where = {
            tenantId, ...(userId ? { userId } : {}), ...(entityType ? { entityType } : {}),
            ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(new Date(to).setHours(23, 59, 59, 999)) } : {}) } } : {}),
        };
        const [rows, total] = await Promise.all([
            this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, select: { id: true, userId: true, action: true, entityType: true, entityId: true, ipAddress: true, createdAt: true } }),
            this.prisma.auditLog.count({ where }),
        ]);
        const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId).filter(Boolean) as string[])] } }, select: { id: true, name: true } });
        const names = new Map(users.map((u) => [u.id, u.name]));
        return { data: rows.map((r) => ({ ...r, userName: r.userId ? names.get(r.userId) ?? null : null })), meta: buildMeta(total, page, limit) };
    }
}
