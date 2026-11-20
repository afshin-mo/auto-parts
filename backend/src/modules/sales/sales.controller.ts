import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { QueryInvoicesDto, CancelInvoiceDto, InvoicePaymentDto } from './dto/sales-query.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BranchCtx } from '../../common/decorators/branch.decorator';
import { BranchContext } from '../../common/branch.context';
import { Perm } from '../../common/decorators/permissions.decorator';

@ApiTags('Sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
    constructor(private readonly salesService: SalesService) { }

    @Post()
    @Perm('sales.create')
    @ApiOperation({ summary: 'صدور فاکتور فروش' })
    create(@TenantId() tenantId: string, @CurrentUser() user: { id: string }, @BranchCtx() ctx: BranchContext, @Body() dto: CreateSaleDto) {
        return this.salesService.createSale(tenantId, user.id, dto, ctx);
    }

    @Get()
    @Perm('sales.view')
    findAll(@TenantId() tenantId: string, @BranchCtx() ctx: BranchContext, @Query() query: QueryInvoicesDto) {
        return this.salesService.findAll(tenantId, query, ctx);
    }

    @Get(':id')
    @Perm('sales.view')
    findOne(@TenantId() tenantId: string, @BranchCtx() ctx: BranchContext, @Param('id') id: string) {
        return this.salesService.findOne(tenantId, id, ctx);
    }

    @Post(':id/payments')
    @Perm('sales.receive')
    @ApiOperation({ summary: 'ثبت دریافت برای فاکتور' })
    addPayment(@TenantId() tenantId: string, @CurrentUser() user: { id: string }, @BranchCtx() ctx: BranchContext, @Param('id') id: string, @Body() dto: InvoicePaymentDto) {
        return this.salesService.addPayment(tenantId, user.id, id, dto, ctx);
    }

    @Post(':id/cancel')
    @Perm('sales.cancel')
    @ApiOperation({ summary: 'لغو فاکتور و بازگرداندن موجودی' })
    cancel(@TenantId() tenantId: string, @CurrentUser() user: { id: string }, @BranchCtx() ctx: BranchContext, @Param('id') id: string, @Body() dto: CancelInvoiceDto) {
        return this.salesService.cancelInvoice(tenantId, user.id, id, dto.reason, ctx);
    }
}
