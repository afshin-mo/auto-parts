import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateGatewaySettingsDto {
    @ApiPropertyOptional({ description: 'مرچنت‌کد زرین‌پال (UUID)؛ فقط هنگام تغییر ارسال شود' })
    @Matches(/^[0-9a-fA-F-]{36}$/, { message: 'merchantId باید مرچنت‌کد ۳۶ کاراکتری زرین‌پال باشد' }) @IsOptional() merchantId?: string;
    @ApiPropertyOptional({ description: 'محیط آزمایشی زرین‌پال' }) @IsBoolean() @IsOptional() sandbox?: boolean;
    @ApiPropertyOptional({ enum: ['zarinpal'] }) @IsIn(['zarinpal']) @IsOptional() provider?: 'zarinpal';
    @ApiPropertyOptional() @IsBoolean() @IsOptional() enabled?: boolean;
}

export class CreateLinkDto {
    @ApiPropertyOptional({ description: 'مبلغ (ریال)؛ پیش‌فرض: مانده فاکتور' }) @Type(() => Number) @IsNumber() @Min(1000) @IsOptional() amount?: number;
}

export class CallbackQuery {
    @IsString() @IsOptional() Authority?: string;
    @IsString() @IsOptional() Status?: string;
}
