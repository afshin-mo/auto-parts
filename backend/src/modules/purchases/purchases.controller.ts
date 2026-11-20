import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { QueryInvoicesDto, CancelInvoiceDto, InvoicePaymentDto } from '../sales/dto/sales-query.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BranchCtx } from '../../common/decorators/branch.decorator';
import { BranchContext } from '../../common/branch.context';
import { Perm } from '../../common/decorators/permissions.decorator';

@ApiTags('Purchases')
@ApiBearerAuth()
@Controller('purchases')
export class PurchasesController {
    constructor(private readonly service: PurchasesService) { }

    @Post()
    @Perm('purchases.create')
    @ApiOperation({ summary: 'ثبت فاکتور خرید و افزایش موجودی' })
    create(@TenantId() tenantId: string, @CurrentUser() user: { id: string }, @BranchCtx() ctx: BranchContext, @Body() dto: CreatePurchaseDto) {
        return this.service.createPurchase(tenantId, user.id, dto, ctx);
    }

    @Get()
    @Perm('purchases.view')
    findAll(@TenantId() tenantId: string, @BranchCtx() ctx: BranchContext, @Query() query: QueryInvoicesDto) {
        return this.service.findAll(tenantId, query, ctx);
    }

    @Get(':id')
    @Perm('purchases.view')
    findOne(@TenantId() tenantId: string, @BranchCtx() ctx: BranchContext, @Param('id') id: string) {
        return this.service.findOne(tenantId, id, ctx);
    }

    @Post(':id/payments')
    @Perm('purchases.pay')
    @ApiOperation({ summary: 'ثبت پرداخت برای فاکتور خرید' })
    addPayment(@TenantId() tenantId: string, @CurrentUser() user: { id: string }, @BranchCtx() ctx: BranchContext, @Param('id') id: string, @Body() dto: InvoicePaymentDto) {
        return this.service.addPayment(tenantId, user.id, id, dto, ctx);
    }

    @Post(':id/cancel')
    @Perm('purchases.cancel')
    cancel(@TenantId() tenantId: string, @CurrentUser() user: { id: string }, @BranchCtx() ctx: BranchContext, @Param('id') id: string, @Body() dto: CancelInvoiceDto) {
        return this.service.cancelPurchase(tenantId, user.id, id, dto.reason, ctx);
    }
}
