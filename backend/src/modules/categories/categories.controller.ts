import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perm } from '../../common/decorators/permissions.decorator';

@ApiTags('Categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
    constructor(private readonly service: CategoriesService) { }

    @Get()
    findAll(@TenantId() t: string) {
        return this.service.findAll(t);
    }

    @Post()
    @Perm('catalog.manage')
    create(@TenantId() t: string, @CurrentUser() u: { role: string }, @Body() dto: CreateCategoryDto) {
        return this.service.create(t, u.role, dto);
    }

    @Patch(':id')
    @Perm('catalog.manage')
    update(@TenantId() t: string, @CurrentUser() u: { role: string }, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
        return this.service.update(t, u.role, id, dto);
    }

    @Delete(':id')
    @Perm('catalog.manage')
    remove(@TenantId() t: string, @CurrentUser() u: { role: string }, @Param('id') id: string) {
        return this.service.remove(t, u.role, id);
    }
}
