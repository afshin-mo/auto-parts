import { IsString, IsOptional, IsObject, IsIn, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTenantDto {
    @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(200) name?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() ownerName?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() nationalId?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() economicCode?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() address?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() city?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() province?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() postalCode?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() website?: string;
    @ApiPropertyOptional({ description: 'تنظیمات آزاد فروشگاه (واحد پول، درصد مالیات پیش‌فرض و ...)' })
    @IsObject() @IsOptional() settings?: Record<string, any>;
}
