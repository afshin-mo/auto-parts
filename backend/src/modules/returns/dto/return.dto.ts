import { IsString, IsNotEmpty, IsOptional, IsNumber, IsArray, ValidateNested, IsEnum, IsDateString, ArrayMinSize, Min, MaxLength, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ReturnItemDto {
    @ApiProperty({ description: 'شناسه ردیف فاکتور اصلی' })
    @IsString() @IsNotEmpty() originalItemId: string;

    @ApiProperty()
    @Type(() => Number) @IsNumber() @Min(0.0001)
    quantity: number;
}

export class CreateReturnDto {
    @ApiProperty({ type: [ReturnItemDto] })
    @IsArray()
    @ArrayMinSize(1, { message: 'items حداقل یک ردیف لازم است' })
    @ValidateNested({ each: true })
    @Type(() => ReturnItemDto)
    items: ReturnItemDto[];

    @ApiProperty({ example: 'خرابی کالا' })
    @IsString() @IsNotEmpty() @MaxLength(300)
    reason: string;

    @ApiPropertyOptional({ description: 'مبلغی که همین حالا نقد برگردانده می‌شود (به مشتری، یا از تأمین‌کننده دریافت می‌شود)' })
    @Type(() => Number) @IsNumber() @Min(0) @IsOptional()
    refundAmount?: number;

    @ApiPropertyOptional({ enum: PaymentMethod, default: 'CASH' })
    @IsEnum(PaymentMethod) @IsOptional()
    refundMethod?: PaymentMethod;

    @ApiPropertyOptional() @IsDateString() @IsOptional() date?: string;
}

export class QueryReturnsDto extends PaginationDto {
    @ApiPropertyOptional({ enum: ['sale', 'purchase'] })
    @IsIn(['sale', 'purchase']) @IsOptional()
    kind?: 'sale' | 'purchase';

    @ApiPropertyOptional({ description: 'فقط برگشتی‌های یک فاکتور' })
    @IsString() @IsOptional()
    originalInvoiceId?: string;
}

export class StandaloneReturnItemDto {
    @ApiProperty() @IsString() @IsNotEmpty() productId: string;
    @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.0001) quantity: number;
    @ApiProperty({ description: 'مبلغ برگشت هر واحد (با احتساب مالیات نیست)' }) @Type(() => Number) @IsNumber() @Min(0) unitPrice: number;
}

/** برگشتی بدون ارجاع به فاکتور اصلی (مثلاً کالای فروخته‌شده در گذشته که فاکتورش پیدا نمی‌شود) */
export class CreateStandaloneReturnDto {
    @ApiPropertyOptional() @IsString() @IsOptional() partyId?: string;

    @ApiProperty({ type: [StandaloneReturnItemDto] })
    @IsArray() @ArrayMinSize(1, { message: 'items حداقل یک ردیف لازم است' })
    @ValidateNested({ each: true }) @Type(() => StandaloneReturnItemDto)
    items: StandaloneReturnItemDto[];

    @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(300) reason: string;
    @ApiPropertyOptional({ default: 9 }) @Type(() => Number) @IsNumber() @Min(0) @IsOptional() vatPercent?: number;
    @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @IsOptional() refundAmount?: number;
    @ApiPropertyOptional({ enum: PaymentMethod }) @IsEnum(PaymentMethod) @IsOptional() refundMethod?: PaymentMethod;
    @ApiPropertyOptional() @IsString() @IsOptional() warehouseId?: string;
    @ApiPropertyOptional() @IsDateString() @IsOptional() date?: string;
}
