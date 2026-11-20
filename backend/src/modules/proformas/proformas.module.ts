import { Module } from '@nestjs/common';
import { ProformasService } from './proformas.service';
import { ProformasController } from './proformas.controller';
import { SalesModule } from '../sales/sales.module';

@Module({ imports: [SalesModule], controllers: [ProformasController], providers: [ProformasService] })
export class ProformasModule { }
