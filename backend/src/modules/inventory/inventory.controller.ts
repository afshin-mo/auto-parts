import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { StockCountDto } from './dto/stock-count.dto';
import { TransferInventoryDto } from './dto/transfer.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BranchCtx } from '../../common/decorators/branch.decorator';
import { BranchContext } from '../../common/branch.context';
import { Perm } from '../../common/decorators/permissions.decorator';

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
    constructor(private readonly inventoryService: InventoryService) { }

    @Get()
    @Perm('inventory.view')
    @ApiOperation({ summary: 'موجودی کالاها به تفکیک انبار' })
    getInventory(@TenantId() tenantId: string, @BranchCtx() ctx: BranchContext, @Query('productId') productId?: string, @Query('warehouseId') warehouseId?: string) {
        return this.inventoryService.getInventory(tenantId, ctx, productId, warehouseId);
    }

    @Get('lots')
    @Perm('inventory.view', 'sales.create')
    @ApiOperation({ summary: 'ردیف‌های قیمت خرید یک کالا در انبار (برای انتخاب هنگام فروش)' })
    lots(@TenantId() tenantId: string, @BranchCtx() ctx: BranchContext, @Query('productId') productId: string, @Query('warehouseId') warehouseId?: string) {
        return this.inventoryService.getLots(tenantId, ctx, productId, warehouseId);
    }

    @Get('lots/all')
    @Perm('inventory.view', 'sales.create')
    @ApiOperation({ summary: 'همه‌ی ردیف‌های قیمت یک انبار (برای فروش آفلاین)' })
    allLots(@TenantId() tenantId: string, @BranchCtx() ctx: BranchContext, @Query('warehouseId') warehouseId?: string) {
        return this.inventoryService.getAllLots(tenantId, ctx, warehouseId);
    }

    @Post('adjust')
    @Perm('inventory.adjust')
    @ApiOperation({ summary: 'اصلاح موجودی (افزایش/کاهش)' })
    adjust(@TenantId() tenantId: string, @CurrentUser() user: { id: string }, @BranchCtx() ctx: BranchContext, @Body() dto: AdjustInventoryDto) {
        return this.inventoryService.adjustInventory(tenantId, user.id, dto, ctx);
    }

    @Post('transfer')
    @Perm('inventory.transfer')
    @ApiOperation({ summary: 'انتقال بین انبارها' })
    transfer(@TenantId() tenantId: string, @CurrentUser() user: { id: string }, @BranchCtx() ctx: BranchContext, @Body() dto: TransferInventoryDto) {
        return this.inventoryService.transfer(tenantId, user.id, dto, ctx);
    }

    @Post('stock-count')
    @Perm('inventory.count')
    @ApiOperation({ summary: 'انبارگردانی' })
    stockCount(@TenantId() tenantId: string, @CurrentUser() user: { id: string }, @BranchCtx() ctx: BranchContext, @Body() dto: StockCountDto) {
        return this.inventoryService.performStockCount(tenantId, user.id, dto, ctx);
    }

    @Get('transactions')
    @Perm('inventory.view')
    @ApiOperation({ summary: 'گردش انبار' })
    transactions(@TenantId() tenantId: string, @BranchCtx() ctx: BranchContext, @Query() query: QueryTransactionsDto) {
        return this.inventoryService.getTransactions(tenantId, query, ctx);
    }

    @Get('low-stock')
    @Perm('inventory.view')
    @ApiOperation({ summary: 'کالاهای کم‌موجودی' })
    lowStock(@TenantId() tenantId: string, @BranchCtx() ctx: BranchContext) {
        return this.inventoryService.getLowStockItems(tenantId, ctx);
    }

    @Get('value')
    @Perm('inventory.value')
    @ApiOperation({ summary: 'ارزش ریالی موجودی' })
    value(@TenantId() tenantId: string, @BranchCtx() ctx: BranchContext) {
        return this.inventoryService.getInventoryValue(tenantId, ctx);
    }
}
