import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BrandsService } from './brands.service';
import { CreateBrandDto, UpdateBrandDto } from './dto/brand.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perm } from '../../common/decorators/permissions.decorator';

@ApiTags('Brands')
@ApiBearerAuth()
@Controller('brands')
export class BrandsController {
    constructor(private readonly service: BrandsService) { }

    @Get()
    @ApiOperation({ summary: 'فهرست برندها (سیستمی + اختصاصی فروشگاه) — kind=PART|VEHICLE' })
    findAll(@TenantId() t: string, @Query('kind') kind?: string, @Query('search') search?: string) {
        return this.service.findAll(t, kind, search);
    }

    @Post()
    @Perm('catalog.manage')
    create(@TenantId() t: string, @CurrentUser() u: { role: string }, @Body() dto: CreateBrandDto) {
        return this.service.create(t, u.role, dto);
    }

    @Patch(':id')
    @Perm('catalog.manage')
    update(@TenantId() t: string, @CurrentUser() u: { role: string }, @Param('id') id: string, @Body() dto: UpdateBrandDto) {
        return this.service.update(t, u.role, id, dto);
    }

    @Delete(':id')
    @Perm('catalog.manage')
    remove(@TenantId() t: string, @CurrentUser() u: { role: string }, @Param('id') id: string) {
        return this.service.remove(t, u.role, id);
    }
}
