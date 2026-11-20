import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PartyType } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export const PARTY_SORT_FIELDS = ['createdAt', 'name', 'code', 'currentBalance'] as const;

export class QueryPartyDto extends PaginationDto {
    @ApiPropertyOptional({ enum: PartyType })
    @IsEnum(PartyType)
    @IsOptional()
    partyType?: PartyType;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    city?: string;

    @ApiPropertyOptional({ description: 'فقط حساب‌های بدهکار/بستانکار' })
    @Transform(({ value }) => value === 'true' || value === true)
    @IsOptional()
    withBalance?: boolean;

    @ApiPropertyOptional({ enum: PARTY_SORT_FIELDS, default: 'createdAt' })
    @IsString()
    @IsOptional()
    sortBy?: string = 'createdAt';
}
