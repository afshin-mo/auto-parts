import { IsString, IsOptional, IsEnum, IsNumber, IsDateString, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaymentDirection, PaymentMethod } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreatePaymentDto {
    @ApiProperty({ enum: PaymentDirection, description: 'RECEIVED = دریافت از مشتری، PAID = پرداخت به تأمین‌کننده' })
    @IsEnum(PaymentDirection)
    direction: PaymentDirection;

    @ApiProperty({ enum: PaymentMethod })
    @IsEnum(PaymentMethod)
    method: PaymentMethod;

    @ApiProperty({ example: 5000000 })
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    amount: number;

    @ApiPropertyOptional() @IsString() @IsOptional() partyId?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() invoiceId?: string;
    @ApiPropertyOptional({ example: '2026-10-09' }) @IsDateString() @IsOptional() date?: string;
    @ApiPropertyOptional({ description: 'شماره پیگیری / فیش' }) @IsString() @IsOptional() @MaxLength(100) reference?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
}

export class QueryPaymentDto extends PaginationDto {
    @ApiPropertyOptional({ enum: PaymentDirection }) @IsEnum(PaymentDirection) @IsOptional() direction?: PaymentDirection;
    @ApiPropertyOptional({ enum: PaymentMethod }) @IsEnum(PaymentMethod) @IsOptional() method?: PaymentMethod;
    @ApiPropertyOptional() @IsString() @IsOptional() partyId?: string;
    @ApiPropertyOptional() @IsDateString() @IsOptional() from?: string;
    @ApiPropertyOptional() @IsDateString() @IsOptional() to?: string;
}
