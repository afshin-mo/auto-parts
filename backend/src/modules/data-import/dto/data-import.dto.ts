import { IsString, IsNotEmpty, IsOptional, IsNumber, IsArray, IsBoolean, IsEnum, IsIn, ValidateNested, ArrayMinSize, ArrayMaxSize, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PartyType } from '@prisma/client';
import { ImportProductsDto } from '../../products/dto/import-products.dto';

class Meta {
    @ApiPropertyOptional({ description: 'نام نرم‌افزار قبلی (برای سابقه)' }) @IsString() @IsOptional() @MaxLength(100) source?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(200) fileName?: string;
    @ApiPropertyOptional({ description: 'فقط بررسی کن و چیزی ذخیره نکن' }) @IsBoolean() @IsOptional() dryRun?: boolean;
}

export class ImportProductsLoggedDto extends ImportProductsDto {
    @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(100) source?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(200) fileName?: string;
}

export class PartyRowDto {
    @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) name: string;
    @ApiPropertyOptional({ enum: PartyType }) @IsEnum(PartyType) @IsOptional() partyType?: PartyType;
    @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(50) code?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() mobile?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() city?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() address?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() nationalId?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() economicCode?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() email?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
    @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @IsOptional() creditLimit?: number;
    @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) @IsOptional() discountPercent?: number;
    @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @IsOptional() paymentTerms?: number;
    @ApiPropertyOptional({ description: 'مانده‌ی اول دوره؛ مثبت = بدهکار به ما (مشتری) / ما بدهکاریم (تأمین‌کننده)' })
    @Type(() => Number) @IsNumber() @IsOptional() openingBalance?: number;
}

export class ImportPartiesDto extends Meta {
    @ApiProperty({ type: [PartyRowDto] })
    @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5000, { message: 'در هر بار حداکثر ۵۰۰۰ ردیف مجاز است' })
    @ValidateNested({ each: true }) @Type(() => PartyRowDto)
    rows: PartyRowDto[];

    @ApiProperty({ enum: PartyType, description: 'نوع طرف‌حساب برای ردیف‌هایی که نوع ندارند' })
    @IsEnum(PartyType) defaultType: PartyType;

    @ApiPropertyOptional({ description: 'اگر طرف‌حساب (با کد یا نام) از قبل بود، مشخصاتش به‌روز شود' })
    @IsBoolean() @IsOptional() updateExisting?: boolean;
}

export class StockRowDto {
    @ApiProperty({ description: 'کد کالا؛ اگر پیدا نشد بارکد/شماره فنی هم بررسی می‌شود' }) @IsString() @IsNotEmpty() code: string;
    @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) quantity: number;
    @ApiPropertyOptional({ description: 'نام یا کد انبار' }) @IsString() @IsOptional() warehouse?: string;
    @ApiPropertyOptional({ description: 'بهای تمام‌شده‌ی واحد' }) @Type(() => Number) @IsNumber() @Min(0) @IsOptional() unitCost?: number;
    @ApiPropertyOptional({ description: 'تأمین‌کننده‌ی این ورود' }) @IsString() @MaxLength(200) @IsOptional() supplier?: string;
    @ApiPropertyOptional({ description: 'توضیح حرکت انبار (مثلاً شماره و تاریخ فاکتور خرید)' }) @IsString() @MaxLength(300) @IsOptional() note?: string;
}

export class ImportStockDto extends Meta {
    @ApiProperty({ type: [StockRowDto] })
    @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5000, { message: 'در هر بار حداکثر ۵۰۰۰ ردیف مجاز است' })
    @ValidateNested({ each: true }) @Type(() => StockRowDto)
    rows: StockRowDto[];

    @ApiProperty({ enum: ['SET', 'ADD'], description: 'SET: موجودی همین عدد شود (انبارگردانی اول دوره) — ADD: به موجودی فعلی اضافه شود' })
    @IsIn(['SET', 'ADD']) mode: 'SET' | 'ADD';

    @ApiPropertyOptional({ description: 'انبار پیش‌فرض ردیف‌هایی که ستون انبار ندارند' })
    @IsString() @IsOptional() warehouseId?: string;
}
