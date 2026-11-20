import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProformasService } from './proformas.service';
import { CreateProformaDto, ConvertProformaDto, QueryProformasDto } from './dto/proforma.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BranchCtx } from '../../common/decorators/branch.decorator';
import { BranchContext } from '../../common/branch.context';
import { Perm } from '../../common/decorators/permissions.decorator';

@ApiTags('Proformas')
@ApiBearerAuth()
@Controller('proformas')
export class ProformasController {
    constructor(private readonly service: ProformasService) { }

    @Post()
    @Perm('proformas.manage')
    @ApiOperation({ summary: 'صدور پیش‌فاکتور (بدون اثر روی انبار و حساب)' })
    create(@TenantId() t: string, @CurrentUser() u: { id: string }, @BranchCtx() ctx: BranchContext, @Body() dto: CreateProformaDto) {
        return this.service.create(t, u.id, dto, ctx);
    }

    @Get() @Perm('proformas.view') findAll(@TenantId() t: string, @BranchCtx() ctx: BranchContext, @Query() q: QueryProformasDto) { return this.service.findAll(t, q, ctx); }
    @Get(':id') @Perm('proformas.view') findOne(@TenantId() t: string, @BranchCtx() ctx: BranchContext, @Param('id') id: string) { return this.service.findOne(t, id, ctx); }

    @Post(':id/convert')
    @Perm('proformas.manage')
    @ApiOperation({ summary: 'تبدیل پیش‌فاکتور به فاکتور فروش' })
    convert(@TenantId() t: string, @CurrentUser() u: { id: string }, @BranchCtx() ctx: BranchContext, @Param('id') id: string, @Body() dto: ConvertProformaDto) {
        return this.service.convert(t, u.id, id, dto, ctx);
    }

    @Post(':id/cancel')
    @Perm('proformas.manage')
    cancel(@TenantId() t: string, @BranchCtx() ctx: BranchContext, @Param('id') id: string) { return this.service.cancel(t, id, ctx); }
}
