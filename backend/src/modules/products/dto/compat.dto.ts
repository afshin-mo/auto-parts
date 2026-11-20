import { IsString, IsNotEmpty, IsOptional, IsInt, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AddCompatibilityDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    vehicleId: string;

    @ApiPropertyOptional({ example: 'جلو' })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    position?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    notes?: string;
}

export class AddSubstituteDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    substituteId: string;

    @ApiPropertyOptional({ default: 1 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @IsOptional()
    priority?: number;

    @ApiPropertyOptional({ example: 'کیفیت معادل، برند دیگر' })
    @IsString()
    @IsOptional()
    @MaxLength(500)
    reason?: string;
}
