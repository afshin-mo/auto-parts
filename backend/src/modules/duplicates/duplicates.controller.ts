import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DuplicatesService } from './duplicates.service';
import { MergeLotsDto, MergeProductsDto, RemoveLotDto } from './duplicates.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BranchCtx } from '../../common/decorators/branch.decorator';
import { BranchContext } from '../../common/branch.context';
import { Perm } from '../../common/decorators/permissions.decorator';

@ApiTags('Duplicates')
@ApiBearerAuth()
@Controller('duplicates')
export class DuplicatesController {
    constructor(private readonly svc: DuplicatesService) { }

    @Get('lots') @Perm('inventory.view')
    @ApiOperation({ summary: 'کالاهایی که در یک انبار چند ردیف قیمت دارند' })
    lots(@TenantId() t: string, @BranchCtx() ctx: BranchContext) { return this.svc.lotGroups(t, ctx); }

    @Post('lots/merge') @Perm('inventory.adjust')
    @ApiOperation({ summary: 'ادغام ردیف‌های قیمت (میانگین موزون)' })
    mergeLots(@TenantId() t: string, @BranchCtx() ctx: BranchContext, @Body() dto: MergeLotsDto) { return this.svc.mergeLots(t, ctx, dto); }

    @Post('lots/remove') @Perm('inventory.adjust')
    @ApiOperation({ summary: 'حذف یک ردیف قیمت (موجودی آن کسر و ثبت می‌شود)' })
    removeLot(@TenantId() t: string, @CurrentUser() user: { id: string }, @BranchCtx() ctx: BranchContext, @Body() dto: RemoveLotDto) { return this.svc.removeLot(t, user.id, ctx, dto); }

    @Get('products') @Perm('products.view')
    @ApiOperation({ summary: 'کاندیدهای کالای تکراری (هم‌برند با کد یا نام یکسان)' })
    products(@TenantId() t: string) { return this.svc.productGroups(t); }

    @Post('products/merge') @Perm('products.delete')
    @ApiOperation({ summary: 'ادغام کالاها در یک کالای اصلی' })
    mergeProducts(@TenantId() t: string, @Body() dto: MergeProductsDto) { return this.svc.mergeProducts(t, dto); }
}
