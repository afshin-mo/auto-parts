import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UnitsService } from './units.service';
import { CreateUnitDto, UpdateUnitDto } from './dto/unit.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perm } from '../../common/decorators/permissions.decorator';

@ApiTags('Units')
@ApiBearerAuth()
@Controller('units')
export class UnitsController {
    constructor(private readonly service: UnitsService) { }

    @Get()
    findAll(@TenantId() t: string) {
        return this.service.findAll(t);
    }

    @Post()
    @Perm('catalog.manage')
    create(@TenantId() t: string, @CurrentUser() u: { role: string }, @Body() dto: CreateUnitDto) {
        return this.service.create(t, u.role, dto);
    }

    @Patch(':id')
    @Perm('catalog.manage')
    update(@TenantId() t: string, @CurrentUser() u: { role: string }, @Param('id') id: string, @Body() dto: UpdateUnitDto) {
        return this.service.update(t, u.role, id, dto);
    }

    @Delete(':id')
    @Perm('catalog.manage')
    remove(@TenantId() t: string, @CurrentUser() u: { role: string }, @Param('id') id: string) {
        return this.service.remove(t, u.role, id);
    }
}
