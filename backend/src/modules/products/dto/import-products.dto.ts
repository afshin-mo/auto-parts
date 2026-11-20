import { IsString, IsNotEmpty, IsOptional, IsNumber, IsArray, IsBoolean, ValidateNested, ArrayMaxSize, ArrayMinSize, Matches, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ImportRowDto {
    @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) sku: string;
    @ApiPropertyOptional() @IsString() @IsOptional() name?: string;
    @ApiPropertyOptional({ description: 'نام یا کد واحد؛ پیش‌فرض: عدد' }) @IsString() @IsOptional() unit?: string;
    @ApiPropertyOptional({ description: 'نام دسته؛ اگر نبود ساخته می‌شود' }) @IsString() @IsOptional() category?: string;
    @ApiPropertyOptional({ description: 'نام برند؛ اگر نبود ساخته می‌شود' }) @IsString() @IsOptional() brand?: string;
    @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @IsOptional() purchasePrice?: number;
    @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @IsOptional() salePrice?: number;
    @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @IsOptional() wholesalePrice?: number;
    @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @IsOptional() minStock?: number;
    @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @IsOptional() warrantyMonths?: number;
    @ApiPropertyOptional() @IsString() @IsOptional() oemCode?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() partNumber?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() barcode?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() location?: string;
    @ApiPropertyOptional({ description: 'شناسه ۱۳ رقمی کالا/خدمت (مودیان)' }) @Matches(/^\d{13}$/, { message: 'taxGoodsId باید ۱۳ رقم باشد' }) @IsOptional() taxGoodsId?: string;
    @ApiPropertyOptional({ description: 'نام یا کد انبار برای موجودی اولیه؛ پیش‌فرض: انبار پیش‌فرض شعبه‌ی فعال' }) @IsString() @IsOptional() warehouse?: string;
    @ApiPropertyOptional({ description: 'شماره‌های معادل/برند دیگر؛ با ویرگول یا ؛ جدا شوند' }) @IsString() @IsOptional() altCodes?: string;
    @ApiPropertyOptional({ description: 'موجودی اولیه (فقط برای کالای جدید)' }) @Type(() => Number) @IsNumber() @Min(0) @IsOptional() initialQuantity?: number;
}

export class ImportProductsDto {
    @ApiProperty({ type: [ImportRowDto] })
    @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2000, { message: 'در هر بار حداکثر ۲۰۰۰ ردیف مجاز است' })
    @ValidateNested({ each: true }) @Type(() => ImportRowDto)
    rows: ImportRowDto[];

    @ApiPropertyOptional({ description: 'اگر کد (SKU) از قبل وجود داشت، به‌روزرسانی شود' })
    @IsBoolean() @IsOptional() updateExisting?: boolean;

    @ApiPropertyOptional({ description: 'فقط بررسی کن و چیزی ذخیره نکن' })
    @IsBoolean() @IsOptional() dryRun?: boolean;
}
