import { IsString, IsNotEmpty, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateWarehouseDto {
    @ApiProperty({ example: 'انبار شعبه ۲' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @ApiProperty({ example: 'W2' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    code: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    address?: string;

    @ApiPropertyOptional({ description: 'شعبه‌ی صاحب انبار' })
    @IsString()
    @IsOptional()
    branchId?: string;

    @ApiPropertyOptional()
    @IsBoolean()
    @IsOptional()
    isDefault?: boolean;

    @ApiPropertyOptional()
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}

export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto) { }
