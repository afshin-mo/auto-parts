import { IsString, IsNotEmpty, IsOptional, IsNumber, IsArray, IsBoolean, MaxLength, ValidateNested, IsEnum, IsDateString, ArrayMinSize, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

export class SaleItemDto {
    @ApiProperty() @IsString() @IsNotEmpty() productId: string;

    @ApiProperty()
    @Type(() => Number) @IsNumber() @Min(0.0001)
    quantity: number;

    @ApiProperty()
    @Type(() => Number) @IsNumber() @Min(0)
    unitPrice: number;

    @ApiPropertyOptional()
    @Type(() => Number) @IsNumber() @Min(0) @Max(100) @IsOptional()
    discountPercent?: number;

    @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;

    @ApiPropertyOptional({ description: 'ردیف قیمت خرید (InventoryLot) که این قلم از آن فروخته می‌شود؛ بهای تمام‌شده و سود از همین قیمت محاسبه می‌شود. خالی = قدیمی‌ترین قیمت (یا میانگین موزون اگر در تنظیمات فعال باشد)' })
    @IsString() @IsOptional() lotId?: string;
}

export class CreateSaleDto {
    @ApiPropertyOptional({ description: 'کلید یکتای کلاینت؛ ارسال دوباره‌ی همان کلید، همان فاکتور را برمی‌گرداند (فروش آفلاین)' })
    @IsString() @MaxLength(64) @IsOptional() clientRequestId?: string;

    @ApiPropertyOptional({ description: 'تسویه‌ی کامل با مبلغ محاسبه‌شده‌ی سرور (فروش نقدی؛ اختلاف گرد‌کردن مرورگر و سرور مهم نیست)' })
    @IsBoolean() @IsOptional() payInFull?: boolean;

    @ApiPropertyOptional({ description: 'مشتری ثبت‌شده. برای فروش نسیه الزامی است' })
    @IsString() @IsOptional() partyId?: string;

    @ApiPropertyOptional({ description: 'نام مشتری متفرقه' })
    @IsString() @IsOptional() partyName?: string;

    @ApiPropertyOptional() @IsString() @IsOptional() partyNationalId?: string;

    @ApiProperty({ type: [SaleItemDto] })
    @IsArray()
    @ArrayMinSize(1, { message: 'items حداقل یک ردیف لازم است' })
    @ValidateNested({ each: true })
    @Type(() => SaleItemDto)
    items: SaleItemDto[];

    @ApiPropertyOptional()
    @Type(() => Number) @IsNumber() @Min(0) @Max(100) @IsOptional()
    discountPercent?: number;

    @ApiPropertyOptional()
    @Type(() => Number) @IsNumber() @Min(0) @IsOptional()
    discountAmount?: number;

    @ApiPropertyOptional({ default: 9 })
    @Type(() => Number) @IsNumber() @Min(0) @Max(100) @IsOptional()
    vatPercent?: number;

    @ApiPropertyOptional({ description: 'مبلغ دریافتی هنگام ثبت فاکتور' })
    @Type(() => Number) @IsNumber() @Min(0) @IsOptional()
    paidAmount?: number;

    @ApiPropertyOptional({ enum: PaymentMethod, default: 'CASH' })
    @IsEnum(PaymentMethod) @IsOptional() paymentMethod?: PaymentMethod;

    @ApiPropertyOptional() @IsString() @IsOptional() paymentReference?: string;

    @ApiPropertyOptional({ description: 'انبار خروج کالا؛ پیش‌فرض: انبار پیش‌فرض' })
    @IsString() @IsOptional() warehouseId?: string;

    @ApiPropertyOptional({ example: '2026-10-09' }) @IsDateString() @IsOptional() date?: string;
    @ApiPropertyOptional({ example: '2026-11-09' }) @IsDateString() @IsOptional() dueDate?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() internalNotes?: string;
}
