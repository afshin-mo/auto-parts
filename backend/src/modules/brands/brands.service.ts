import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateBrandDto, UpdateBrandDto } from './dto/brand.dto';
import { assertOwnership, catalogScope, isSuper, scopedCode } from '../../common/utils/catalog-scope.util';

@Injectable()
export class BrandsService {
    constructor(private prisma: PrismaService) { }

    findAll(tenantId: string, kind?: string, search?: string) {
        return this.prisma.brand.findMany({
            where: {
                isActive: true,
                AND: [catalogScope(tenantId)],
                ...(kind ? { kind } : {}),
                ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
            },
            orderBy: { name: 'asc' },
        });
    }

    async create(tenantId: string, role: string, dto: CreateBrandDto) {
        const owner = isSuper(role) ? null : tenantId;
        const code = scopedCode(owner, dto.code?.trim() || `${dto.kind ?? 'PART'}-${Date.now().toString(36)}`.toLowerCase());
        if (await this.prisma.brand.findUnique({ where: { code } })) {
            throw new ConflictException('برندی با این کد وجود دارد');
        }
        return this.prisma.brand.create({ data: { ...dto, code, tenantId: owner } });
    }

    async update(tenantId: string, role: string, id: string, dto: UpdateBrandDto) {
        await this.ensure(tenantId, role, id);
        const { code, ...rest } = dto; // کد پس از ساخت ثابت می‌ماند
        void code;
        return this.prisma.brand.update({ where: { id }, data: rest });
    }

    async remove(tenantId: string, role: string, id: string) {
        await this.ensure(tenantId, role, id);
        const used = (await this.prisma.product.count({ where: { brandId: id } })) + (await this.prisma.vehicle.count({ where: { brandId: id } }));
        if (used > 0) throw new ConflictException('این برند در کالا یا خودرو استفاده شده و قابل حذف نیست');
        return this.prisma.brand.delete({ where: { id } });
    }

    private async ensure(tenantId: string, role: string, id: string) {
        const b = await this.prisma.brand.findUnique({ where: { id } });
        if (!b) throw new NotFoundException('برند پیدا نشد');
        return assertOwnership(b, tenantId, role, 'برند');
    }
}
