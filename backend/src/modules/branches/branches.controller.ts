import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { BranchCtx } from '../../common/decorators/branch.decorator';
import { BranchContext } from '../../common/branch.context';
import { Perm } from '../../common/decorators/permissions.decorator';

@ApiTags('Branches')
@ApiBearerAuth()
@Controller('branches')
export class BranchesController {
    constructor(private readonly service: BranchesService) { }

    @Get()
    @ApiOperation({ summary: 'شعبه‌هایی که کاربر به آن‌ها دسترسی دارد' })
    findAll(@TenantId() t: string, @BranchCtx() ctx: BranchContext) {
        return this.service.findAll(t, ctx);
    }

    @Post()
    @Perm('branches.manage')
    create(@TenantId() t: string, @Body() dto: CreateBranchDto) {
        return this.service.create(t, dto);
    }

    @Patch(':id')
    @Perm('branches.manage')
    update(@TenantId() t: string, @Param('id') id: string, @Body() dto: UpdateBranchDto) {
        return this.service.update(t, id, dto);
    }
}
