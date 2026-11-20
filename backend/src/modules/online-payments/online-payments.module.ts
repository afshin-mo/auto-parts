import { Module } from '@nestjs/common';
import { OnlinePaymentsService } from './online-payments.service';
import { OnlinePaymentsController } from './online-payments.controller';
import { PaymentsModule } from '../payments/payments.module';

@Module({ imports: [PaymentsModule], controllers: [OnlinePaymentsController], providers: [OnlinePaymentsService] })
export class OnlinePaymentsModule { }
