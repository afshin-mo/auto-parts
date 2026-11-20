import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

/** تست دودی: سیم‌کشی ماژول‌ها، گاردها و اعتبارسنجی با پایگاه‌داده‌ی جعلی (بدون Postgres) */
describe('API smoke (mock DB)', () => {
    let app: INestApplication;
    let token: string;
    const productFindMany = jest.fn().mockResolvedValue([]);

    const user = { id: 'u1', name: 'مدیر', phone: '09120000000', email: null, role: 'SALESMAN', isActive: true, tenantId: 't1',
        passwordHash: bcrypt.hashSync('secret12', 4),
        allBranches: true, defaultBranchId: null, customRole: null, branches: [],
        tenant: { name: 'یدکی', slug: 'demo', isActive: true, planType: 'FREE', planStatus: 'ACTIVE', trialEndDate: null } };

    const prismaMock: any = {
        onModuleInit: async () => undefined,
        $connect: async () => undefined,
        $disconnect: async () => undefined,
        $transaction: async (x: any) => (Array.isArray(x) ? Promise.all(x) : x(prismaMock)),
        user: { findUnique: jest.fn(async ({ where }: any) => (where.phone === user.phone || where.id === user.id ? user : null)), update: jest.fn() },
        tenant: { update: jest.fn() },
        branch: { findMany: jest.fn().mockResolvedValue([{ id: 'b1', isDefault: true }]), findFirst: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(1) },
        product: { findMany: productFindMany, count: jest.fn().mockResolvedValue(0) },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
        onlinePayment: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) },
    };

    beforeAll(async () => {
        process.env.DATABASE_URL = 'postgresql://x:x@localhost/x';
        process.env.JWT_SECRET = 'test-secret';
        process.env.JWT_REFRESH_SECRET = 'test-refresh';
        const mod = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(PrismaService).useValue(prismaMock).compile();
        app = mod.createNestApplication();
        app.setGlobalPrefix('api');
        app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
        app.useGlobalFilters(new AllExceptionsFilter());
        app.useGlobalInterceptors(new TransformInterceptor());
        await app.init();
        token = app.get(JwtService).sign({ sub: 'u1' });
    });
    afterAll(() => app.close());

    it('بدون توکن ۴۰۱ می‌دهد', () => request(app.getHttpServer()).get('/api/v1/products').expect(401));

    it('ورود با ارقام فارسی کار می‌کند و پاسخ پوششی دارد', async () => {
        const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ phone: '۰۹۱۲۰۰۰۰۰۰۰', password: 'secret12' }).expect(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.accessToken).toBeDefined();
        expect(res.body.data.user.tenantName).toBe('یدکی');
    });

    it('رمز اشتباه ۴۰۱', () =>
        request(app.getHttpServer()).post('/api/v1/auth/login').send({ phone: '09120000000', password: 'bad' }).expect(401));

    it('هدر x-tenant-id نادیده گرفته می‌شود و فقط tenant توکن استفاده می‌شود', async () => {
        await request(app.getHttpServer()).get('/api/v1/products').set('Authorization', `Bearer ${token}`).set('x-tenant-id', 'OTHER').expect(200);
        expect(productFindMany.mock.calls[0][0].where.tenantId).toBe('t1');
    });

    it('نقش SALESMAN نمی‌تواند کاربر بسازد (۴۰۳)', () =>
        request(app.getHttpServer()).post('/api/v1/users').set('Authorization', `Bearer ${token}`).send({}).expect(403));

    it('اعتبارسنجی فروش بدون ردیف ۴۰۰', () =>
        request(app.getHttpServer()).post('/api/v1/sales').set('Authorization', `Bearer ${token}`).send({ items: [] }).expect(400));

    it('مسیرهای جدید: نقش‌ها و اعتبارسنجی', async () => {
        const h = { Authorization: `Bearer ${token}` };
        await request(app.getHttpServer()).get('/api/v1/expenses').set(h).expect(403);          // فروشنده به هزینه‌ها دسترسی ندارد
        await request(app.getHttpServer()).get('/api/v1/audit').set(h).expect(403);
        await request(app.getHttpServer()).post('/api/v1/returns/invoice/sale/x').set(h).send({}).expect(403); // برگشتی فقط مدیر
        await request(app.getHttpServer()).post('/api/v1/proformas').set(h).send({ items: [] }).expect(400);
        await request(app.getHttpServer()).post('/api/v1/products/import').set(h).send({ rows: [] }).expect(403); // فروشنده کالا وارد نمی‌کند
        await request(app.getHttpServer()).get('/api/v1/returns/invoice/bad/x/returnable').set(h).expect(400);   // kind نامعتبر
    });

    it('مودیان/پیامک/درگاه: نقش‌ها و مسیرهای عمومی', async () => {
        const h = { Authorization: `Bearer ${token}` };
        await request(app.getHttpServer()).post('/api/v1/moodian/invoices/x/send').set(h).expect(403);   // فروشنده به مودیان دسترسی ندارد
        await request(app.getHttpServer()).get('/api/v1/moodian/settings').set(h).expect(403);
        await request(app.getHttpServer()).put('/api/v1/sms/settings').set(h).send({}).expect(403);
        await request(app.getHttpServer()).put('/api/v1/online-payments/settings').set(h).send({}).expect(403);
        // صفحه‌ی عمومی پرداخت بدون توکن در دسترس است (۴۰۴ برای لینک ناموجود، نه ۴۰۱)
        await request(app.getHttpServer()).get('/api/v1/online-payments/public/nope').expect(404);
        await request(app.getHttpServer()).get('/api/v1/online-payments/callback?Authority=none&Status=NOK').expect(302);
    });

    it('sortBy نامعتبر به فیلد امن برمی‌گردد', async () => {
        await request(app.getHttpServer()).get('/api/v1/products?sortBy=passwordHash').set('Authorization', `Bearer ${token}`).expect(200);
        const last = productFindMany.mock.calls.at(-1)![0];
        expect(Object.keys(last.orderBy)[0]).toBe('createdAt');
    });
});
