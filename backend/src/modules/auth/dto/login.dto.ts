import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IR_MOBILE_REGEX, normalizePhone } from '../../../common/utils/phone.util';

export class LoginDto {
    @ApiProperty({ example: '09123456789' })
    @Transform(({ value }) => normalizePhone(value))
    @Matches(IR_MOBILE_REGEX, { message: 'phone باید شماره موبایل معتبر باشد' })
    phone: string;

    @ApiProperty({ example: 'password123' })
    @IsString()
    @IsNotEmpty()
    password: string;
}
