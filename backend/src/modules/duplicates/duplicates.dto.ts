import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class MergeLotsDto {
    @ApiProperty() @IsString() @IsNotEmpty() productId: string;
    @ApiProperty() @IsString() @IsNotEmpty() warehouseId: string;
    @ApiProperty({ description: 'ردیف‌های قیمتی که یکی می‌شوند (حداقل دو تا)' })
    @IsArray() @ArrayMinSize(2) @ArrayMaxSize(50) @IsString({ each: true }) lotIds: string[];
}

export class RemoveLotDto {
    @ApiProperty() @IsString() @IsNotEmpty() lotId: string;
    @ApiProperty({ description: 'دلیل حذف (در تاریخچه‌ی انبار ثبت می‌شود)' }) @IsString() @IsNotEmpty() @MaxLength(200) reason: string;
}

export class MergeProductsDto {
    @ApiProperty({ description: 'کالایی که می‌ماند' }) @IsString() @IsNotEmpty() targetId: string;
    @ApiProperty({ description: 'کالاهایی که در کالای اصلی ادغام و بایگانی می‌شوند' })
    @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsString({ each: true }) sourceIds: string[];
}
