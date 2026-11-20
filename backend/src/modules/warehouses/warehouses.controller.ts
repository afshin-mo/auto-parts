import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { BranchCtx } from '../../common/decorators/branch.decorator';
import { BranchContext } from '../../common/branch.context';
import { Perm } from '../../common/decorators/permissions.decorator';

@ApiTags('Warehouses')
@ApiBearerAuth()
@Controller('warehouses')
export class WarehousesController {
    constructor(private readonly service: WarehousesService) { }

    @Get()
    findAll(@TenantId() tenantId: string, @BranchCtx() ctx: BranchContext) {
        return this.service.findAll(tenantId, ctx);
    }

    @Post()
    @Perm('warehouses.manage')
    create(@TenantId() tenantId: string, @BranchCtx() ctx: BranchContext, @Body() dto: CreateWarehouseDto) {
        return this.service.create(tenantId, dto, ctx);
    }

    @Patch(':id')
    @Perm('warehouses.manage')
    update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
        return this.service.update(tenantId, id, dto);
    }

    @Delete(':id')
    @Perm('warehouses.delete')
    remove(@TenantId() tenantId: string, @Param('id') id: string) {
        return this.service.remove(tenantId, id);
    }
}
