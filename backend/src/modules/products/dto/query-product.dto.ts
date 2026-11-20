import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export const PRODUCT_SORT_FIELDS = ['createdAt', 'name', 'sku', 'salePrice', 'purchasePrice', 'updatedAt'] as const;

export class QueryProductDto extends PaginationDto {
    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    categoryId?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    brandId?: string;

    @ApiPropertyOptional({ description: 'فقط کالاهای سازگار با این خودرو' })
    @IsString()
    @IsOptional()
    vehicleId?: string;

    @ApiPropertyOptional()
    @Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : undefined))
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;

    @ApiPropertyOptional({ enum: PRODUCT_SORT_FIELDS, default: 'createdAt' })
    @IsString()
    @IsOptional()
    sortBy?: string = 'createdAt';
}
