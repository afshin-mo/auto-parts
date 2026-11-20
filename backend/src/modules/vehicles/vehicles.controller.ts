import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto, UpdateVehicleDto } from './dto/vehicle.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perm } from '../../common/decorators/permissions.decorator';

@ApiTags('Vehicles')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
    constructor(private readonly service: VehiclesService) { }

    @Get()
    @ApiOperation({ summary: 'فهرست خودروها (سیستمی + اختصاصی فروشگاه)' })
    findAll(@TenantId() t: string, @Query('brandId') brandId?: string, @Query('search') search?: string) {
        return this.service.findAll(t, brandId, search);
    }

    @Get(':id')
    findOne(@TenantId() t: string, @Param('id') id: string) {
        return this.service.findOne(t, id);
    }

    @Post()
    @Perm('catalog.manage')
    create(@TenantId() t: string, @CurrentUser() u: { role: string }, @Body() dto: CreateVehicleDto) {
        return this.service.create(t, u.role, dto);
    }

    @Patch(':id')
    @Perm('catalog.manage')
    update(@TenantId() t: string, @CurrentUser() u: { role: string }, @Param('id') id: string, @Body() dto: UpdateVehicleDto) {
        return this.service.update(t, u.role, id, dto);
    }

    @Delete(':id')
    @Perm('catalog.manage')
    remove(@TenantId() t: string, @CurrentUser() u: { role: string }, @Param('id') id: string) {
        return this.service.remove(t, u.role, id);
    }
}
