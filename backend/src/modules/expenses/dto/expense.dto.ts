import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, IsDateString, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateExpenseDto {
    @ApiProperty({ example: 'اجاره' }) @IsString() @IsNotEmpty() @MaxLength(100) category: string;
    @ApiProperty({ example: 25000000 }) @Type(() => Number) @IsNumber() @Min(1) amount: number;
    @ApiPropertyOptional({ example: '2026-10-09' }) @IsDateString() @IsOptional() date?: string;
    @ApiPropertyOptional({ enum: PaymentMethod }) @IsEnum(PaymentMethod) @IsOptional() method?: PaymentMethod;
    @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
}

export class QueryExpensesDto extends PaginationDto {
    @ApiPropertyOptional() @IsString() @IsOptional() category?: string;
    @ApiPropertyOptional() @IsDateString() @IsOptional() from?: string;
    @ApiPropertyOptional() @IsDateString() @IsOptional() to?: string;
}
