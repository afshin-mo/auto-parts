import { IsBoolean, IsIn, IsObject, IsOptional, IsString, Matches, MaxLength, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateMoodianSettingsDto {
    @ApiPropertyOptional({ enum: ['sandbox', 'production'] }) @IsIn(['sandbox', 'production']) @IsOptional() environment?: 'sandbox' | 'production';
    @ApiPropertyOptional({ description: 'شناسه یکتای حافظه مالیاتی (۶ کاراکتر)' }) @Matches(/^[A-Za-z0-9]{6}$/, { message: 'memoryId باید ۶ کاراکتر انگلیسی/عدد باشد' }) @IsOptional() memoryId?: string;
    @ApiPropertyOptional({ description: 'شماره اقتصادی فروشنده' }) @Matches(/^\d{11,14}$/, { message: 'economicCode باید ۱۱ تا ۱۴ رقم باشد' }) @IsOptional() economicCode?: string;
    @ApiPropertyOptional({ description: 'کلید خصوصی (PEM). فقط هنگام تغییر ارسال شود؛ هرگز بازگردانده نمی‌شود' }) @IsString() @MaxLength(8000) @IsOptional() privateKey?: string;
    @ApiPropertyOptional() @IsString() @MaxLength(4000) @IsOptional() serverPublicKey?: string;
    @ApiPropertyOptional() @IsString() @MaxLength(200) @IsOptional() serverKeyId?: string;
    @ApiPropertyOptional({ description: 'نگاشت کد واحد سیستم به کد واحد مالیاتی، مثلاً {"pair":"1648"}' }) @IsObject() @IsOptional() unitCodes?: Record<string, string>;
    @ApiPropertyOptional() @IsBoolean() @IsOptional() enabled?: boolean;
}

export class SyncDto {
    @ApiPropertyOptional({ default: 25 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit?: number;
}
