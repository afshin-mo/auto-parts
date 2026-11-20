import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, IsDateString, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CheckType, CheckStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateCheckDto {
    @ApiProperty({ enum: CheckType, description: 'RECEIVED = چک دریافتی، PAID = چک پرداختی' })
    @IsEnum(CheckType)
    checkType: CheckType;

    @ApiProperty({ example: '123456' }) @IsString() @IsNotEmpty() @MaxLength(50) checkNumber: string;
    @ApiProperty({ example: 'بانک ملت' }) @IsString() @IsNotEmpty() @MaxLength(100) bankName: string;
    @ApiPropertyOptional() @IsString() @IsOptional() branchName?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() branchCode?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() accountNumber?: string;

    @ApiProperty({ example: 50000000 })
    @Type(() => Number) @IsNumber() @Min(1)
    amount: number;

    @ApiProperty({ example: '2026-12-01' }) @IsDateString() dueDate: string;
    @ApiPropertyOptional({ example: '2026-10-09' }) @IsDateString() @IsOptional() issueDate?: string;

    @ApiPropertyOptional() @IsString() @IsOptional() partyId?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() partyName?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() invoiceId?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
}

export class QueryChecksDto extends PaginationDto {
    @ApiPropertyOptional({ enum: CheckType }) @IsEnum(CheckType) @IsOptional() checkType?: CheckType;
    @ApiPropertyOptional({ enum: CheckStatus }) @IsEnum(CheckStatus) @IsOptional() status?: CheckStatus;
    @ApiPropertyOptional() @IsString() @IsOptional() partyId?: string;
}

export class BounceCheckDto {
    @ApiProperty({ example: 'عدم موجودی' })
    @IsString() @IsNotEmpty() @MaxLength(300)
    reason: string;
}
