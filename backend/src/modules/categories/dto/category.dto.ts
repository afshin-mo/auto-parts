import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsInt, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateCategoryDto {
    @ApiProperty({ example: 'لنت ترمز' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    code?: string;

    @ApiPropertyOptional({ description: 'شناسه دسته والد' })
    @IsString()
    @IsOptional()
    parentId?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional()
    @IsInt()
    @IsOptional()
    sortOrder?: number;

    @ApiPropertyOptional()
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) { }
