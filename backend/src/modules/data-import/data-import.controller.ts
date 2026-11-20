import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DataImportService } from './data-import.service';
import { ImportPartiesDto, ImportProductsLoggedDto, ImportStockDto } from './dto/data-import.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BranchCtx } from '../../common/decorators/branch.decorator';
import { BranchContext } from '../../common/branch.context';
import { Perm } from '../../common/decorators/permissions.decorator';

@ApiTags('DataImport')
@ApiBearerAuth()
@Controller('data-import')
export class DataImportController {
    constructor(private readonly service: DataImportService) { }

    @Get('history') @Perm('data.import')
    history(@TenantId() t: string) { return this.service.history(t); }

    @Post('products') @Perm('data.import')
    @ApiOperation({ summary: 'ورود کالاها از فایل نرم‌افزار قبلی (dryRun برای پیش‌نمایش)' })
    products(@TenantId() t: string, @CurrentUser() u: { id: string }, @BranchCtx() ctx: BranchContext, @Body() dto: ImportProductsLoggedDto) { return this.service.importProducts(t, u.id, dto, ctx); }

    @Post('parties') @Perm('data.import')
    @ApiOperation({ summary: 'ورود مشتریان/تأمین‌کنندگان با مانده‌ی اول دوره' })
    parties(@TenantId() t: string, @CurrentUser() u: { id: string }, @Body() dto: ImportPartiesDto) { return this.service.importParties(t, u.id, dto); }

    @Post('stock') @Perm('data.import')
    @ApiOperation({ summary: 'ثبت موجودی اول دوره‌ی انبار (SET یا ADD)' })
    stock(@TenantId() t: string, @CurrentUser() u: { id: string }, @BranchCtx() ctx: BranchContext, @Body() dto: ImportStockDto) { return this.service.importStock(t, u.id, dto, ctx); }
}
