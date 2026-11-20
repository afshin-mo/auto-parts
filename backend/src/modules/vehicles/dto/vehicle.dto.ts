import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateVehicleDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    brandId: string;

    @ApiProperty({ example: '206 تیپ ۵' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    modelName: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    modelCode?: string;

    @ApiProperty({ example: 1385, description: 'سال شمسی شروع تولید' })
    @Type(() => Number)
    @IsInt()
    @Min(1300)
    @Max(1500)
    yearFrom: number;

    @ApiPropertyOptional({ example: 1403 })
    @Type(() => Number)
    @IsInt()
    @Min(1300)
    @Max(1500)
    @IsOptional()
    yearTo?: number;

    @ApiPropertyOptional({ example: 'TU5' })
    @IsString()
    @IsOptional()
    engineType?: string;

    @ApiPropertyOptional({ example: 'بنزین' })
    @IsString()
    @IsOptional()
    fuelType?: string;
}

export class UpdateVehicleDto extends PartialType(CreateVehicleDto) { }
