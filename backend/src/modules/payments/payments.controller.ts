import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto, QueryPaymentDto } from './dto/payment.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BranchCtx } from '../../common/decorators/branch.decorator';
import { BranchContext } from '../../common/branch.context';
import { Perm } from '../../common/decorators/permissions.decorator';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
    constructor(private readonly service: PaymentsService) { }

    @Get()
    @Perm('payments.view')
    findAll(@TenantId() tenantId: string, @BranchCtx() ctx: BranchContext, @Query() query: QueryPaymentDto) {
        return this.service.findAll(tenantId, query, ctx);
    }

    @Post()
    @Perm('payments.create')
    @ApiOperation({ summary: 'ثبت دریافت یا پرداخت (اختیاری: تسویه یک فاکتور)' })
    create(@TenantId() tenantId: string, @CurrentUser() user: { id: string }, @BranchCtx() ctx: BranchContext, @Body() dto: CreatePaymentDto) {
        return this.service.create(tenantId, user.id, dto, ctx);
    }
}
