import { IsOptional, IsString, IsEnum, IsDateString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus, PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryInvoicesDto extends PaginationDto {
    @ApiPropertyOptional({ enum: InvoiceStatus }) @IsEnum(InvoiceStatus) @IsOptional() status?: InvoiceStatus;
    @ApiPropertyOptional() @IsString() @IsOptional() partyId?: string;
    @ApiPropertyOptional() @IsDateString() @IsOptional() from?: string;
    @ApiPropertyOptional() @IsDateString() @IsOptional() to?: string;
}

export class CancelInvoiceDto {
    @ApiProperty({ example: 'درخواست مشتری' })
    @IsString() @IsNotEmpty() @MaxLength(300)
    reason: string;
}

export class InvoicePaymentDto {
    @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) method: PaymentMethod;

    @ApiProperty()
    @Type(() => Number) @IsNumber() @Min(1)
    amount: number;

    @ApiPropertyOptional() @IsDateString() @IsOptional() date?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() reference?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
}
