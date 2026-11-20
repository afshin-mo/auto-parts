import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateVehicleDto, UpdateVehicleDto } from './dto/vehicle.dto';
import { assertOwnership, catalogScope, isSuper } from '../../common/utils/catalog-scope.util';

@Injectable()
export class VehiclesService {
    constructor(private prisma: PrismaService) { }

    findAll(tenantId: string, brandId?: string, search?: string) {
        return this.prisma.vehicle.findMany({
            where: {
                isActive: true,
                AND: [catalogScope(tenantId)],
                ...(brandId ? { brandId } : {}),
                ...(search ? { modelName: { contains: search, mode: 'insensitive' as const } } : {}),
            },
            include: { brand: true },
            orderBy: [{ brand: { name: 'asc' } }, { modelName: 'asc' }],
        });
    }

    async findOne(tenantId: string, id: string) {
        const v = await this.prisma.vehicle.findFirst({ where: { id, AND: [catalogScope(tenantId)] }, include: { brand: true } });
        if (!v) throw new NotFoundException('خودرو پیدا نشد');
        return v;
    }

    async create(tenantId: string, role: string, dto: CreateVehicleDto) {
        if (!(await this.prisma.brand.findFirst({ where: { id: dto.brandId, AND: [catalogScope(tenantId)] } }))) {
            throw new NotFoundException('خودروساز پیدا نشد');
        }
        return this.prisma.vehicle.create({ data: { ...dto, tenantId: isSuper(role) ? null : tenantId }, include: { brand: true } });
    }

    async update(tenantId: string, role: string, id: string, dto: UpdateVehicleDto) {
        assertOwnership(await this.prisma.vehicle.findUnique({ where: { id } }), tenantId, role, 'خودرو');
        if (dto.brandId && !(await this.prisma.brand.findFirst({ where: { id: dto.brandId, AND: [catalogScope(tenantId)] } }))) {
            throw new NotFoundException('خودروساز پیدا نشد');
        }
        return this.prisma.vehicle.update({ where: { id }, data: dto, include: { brand: true } });
    }

    async remove(tenantId: string, role: string, id: string) {
        assertOwnership(await this.prisma.vehicle.findUnique({ where: { id } }), tenantId, role, 'خودرو');
        const used = await this.prisma.productVehicleCompatibility.count({ where: { vehicleId: id } });
        if (used > 0) return this.prisma.vehicle.update({ where: { id }, data: { isActive: false } });
        return this.prisma.vehicle.delete({ where: { id } });
    }
}
