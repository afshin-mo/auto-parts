import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import configuration from './common/config/configuration';
import { validateEnv } from './common/config/env.validation';
import { PrismaModule } from './database/prisma/prisma.module';

import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { BrandsModule } from './modules/brands/brands.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { UnitsModule } from './modules/units/units.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { ProductsModule } from './modules/products/products.module';
import { PartiesModule } from './modules/parties/parties.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { DuplicatesModule } from './modules/duplicates/duplicates.module';
import { SalesModule } from './modules/sales/sales.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ChecksModule } from './modules/checks/checks.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { ProformasModule } from './modules/proformas/proformas.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { AuditModule } from './modules/audit/audit.module';
import { MoodianModule } from './modules/moodian/moodian.module';
import { SmsModule } from './modules/sms/sms.module';
import { OnlinePaymentsModule } from './modules/online-payments/online-payments.module';
import { BranchesModule } from './modules/branches/branches.module';
import { RolesModule } from './modules/roles/roles.module';
import { DataImportModule } from './modules/data-import/data-import.module';
import { HealthController } from './health/health.controller';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { BranchGuard } from './common/guards/branch.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate: validateEnv }),
        ThrottlerModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (c: ConfigService) => [{ ttl: c.get<number>('throttle.ttl')! * 1000, limit: c.get<number>('throttle.limit')! }],
        }),
        PrismaModule,
        AuthModule, TenantsModule, UsersModule,
        BrandsModule, CategoriesModule, UnitsModule, WarehousesModule, VehiclesModule,
        ProductsModule, PartiesModule, InventoryModule, DuplicatesModule,
        SalesModule, PurchasesModule, PaymentsModule, ChecksModule, ReportsModule,
        ReturnsModule, ProformasModule, ExpensesModule, AuditModule, MoodianModule, SmsModule, OnlinePaymentsModule,
        BranchesModule, RolesModule, DataImportModule,
    ],
    controllers: [HealthController],
    providers: [
        // ترتیب مهم است: محدودیت نرخ ← احراز هویت ← فروشگاه ← شعبه ← نقش (قدیمی) ← مجوز
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: TenantGuard },
        { provide: APP_GUARD, useClass: BranchGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
        { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    ],
})
export class AppModule { }
