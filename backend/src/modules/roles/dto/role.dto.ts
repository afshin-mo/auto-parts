import { IsString, IsNotEmpty, IsOptional, IsArray, ArrayMaxSize, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
    @ApiProperty({ example: 'فروشنده‌ی ارشد' })
    @IsString() @IsNotEmpty() @MaxLength(60)
    name: string;

    @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(300)
    description?: string;

    @ApiProperty({ type: [String], example: ['products.view', 'sales.create'] })
    @IsArray() @ArrayMaxSize(200) @IsString({ each: true })
    permissions: string[];
}

export class UpdateRoleDto {
    @ApiPropertyOptional() @IsString() @IsNotEmpty() @MaxLength(60) @IsOptional()
    name?: string;

    @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(300)
    description?: string;

    @ApiPropertyOptional({ type: [String] })
    @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @IsOptional()
    permissions?: string[];
}
