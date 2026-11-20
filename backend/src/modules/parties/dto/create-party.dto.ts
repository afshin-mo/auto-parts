import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, IsEmail, IsBoolean, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PartyType } from '@prisma/client';

export class CreatePartyDto {
    @ApiProperty({ enum: PartyType })
    @IsEnum(PartyType)
    partyType: PartyType;

    @ApiProperty({ example: 'علی محمدی' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    name: string;

    @ApiPropertyOptional({ example: 'C-0001', description: 'اگر خالی باشد خودکار ساخته می‌شود' })
    @IsString()
    @IsOptional()
    code?: string;

    @ApiPropertyOptional() @IsString() @IsOptional() nationalId?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() economicCode?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() mobile?: string;
    @ApiPropertyOptional() @IsEmail() @IsOptional() email?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() address?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() city?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() postalCode?: string;

    @ApiPropertyOptional({ example: 50000000 })
    @Type(() => Number) @IsNumber() @Min(0) @IsOptional()
    creditLimit?: number;

    @ApiPropertyOptional({ example: 10 })
    @Type(() => Number) @IsNumber() @Min(0) @Max(100) @IsOptional()
    discountPercent?: number;

    @ApiPropertyOptional({ example: 30, description: 'مهلت پرداخت به روز' })
    @Type(() => Number) @IsNumber() @Min(0) @IsOptional()
    paymentTerms?: number;

    @ApiPropertyOptional({ description: 'مانده‌ی اول دوره (ریال). مشتری: مثبت = بدهکار به ما ؛ تأمین‌کننده: مثبت = ما بدهکاریم' })
    @Type(() => Number) @IsNumber() @IsOptional()
    openingBalance?: number;

    @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
    @ApiPropertyOptional({ default: true }) @IsBoolean() @IsOptional() isActive?: boolean;
}
