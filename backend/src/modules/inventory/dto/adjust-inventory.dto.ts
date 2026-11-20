import { IsString, IsNotEmpty, IsNumber, IsIn, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AdjustInventoryDto {
    @ApiProperty() @IsString() @IsNotEmpty() productId: string;
    @ApiProperty() @IsString() @IsNotEmpty() warehouseId: string;

    @ApiProperty({ enum: ['ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE'] })
    @IsIn(['ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE'])
    transactionType: 'ADJUSTMENT_INCREASE' | 'ADJUSTMENT_DECREASE';

    @ApiProperty({ example: 10 })
    @Type(() => Number)
    @IsNumber()
    @Min(0.0001)
    quantity: number;

    @ApiPropertyOptional({ example: 150000, description: 'اگر خالی باشد قیمت خرید کالا استفاده می‌شود' })
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @IsOptional()
    unitCost?: number;

    @ApiPropertyOptional({ example: 'اصلاح موجودی' })
    @IsString()
    @IsOptional()
    notes?: string;
}
