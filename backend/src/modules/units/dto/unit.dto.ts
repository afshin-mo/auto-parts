import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateUnitDto {
    @ApiProperty({ example: 'عدد' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    name: string;

    @ApiProperty({ example: 'pcs' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    code: string;

    @ApiPropertyOptional({ example: 'count', description: 'count | volume | weight | length' })
    @IsString()
    @IsOptional()
    type?: string;

    @ApiPropertyOptional({ default: 1 })
    @Type(() => Number)
    @IsNumber()
    @Min(0.0001)
    @IsOptional()
    conversionFactor?: number;
}

export class UpdateUnitDto extends PartialType(CreateUnitDto) { }
