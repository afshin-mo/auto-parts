import { IsString, IsNotEmpty, IsOptional, IsEmail, IsIn, IsBoolean, IsArray, ArrayMaxSize, Matches, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IR_MOBILE_REGEX, normalizePhone } from '../../../common/utils/phone.util';

const ASSIGNABLE_ROLES = ['TENANT_ADMIN', 'MANAGER', 'SALESMAN', 'ACCOUNTANT', 'WAREHOUSE'] as const;

export class CreateUserDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @ApiProperty({ example: '09123456789' })
    @Transform(({ value }) => normalizePhone(value))
    @Matches(IR_MOBILE_REGEX, { message: 'phone باید شماره موبایل معتبر باشد' })
    phone: string;

    @ApiPropertyOptional()
    @IsEmail()
    @IsOptional()
    email?: string;

    @ApiProperty()
    @IsString()
    @MinLength(6)
    password: string;

    @ApiPropertyOptional({ enum: ASSIGNABLE_ROLES, default: 'SALESMAN' })
    @IsIn(ASSIGNABLE_ROLES)
    @IsOptional()
    role?: (typeof ASSIGNABLE_ROLES)[number];

    @ApiPropertyOptional({ description: 'نقش دلخواه فروشگاه؛ اگر داده شود، دسترسی‌ها از آن نقش می‌آید' })
    @Transform(({ value }) => (value === '' ? null : value))
    @IsString()
    @IsOptional()
    roleId?: string | null;

    @ApiPropertyOptional({ default: true, description: 'true = همه‌ی شعبه‌ها' })
    @IsBoolean()
    @IsOptional()
    allBranches?: boolean;

    @ApiPropertyOptional({ type: [String], description: 'شعبه‌های مجاز (وقتی allBranches=false)' })
    @IsArray() @ArrayMaxSize(100) @IsString({ each: true })
    @IsOptional()
    branchIds?: string[];

    @ApiPropertyOptional()
    @Transform(({ value }) => (value === '' ? null : value))
    @IsString()
    @IsOptional()
    defaultBranchId?: string | null;
}

export class UpdateUserDto {
    @ApiPropertyOptional()
    @IsString()
    @IsNotEmpty()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional()
    @IsEmail()
    @IsOptional()
    email?: string;

    @ApiPropertyOptional({ enum: ASSIGNABLE_ROLES })
    @IsIn(ASSIGNABLE_ROLES)
    @IsOptional()
    role?: (typeof ASSIGNABLE_ROLES)[number];

    @ApiPropertyOptional()
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;

    @ApiPropertyOptional({ description: 'نقش دلخواه؛ null = برگشت به نقش سیستمی' })
    @Transform(({ value }) => (value === '' ? null : value))
    @IsString()
    @IsOptional()
    roleId?: string | null;

    @ApiPropertyOptional()
    @IsBoolean()
    @IsOptional()
    allBranches?: boolean;

    @ApiPropertyOptional({ type: [String] })
    @IsArray() @ArrayMaxSize(100) @IsString({ each: true })
    @IsOptional()
    branchIds?: string[];

    @ApiPropertyOptional()
    @Transform(({ value }) => (value === '' ? null : value))
    @IsString()
    @IsOptional()
    defaultBranchId?: string | null;
}

export class ResetPasswordDto {
    @ApiProperty()
    @IsString()
    @MinLength(6)
    password: string;
}
