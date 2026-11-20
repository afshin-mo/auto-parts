import { Controller, Get, Post, Body, Param, Query, ParseEnumPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ReturnsService } from './returns.service';
import { CreateReturnDto, CreateStandaloneReturnDto, QueryReturnsDto } from './dto/return.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BranchCtx } from '../../common/decorators/branch.decorator';
import { BranchContext } from '../../common/branch.context';
import { Perm } from '../../common/decorators/permissions.decorator';

enum Kind { sale = 'sale', purchase = 'purchase' }

@ApiTags('Returns')
@ApiBearerAuth()
@Controller('returns')
export class ReturnsController {
    constructor(private readonly service: ReturnsService) { }

    @Get()
    @Perm('returns.view')
    findAll(@TenantId() t: string, @BranchCtx() ctx: BranchContext, @Query() q: QueryReturnsDto) {
        return this.service.findAll(t, q, ctx);
    }

    @Get('invoice/:kind/:invoiceId/returnable')
    @Perm('returns.view')
    @ApiOperation({ summary: 'ردیف‌های قابل برگشت یک فاکتور' })
    returnable(@TenantId() t: string, @BranchCtx() ctx: BranchContext, @Param('kind', new ParseEnumPipe(Kind)) kind: Kind, @Param('invoiceId') id: string) {
        return this.service.returnable(t, kind, id, ctx);
    }

    @Post('invoice/:kind/:invoiceId')
    @Perm('returns.create')
    @ApiOperation({ summary: 'ثبت برگشتی (جزئی یا کامل) برای فاکتور فروش یا خرید' })
    create(@TenantId() t: string, @CurrentUser() u: { id: string }, @BranchCtx() ctx: BranchContext, @Param('kind', new ParseEnumPipe(Kind)) kind: Kind, @Param('invoiceId') id: string, @Body() dto: CreateReturnDto) {
        return this.service.create(t, u.id, kind, id, dto, ctx);
    }

    @Post('standalone/:kind')
    @Perm('returns.create')
    @ApiOperation({ summary: 'برگشتی مستقل از فاکتور اصلی (قابل ارسال به مودیان نیست)' })
    standalone(@TenantId() t: string, @CurrentUser() u: { id: string }, @BranchCtx() ctx: BranchContext, @Param('kind', new ParseEnumPipe(Kind)) kind: Kind, @Body() dto: CreateStandaloneReturnDto) {
        return this.service.createStandalone(t, u.id, kind, dto, ctx);
    }

    @Get(':id')
    @Perm('returns.view')
    findOne(@TenantId() t: string, @BranchCtx() ctx: BranchContext, @Param('id') id: string) {
        return this.service.findOne(t, id, ctx);
    }
}
