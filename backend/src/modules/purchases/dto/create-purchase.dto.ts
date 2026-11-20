import { IsString, IsNotEmpty, IsOptional, IsNumber, IsArray, ValidateNested, IsEnum, IsDateString, IsBoolean, ArrayMinSize, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

export class PurchaseItemDto {
    @ApiProperty() @IsString() @IsNotEmpty() productId: string;

    @ApiProperty()
    @Type(() => Number) @IsNumber() @Min(0.0001)
    quantity: number;

    @ApiProperty({ description: 'قیمت خرید هر واحد' })
    @Type(() => Number) @IsNumber() @Min(0)
    unitPrice: number;

    @ApiPropertyOptional()
    @Type(() => Number) @IsNumber() @Min(0) @Max(100) @IsOptional()
    discountPercent?: number;
}

export class CreatePurchaseDto {
    @ApiPropertyOptional({ description: 'تأمین‌کننده ثبت‌شده؛ برای خرید نسیه الزامی است' })
    @IsString() @IsOptional() partyId?: string;

    @ApiPropertyOptional() @IsString() @IsOptional() partyName?: string;

    @ApiPropertyOptional({ description: 'شماره فاکتور تأمین‌کننده' })
    @IsString() @IsOptional() supplierInvoiceNumber?: string;

    @ApiProperty({ type: [PurchaseItemDto] })
    @IsArray()
    @ArrayMinSize(1, { message: 'items حداقل یک ردیف لازم است' })
    @ValidateNested({ each: true })
    @Type(() => PurchaseItemDto)
    items: PurchaseItemDto[];

    @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) @IsOptional() discountPercent?: number;
    @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @IsOptional() discountAmount?: number;
    @ApiPropertyOptional({ default: 9 }) @Type(() => Number) @IsNumber() @Min(0) @Max(100) @IsOptional() vatPercent?: number;

    @ApiPropertyOptional({ description: 'مبلغ پرداخت‌شده هنگام ثبت' })
    @Type(() => Number) @IsNumber() @Min(0) @IsOptional()
    paidAmount?: number;

    @ApiPropertyOptional({ enum: PaymentMethod, default: 'CASH' }) @IsEnum(PaymentMethod) @IsOptional() paymentMethod?: PaymentMethod;
    @ApiPropertyOptional() @IsString() @IsOptional() paymentReference?: string;

    @ApiPropertyOptional({ description: 'انبار ورود کالا؛ پیش‌فرض: انبار پیش‌فرض' })
    @IsString() @IsOptional() warehouseId?: string;

    @ApiPropertyOptional({ default: true, description: 'قیمت خرید کالاها با قیمت این فاکتور به‌روز شود' })
    @IsBoolean() @IsOptional() updatePurchasePrice?: boolean;

    @ApiPropertyOptional() @IsDateString() @IsOptional() date?: string;
    @ApiPropertyOptional() @IsDateString() @IsOptional() dueDate?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
}
