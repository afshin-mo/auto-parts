import { IsString, IsNotEmpty, IsOptional, IsIn, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateBrandDto {
    @ApiProperty({ example: 'بوش' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @ApiPropertyOptional({ example: 'bosch' })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    code?: string;

    @ApiPropertyOptional({ example: 'آلمان' })
    @IsString()
    @IsOptional()
    country?: string;

    @ApiPropertyOptional({ enum: ['PART', 'VEHICLE'], default: 'PART' })
    @IsIn(['PART', 'VEHICLE'])
    @IsOptional()
    kind?: 'PART' | 'VEHICLE';

    @ApiPropertyOptional()
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}

export class UpdateBrandDto extends PartialType(CreateBrandDto) { }
