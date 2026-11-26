import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, IsDateString, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateWithdrawalDto {
    @ApiProperty({ example: 'علی رضایی', description: 'شریک، کارمند یا صاحب فروشگاه' }) @IsString() @IsNotEmpty() @MaxLength(120) personName: string;
    @ApiProperty({ example: 5000000 }) @Type(() => Number) @IsNumber() @Min(1) amount: number;
    @ApiPropertyOptional({ enum: PaymentMethod }) @IsEnum(PaymentMethod) @IsOptional() method?: PaymentMethod;
    @ApiPropertyOptional({ example: '2026-10-09' }) @IsDateString() @IsOptional() date?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
}

export class QueryWithdrawalsDto extends PaginationDto {
    @ApiPropertyOptional({ description: 'نام شخص (مطابقت دقیق)' }) @IsString() @IsOptional() personName?: string;
    @ApiPropertyOptional() @IsDateString() @IsOptional() from?: string;
    @ApiPropertyOptional() @IsDateString() @IsOptional() to?: string;
}
