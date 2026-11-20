import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ReportsService } from './reports.service';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { BranchCtx } from '../../common/decorators/branch.decorator';
import { BranchContext } from '../../common/branch.context';
import { Perm } from '../../common/decorators/permissions.decorator';

class RangeQuery {
    @IsDateString() @IsOptional() from?: string;
    @IsDateString() @IsOptional() to?: string;
    @IsIn(['day', 'month']) @IsOptional() groupBy?: 'day' | 'month';
    @Type(() => Number) @IsInt() @Min(1) @Max(200) @IsOptional() limit?: number;
    @IsIn(['CUSTOMER', 'SUPPLIER']) @IsOptional() type?: 'CUSTOMER' | 'SUPPLIER';
}

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
    constructor(private readonly service: ReportsService) { }

    @Get('dashboard')
    @Perm('dashboard.view')
    dashboard(@TenantId() t: string, @BranchCtx() ctx: BranchContext) {
        return this.service.dashboard(t, ctx);
    }

    @Get('sales')
    @Perm('reports.sales')
    sales(@TenantId() t: string, @BranchCtx() ctx: BranchContext, @Query() q: RangeQuery) {
        return this.service.salesSummary(t, ctx, q.from, q.to, q.groupBy);
    }

    @Get('top-products')
    @Perm('reports.products')
    topProducts(@TenantId() t: string, @BranchCtx() ctx: BranchContext, @Query() q: RangeQuery) {
        return this.service.topProducts(t, ctx, q.from, q.to, q.limit);
    }

    @Get('profit')
    @Perm('reports.profit')
    profit(@TenantId() t: string, @BranchCtx() ctx: BranchContext, @Query() q: RangeQuery) {
        return this.service.profit(t, ctx, q.from, q.to);
    }

    @Get('product-movers')
    @Perm('reports.products')
    productMovers(@TenantId() t: string, @BranchCtx() ctx: BranchContext, @Query() q: RangeQuery) {
        return this.service.productMovers(t, ctx, q.from, q.to, q.limit);
    }

    @Get('debts')
    @Perm('reports.debts')
    debts(@TenantId() t: string) {
        return this.service.debts(t);
    }

    @Get('receivables')
    @Perm('reports.debts')
    receivables(@TenantId() t: string, @Query() q: RangeQuery) {
        return this.service.receivables(t, q.type);
    }
}
