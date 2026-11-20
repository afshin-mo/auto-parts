import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryTransactionsDto extends PaginationDto {
    @ApiPropertyOptional() @IsString() @IsOptional() productId?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() warehouseId?: string;
    @ApiPropertyOptional({ enum: TransactionType }) @IsEnum(TransactionType) @IsOptional() type?: TransactionType;
    @ApiPropertyOptional() @IsDateString() @IsOptional() from?: string;
    @ApiPropertyOptional() @IsDateString() @IsOptional() to?: string;
}
