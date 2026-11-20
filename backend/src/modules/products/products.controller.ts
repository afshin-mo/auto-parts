import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { ProductsImportService } from './products-import.service';
import { ImportProductsDto } from './dto/import-products.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { AddCompatibilityDto, AddSubstituteDto } from './dto/compat.dto';
import { AddCodeDto, LookupQueryDto, QuickProductDto } from './dto/product-extras.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BranchCtx } from '../../common/decorators/branch.decorator';
import { BranchContext } from '../../common/branch.context';
import { Perm } from '../../common/decorators/permissions.decorator';

type U = { id: string; permissions?: string[] };
const cost = (u: U) => !!u.permissions?.includes('products.viewCost');

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
    constructor(private readonly productsService: ProductsService, private readonly importer: ProductsImportService) { }

    @Post()
    @Perm('products.create')
    @ApiOperation({ summary: 'ایجاد کالا (با امکان ثبت موجودی اولیه)' })
    create(@TenantId() tenantId: string, @CurrentUser() user: U, @BranchCtx() ctx: BranchContext, @Body() dto: CreateProductDto) {
        return this.productsService.create(tenantId, user.id, dto, ctx);
    }

    @Post('quick')
    @Perm('products.create')
    @ApiOperation({ summary: 'ثبت سریع کالا: فقط نام و قیمت لازم است (کد و واحد خودکار)' })
    quick(@TenantId() tenantId: string, @CurrentUser() user: U, @BranchCtx() ctx: BranchContext, @Body() dto: QuickProductDto) {
        return this.productsService.quick(tenantId, user.id, dto, ctx);
    }

    @Get()
    @Perm('products.view')
    @ApiOperation({ summary: 'جستجو و فهرست کالاها' })
    findAll(@TenantId() tenantId: string, @CurrentUser() user: U, @BranchCtx() ctx: BranchContext, @Query() query: QueryProductDto) {
        return this.productsService.findAll(tenantId, query, ctx, cost(user));
    }

    @Get('lookup')
    @Perm('products.view')
    @ApiOperation({ summary: 'جستجوی سریع با شماره فنی/بارکد/نام/خودرو + کالاهای مشابه و موجودی شعبه‌ها' })
    lookup(@TenantId() tenantId: string, @CurrentUser() user: U, @BranchCtx() ctx: BranchContext, @Query() q: LookupQueryDto) {
        return this.productsService.lookup(tenantId, q, ctx, cost(user));
    }

    @Get('export')
    @Perm('products.export')
    @ApiOperation({ summary: 'خروجی همه‌ی کالاها (برای CSV/اکسل)' })
    exportAll(@TenantId() tenantId: string) {
        return this.importer.exportAll(tenantId);
    }

    @Post('import')
    @Perm('products.import')
    @ApiOperation({ summary: 'ورود گروهی کالا (dryRun برای پیش‌نمایش)' })
    importRows(@TenantId() tenantId: string, @CurrentUser() user: U, @BranchCtx() ctx: BranchContext, @Body() dto: ImportProductsDto) {
        return this.importer.importRows(tenantId, user.id, dto, ctx);
    }

    @Get(':id')
    @Perm('products.view')
    findOne(@TenantId() tenantId: string, @CurrentUser() user: U, @BranchCtx() ctx: BranchContext, @Param('id') id: string) {
        return this.productsService.findOne(tenantId, id, ctx, cost(user));
    }

    @Patch(':id')
    @Perm('products.edit')
    update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateProductDto) {
        return this.productsService.update(tenantId, id, dto);
    }

    @Delete(':id')
    @Perm('products.delete')
    @ApiOperation({ summary: 'حذف نرم کالا' })
    remove(@TenantId() tenantId: string, @Param('id') id: string) {
        return this.productsService.remove(tenantId, id);
    }

    @Post(':id/codes')
    @Perm('products.edit')
    @ApiOperation({ summary: 'افزودن شماره‌ی فنی/معادل برای جستجو' })
    addCode(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: AddCodeDto) {
        return this.productsService.addCode(tenantId, id, dto);
    }

    @Delete(':id/codes/:codeId')
    @Perm('products.edit')
    removeCode(@TenantId() tenantId: string, @Param('id') id: string, @Param('codeId') codeId: string) {
        return this.productsService.removeCode(tenantId, id, codeId);
    }

    @Post(':id/vehicles')
    @Perm('products.edit')
    addVehicle(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: AddCompatibilityDto) {
        return this.productsService.addCompatibility(tenantId, id, dto);
    }

    @Delete(':id/vehicles/:vehicleId')
    @Perm('products.edit')
    removeVehicle(@TenantId() tenantId: string, @Param('id') id: string, @Param('vehicleId') vehicleId: string) {
        return this.productsService.removeCompatibility(tenantId, id, vehicleId);
    }

    @Post(':id/substitutes')
    @Perm('products.edit')
    addSubstitute(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: AddSubstituteDto) {
        return this.productsService.addSubstitute(tenantId, id, dto);
    }

    @Delete(':id/substitutes/:substituteId')
    @Perm('products.edit')
    removeSubstitute(@TenantId() tenantId: string, @Param('id') id: string, @Param('substituteId') substituteId: string) {
        return this.productsService.removeSubstitute(tenantId, id, substituteId);
    }
}
