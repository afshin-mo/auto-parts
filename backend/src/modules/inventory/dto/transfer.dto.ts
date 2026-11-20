import { IsString, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class TransferInventoryDto {
    @ApiProperty() @IsString() @IsNotEmpty() productId: string;
    @ApiProperty() @IsString() @IsNotEmpty() fromWarehouseId: string;
    @ApiProperty() @IsString() @IsNotEmpty() toWarehouseId: string;

    @ApiProperty({ example: 5 })
    @Type(() => Number)
    @IsNumber()
    @Min(0.0001)
    quantity: number;

    @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
}
