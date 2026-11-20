import { Module } from '@nestjs/common';
import { DataImportService } from './data-import.service';
import { DataImportController } from './data-import.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductsModule } from '../products/products.module';

@Module({ imports: [InventoryModule, ProductsModule], controllers: [DataImportController], providers: [DataImportService] })
export class DataImportModule { }
