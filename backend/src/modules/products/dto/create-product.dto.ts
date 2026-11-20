import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsObject, IsInt, Matches, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateProductDto {
    @ApiPropertyOptional({ example: 'BP-206-F', description: 'اگر خالی باشد خودکار ساخته می‌شود (P-000123)' })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    sku?: string;

    @ApiPropertyOptional({ example: 'PN-12345' })
    @IsString()
    @IsOptional()
    partNumber?: string;

    @ApiPropertyOptional({ example: '425230' })
    @IsString()
    @IsOptional()
    oemCode?: string;

    @ApiPropertyOptional({ example: '1234567890123' })
    @IsString()
    @IsOptional()
    barcode?: string;

    @ApiPropertyOptional({ example: '2720000166053', description: 'شناسه ۱۳ رقمی کالا/خدمت در سامانه مودیان' })
    @Matches(/^\d{13}$/, { message: 'taxGoodsId باید ۱۳ رقم باشد' })
    @IsOptional()
    taxGoodsId?: string;

    @ApiProperty({ example: 'لنت جلو پژو 206' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    name: string;

    @ApiPropertyOptional({ example: 'Brake Pad Peugeot 206 Front' })
    @IsString()
    @IsOptional()
    nameEn?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    categoryId?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    brandId?: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    unitId: string;

    @ApiProperty({ example: 150000 })
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    purchasePrice: number;

    @ApiPropertyOptional({ example: 200000, description: 'اختیاری؛ قیمت فروش معمولاً هنگام ثبت فاکتور تعیین می‌شود' })
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @IsOptional()
    salePrice?: number;

    @ApiPropertyOptional({ example: 180000 })
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @IsOptional()
    wholesalePrice?: number;

    @ApiPropertyOptional({ example: 5 })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @IsOptional()
    minStock?: number;

    @ApiPropertyOptional({ example: 100 })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @IsOptional()
    maxStock?: number;

    @ApiPropertyOptional({ example: 'A-3-2' })
    @IsString()
    @IsOptional()
    location?: string;

    @ApiPropertyOptional({ example: 12 })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @IsOptional()
    warrantyMonths?: number;

    @ApiPropertyOptional({ example: { viscosity: '10W-40' } })
    @IsObject()
    @IsOptional()
    attributes?: Record<string, any>;

    @ApiPropertyOptional({ default: true })
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;

    @ApiPropertyOptional({ default: false, description: 'کالای خدماتی (مثل اجرت تعویض) موجودی ندارد' })
    @IsBoolean()
    @IsOptional()
    isService?: boolean;

    @ApiPropertyOptional({ description: 'موجودی اولیه (فقط هنگام ایجاد)' })
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @IsOptional()
    initialQuantity?: number;

    @ApiPropertyOptional({ description: 'انبار موجودی اولیه؛ پیش‌فرض: انبار پیش‌فرض' })
    @IsString()
    @IsOptional()
    warehouseId?: string;
}
