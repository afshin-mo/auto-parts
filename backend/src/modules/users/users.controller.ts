import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto } from './dto/user.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perm } from '../../common/decorators/permissions.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
    constructor(private readonly service: UsersService) { }

    @Get()
    @Perm('users.view')
    findAll(@TenantId() tenantId: string) {
        return this.service.findAll(tenantId);
    }

    @Post()
    @Perm('users.manage')
    create(@TenantId() tenantId: string, @Body() dto: CreateUserDto) {
        return this.service.create(tenantId, dto);
    }

    @Patch(':id')
    @Perm('users.manage')
    update(@TenantId() tenantId: string, @CurrentUser() user: { id: string }, @Param('id') id: string, @Body() dto: UpdateUserDto) {
        return this.service.update(tenantId, user.id, id, dto);
    }

    @Post(':id/reset-password')
    @Perm('users.manage')
    resetPassword(@TenantId() tenantId: string, @CurrentUser() actor: { role: string }, @Param('id') id: string, @Body() dto: ResetPasswordDto) {
        return this.service.resetPassword(tenantId, id, dto.password, actor.role);
    }
}
