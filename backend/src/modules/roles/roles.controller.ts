import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perm } from '../../common/decorators/permissions.decorator';

type Actor = { id: string; role: string; permissions?: string[] };

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
    constructor(private readonly service: RolesService) { }

    @Get('permissions')
    @ApiOperation({ summary: 'فهرست همه‌ی مجوزها و پیش‌فرض نقش‌های سیستمی' })
    catalog() { return this.service.catalog(); }

    @Get()
    @Perm('users.view', 'roles.manage')
    findAll(@TenantId() t: string) { return this.service.findAll(t); }

    @Post()
    @Perm('roles.manage')
    create(@TenantId() t: string, @CurrentUser() u: Actor, @Body() dto: CreateRoleDto) { return this.service.create(t, u, dto); }

    @Patch(':id')
    @Perm('roles.manage')
    update(@TenantId() t: string, @CurrentUser() u: Actor, @Param('id') id: string, @Body() dto: UpdateRoleDto) { return this.service.update(t, u, id, dto); }

    @Delete(':id')
    @Perm('roles.manage')
    remove(@TenantId() t: string, @Param('id') id: string) { return this.service.remove(t, id); }
}
