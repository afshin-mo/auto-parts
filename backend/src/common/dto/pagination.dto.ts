import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class PaginationDto {
    @ApiPropertyOptional({ default: 1 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @IsOptional()
    page?: number = 1;

    @ApiPropertyOptional({ default: 20, maximum: 100 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    @IsOptional()
    limit?: number = 20;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    search?: string;

    @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
    @IsString()
    @IsOptional()
    sortOrder?: 'asc' | 'desc' = 'desc';
}

export function buildMeta(total: number, page: number, limit: number) {
    return { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/** فقط فیلدهای مجاز برای مرتب‌سازی را می‌پذیرد */
export function safeSort<T extends string>(field: string | undefined, allowed: readonly T[], fallback: T): T {
    return (allowed as readonly string[]).includes(field ?? '') ? (field as T) : fallback;
}
