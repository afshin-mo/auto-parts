import { IsString, IsNotEmpty, IsOptional, IsBoolean, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';

export class CreateBranchDto {
    @ApiProperty({ example: 'شعبه شوش' })
    @IsString() @IsNotEmpty() @MaxLength(100)
    name: string;

    @ApiProperty({ example: 'SH', description: 'کد کوتاه انگلیسی/عدد (در شماره فاکتور و گزارش‌ها استفاده می‌شود)' })
    @IsString()
    @Matches(/^[A-Za-z0-9]{1,10}$/, { message: 'code فقط حروف انگلیسی و عدد (حداکثر ۱۰ کاراکتر)' })
    code: string;

    @ApiPropertyOptional() @IsString() @IsOptional() address?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(20) phone?: string;
    @ApiPropertyOptional({ default: true, description: 'همراه شعبه یک انبار با همین نام ساخته شود' })
    @IsBoolean() @IsOptional() createWarehouse?: boolean;
}

export class UpdateBranchDto extends PartialType(OmitType(CreateBranchDto, ['createWarehouse', 'code'] as const)) {
    @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
    @ApiPropertyOptional({ description: 'شعبه‌ی پیش‌فرض فروشگاه' }) @IsBoolean() @IsOptional() isDefault?: boolean;
}
