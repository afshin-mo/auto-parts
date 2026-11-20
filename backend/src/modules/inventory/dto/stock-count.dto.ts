import { IsString, IsNotEmpty, IsArray, ValidateNested, IsNumber, IsOptional, Min, ArrayMinSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class StockCountItemDto {
    @ApiProperty() @IsString() @IsNotEmpty() productId: string;
    @ApiProperty() @IsString() @IsNotEmpty() warehouseId: string;

    @ApiPropertyOptional({ description: 'ردیف قیمت (InventoryLot) که شمارش مربوط به آن است؛ اختلاف فقط روی همین قیمت اعمال می‌شود' })
    @IsString() @IsOptional() lotId?: string;

    @ApiProperty()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    countedQuantity: number;
}

export class StockCountDto {
    @ApiProperty({ type: [StockCountItemDto] })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => StockCountItemDto)
    items: StockCountItemDto[];

    @ApiPropertyOptional({ example: 'انبارگردانی پایان سال' })
    @IsString()
    @IsOptional()
    notes?: string;
}
