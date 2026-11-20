import { IsString, IsOptional, IsNumber, IsArray, ValidateNested, IsEnum, IsDateString, ArrayMinSize, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';
import { SaleItemDto } from '../../sales/dto/create-sale.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateProformaDto {
    @ApiPropertyOptional() @IsString() @IsOptional() partyId?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() partyName?: string;

    @ApiProperty({ type: [SaleItemDto] })
    @IsArray() @ArrayMinSize(1, { message: 'items حداقل یک ردیف لازم است' })
    @ValidateNested({ each: true }) @Type(() => SaleItemDto)
    items: SaleItemDto[];

    @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @IsOptional() discountAmount?: number;
    @ApiPropertyOptional({ default: 9 }) @Type(() => Number) @IsNumber() @Min(0) @Max(100) @IsOptional() vatPercent?: number;
    @ApiPropertyOptional() @IsDateString() @IsOptional() date?: string;
    @ApiPropertyOptional({ description: 'اعتبار پیش‌فاکتور تا این تاریخ' }) @IsDateString() @IsOptional() validUntil?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
}

export class ConvertProformaDto {
    @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @IsOptional() paidAmount?: number;
    @ApiPropertyOptional({ enum: PaymentMethod }) @IsEnum(PaymentMethod) @IsOptional() paymentMethod?: PaymentMethod;
    @ApiPropertyOptional() @IsString() @IsOptional() warehouseId?: string;
    @ApiPropertyOptional() @IsDateString() @IsOptional() date?: string;
}

export class QueryProformasDto extends PaginationDto {
    @ApiPropertyOptional({ enum: ['OPEN', 'CONVERTED', 'CANCELLED'] })
    @IsString() @IsOptional() state?: 'OPEN' | 'CONVERTED' | 'CANCELLED';
}
