import { IsString, IsNotEmpty, IsEmail, IsOptional, MinLength, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IR_MOBILE_REGEX, normalizePhone } from '../../../common/utils/phone.util';

export class RegisterDto {
    @ApiProperty({ example: 'علی محمدی' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @ApiProperty({ example: '09123456789' })
    @Transform(({ value }) => normalizePhone(value))
    @Matches(IR_MOBILE_REGEX, { message: 'phone باید شماره موبایل معتبر باشد' })
    phone: string;

    @ApiProperty({ example: 'ali@example.com', required: false })
    @IsEmail()
    @IsOptional()
    email?: string;

    @ApiProperty({ example: 'password123' })
    @IsString()
    @MinLength(6)
    password: string;

    @ApiProperty({ example: 'یدکی علی' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    tenantName: string;

    @ApiProperty({ example: 'ali-parts', description: 'حروف کوچک انگلیسی، عدد و خط تیره' })
    @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
    @Matches(/^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/, { message: 'tenantSlug فقط حروف انگلیسی کوچک، عدد و خط تیره (۳ تا ۴۰ کاراکتر)' })
    tenantSlug: string;
}
