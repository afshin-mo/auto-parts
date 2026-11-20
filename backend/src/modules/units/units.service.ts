import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateUnitDto, UpdateUnitDto } from './dto/unit.dto';
import { assertOwnership, catalogScope, isSuper, scopedCode } from '../../common/utils/catalog-scope.util';

@Injectable()
export class UnitsService {
    constructor(private prisma: PrismaService) { }

    findAll(tenantId: string) {
        return this.prisma.unit.findMany({ where: { isActive: true, AND: [catalogScope(tenantId)] }, orderBy: { name: 'asc' } });
    }

    async create(tenantId: string, role: string, dto: CreateUnitDto) {
        const owner = isSuper(role) ? null : tenantId;
        const code = scopedCode(owner, dto.code.trim(), 20);
        if (await this.prisma.unit.findUnique({ where: { code } })) {
            throw new ConflictException('واحدی با این کد وجود دارد');
        }
        return this.prisma.unit.create({ data: { ...dto, code, type: dto.type ?? 'count', tenantId: owner } });
    }

    async update(tenantId: string, role: string, id: string, dto: UpdateUnitDto) {
        const u = await this.prisma.unit.findUnique({ where: { id } });
        if (!u) throw new NotFoundException('واحد پیدا نشد');
        assertOwnership(u, tenantId, role, 'واحد');
        const { code, ...rest } = dto;
        void code;
        return this.prisma.unit.update({ where: { id }, data: rest });
    }

    async remove(tenantId: string, role: string, id: string) {
        const u = await this.prisma.unit.findUnique({ where: { id } });
        if (!u) throw new NotFoundException('واحد پیدا نشد');
        assertOwnership(u, tenantId, role, 'واحد');
        if ((await this.prisma.product.count({ where: { unitId: id } })) > 0) {
            throw new ConflictException('این واحد در کالاها استفاده شده و قابل حذف نیست');
        }
        return this.prisma.unit.delete({ where: { id } });
    }
}
