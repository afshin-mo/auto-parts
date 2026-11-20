import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ProductCodeType } from '@prisma/client';

export class AddCodeDto {
    @ApiProperty({ enum: ProductCodeType, default: 'AFTERMARKET' })
    @IsEnum(ProductCodeType) @IsOptional()
    type?: ProductCodeType;

    @ApiProperty({ example: '1109.AL' })
    @IsString() @IsNotEmpty() @MaxLength(100)
    code: string;

    @ApiPropertyOptional({ example: 'معادل برند ساکت' })
    @IsString() @IsOptional() @MaxLength(200)
    note?: string;
}

export class LookupQueryDto {
    @ApiPropertyOptional({ description: 'شماره فنی، بارکد، کد یا بخشی از نام' })
    @IsString() @IsOptional() q?: string;

    @ApiPropertyOptional() @IsString() @IsOptional() vehicleId?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() categoryId?: string;

    @ApiPropertyOptional({ default: 20 })
    @Type(() => Number) @IsNumber() @Min(1) @IsOptional()
    limit?: number;

    @ApiPropertyOptional({ description: 'کالاهای مشابه/جایگزین هم برگردانده شود (پیش‌فرض: بله)' })
    @IsString() @IsOptional()
    alternatives?: string;
}

export class QuickProductDto {
    @ApiProperty({ example: 'لنت جلو پژو ۲۰۶' }) @IsString() @IsNotEmpty() @MaxLength(200) name: string;
    @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @IsOptional() salePrice?: number;
    @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @IsOptional() purchasePrice?: number;
    @ApiPropertyOptional() @IsString() @IsOptional() sku?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() barcode?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() oemCode?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() partNumber?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() categoryId?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() brandId?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() unitId?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() location?: string;
    @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @IsOptional() minStock?: number;
    @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @IsOptional() initialQuantity?: number;
    @ApiPropertyOptional() @IsString() @IsOptional() warehouseId?: string;
}

