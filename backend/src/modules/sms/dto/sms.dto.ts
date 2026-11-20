import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IR_MOBILE_REGEX, normalizePhone } from '../../../common/utils/phone.util';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class UpdateSmsSettingsDto {
    @ApiPropertyOptional({ enum: ['kavenegar', 'smsir', 'log'], description: 'log = فقط ثبت در گزارش، بدون ارسال واقعی' })
    @IsIn(['kavenegar', 'smsir', 'log']) @IsOptional() provider?: 'kavenegar' | 'smsir' | 'log';
    @ApiPropertyOptional({ description: 'کلید API سرویس‌دهنده؛ فقط هنگام تغییر ارسال شود' }) @IsString() @MaxLength(300) @IsOptional() apiKey?: string;
    @ApiPropertyOptional({ description: 'شماره خط ارسال‌کننده' }) @IsString() @MaxLength(30) @IsOptional() sender?: string;
    @ApiPropertyOptional() @IsBoolean() @IsOptional() enabled?: boolean;
}

export class TestSmsDto {
    @Transform(({ value }) => normalizePhone(value))
    @Matches(IR_MOBILE_REGEX, { message: 'receptor باید شماره موبایل معتبر باشد' })
    receptor: string;
}

export class InvoiceSmsDto {
    @ApiPropertyOptional({ description: 'لینک پرداخت آنلاین که به پیامک اضافه می‌شود' }) @IsString() @MaxLength(300) @IsOptional() payUrl?: string;
}

export class RemindDto {
    @ApiPropertyOptional({ description: 'حداقل بدهی (ریال)', default: 1 }) @Type(() => Number) @IsNumber() @Min(1) @IsOptional() minBalance?: number;
    @ApiPropertyOptional({ description: 'فقط این طرف‌حساب‌ها' }) @IsArray() @IsString({ each: true }) @IsOptional() partyIds?: string[];
    @ApiPropertyOptional({ description: 'فقط پیش‌نمایش گیرندگان، بدون ارسال' }) @IsBoolean() @IsOptional() dryRun?: boolean;
}

export class QuerySmsDto extends PaginationDto { }
