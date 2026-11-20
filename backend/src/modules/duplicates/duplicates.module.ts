import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { DuplicatesController } from './duplicates.controller';
import { DuplicatesService } from './duplicates.service';

@Module({ imports: [InventoryModule], controllers: [DuplicatesController], providers: [DuplicatesService] })
export class DuplicatesModule { }
