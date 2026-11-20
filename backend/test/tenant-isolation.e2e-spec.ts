import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { tenantContext } from '../src/common/tenant-context';

/**
 * ایزوله‌سازی فروشگاه‌ها با Postgres واقعی و RLS (بدون ماک).
 * پیش‌نیاز: دیتابیس migrate‌شده + prisma/sql/002_rls.sql؛ آدرس کاربر برنامه (`auto_parts_app`) در E2E_DATABASE_URL.
 * بدون این متغیر تست رد می‌شود.
 */
const url = process.env.E2E_DATABASE_URL;
(url ? describe : describe.skip)('tenant isolation (real DB + RLS)', () => {
    let app: INestApplication;
    const api = () => request(app.getHttpServer());
    const slug = Date.now().toString(36);
    const shops: Record<string, { token: string; phone: string; productId?: string; saleId?: string }> = { A: { token: '', phone: '' }, B: { token: '', phone: '' } };

    beforeAll(async () => {
        process.env.DATABASE_URL = url;
        process.env.JWT_SECRET = 'test-secret';
        process.env.JWT_REFRESH_SECRET = 'test-refresh';
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { AppModule } = require('../src/app.module'); // بعد از گذاشتن env (اعتبارسنجی هنگام import انجام می‌شود)
        const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = mod.createNestApplication();
        app.use(tenantContext.middleware);
        app.setGlobalPrefix('api');
        app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
        app.useGlobalFilters(new AllExceptionsFilter());
        app.useGlobalInterceptors(new TransformInterceptor());
        await app.init();

        for (const [i, k] of ['A', 'B'].entries()) {
            shops[k].phone = `0935${String(Date.now()).slice(-5)}${i}${k === 'A' ? 1 : 2}`;
            const res = await api().post('/api/v1/auth/register').send({ name: `مدیر ${k}`, phone: shops[k].phone, password: 'secret123', tenantName: `فروشگاه ${k}`, tenantSlug: `iso-${slug}-${k.toLowerCase()}` });
            expect([200, 201]).toContain(res.status);
            shops[k].token = res.body.data.accessToken;
        }
    });
    afterAll(() => app?.close());

    const as = (k: string) => ({ Authorization: `Bearer ${shops[k].token}` });

    it('هر فروشگاه کالا و فروش خودش را می‌سازد', async () => {
        const unit = await api().post('/api/v1/units').set(as('A')).send({ name: 'عدد', code: `u-${slug}`, type: 'COUNT' });
        expect([200, 201]).toContain(unit.status);
        const p = await api().post('/api/v1/products').set(as('A')).send({ name: 'روغن', unitId: unit.body.data.id, purchasePrice: 100, salePrice: 150, initialQuantity: 5 });
        expect([200, 201]).toContain(p.status);
        shops.A.productId = p.body.data.id;
        const s = await api().post('/api/v1/sales').set(as('A')).send({ items: [{ productId: p.body.data.id, quantity: 1, unitPrice: 150 }], vatPercent: 0, paidAmount: 150 });
        expect([200, 201]).toContain(s.status);
        shops.A.saleId = s.body.data.id;
    });

    it('فروشگاه B هیچ‌چیز از A نمی‌بیند', async () => {
        const list = await api().get('/api/v1/products').set(as('B')).expect(200);
        expect(JSON.stringify(list.body)).not.toContain(shops.A.productId);
        await api().get(`/api/v1/products/${shops.A.productId}`).set(as('B')).expect(404);
        await api().get(`/api/v1/sales/${shops.A.saleId}`).set(as('B')).expect(404);
        const sales = await api().get('/api/v1/sales').set(as('B')).expect(200);
        expect(JSON.stringify(sales.body)).not.toContain(shops.A.saleId);
        const inv = await api().get('/api/v1/inventory').set(as('B')).expect(200);
        expect(JSON.stringify(inv.body)).not.toContain(shops.A.productId);
    });

    it('B نمی‌تواند کالای A را ویرایش یا حذف کند', async () => {
        const patch = await api().patch(`/api/v1/products/${shops.A.productId}`).set(as('B')).send({ name: 'هک' });
        expect(patch.status).toBe(404);
        const del = await api().delete(`/api/v1/products/${shops.A.productId}`).set(as('B'));
        expect(del.status).toBe(404);
        const mine = await api().get(`/api/v1/products/${shops.A.productId}`).set(as('A')).expect(200);
        expect(mine.body.data.name).toBe('روغن');
    });

    it('ورود و اطلاعات فروشگاه جاری درست کار می‌کند (مسیرهای بدون tenant)', async () => {
        const me = await api().get('/api/v1/auth/me').set(as('A')).expect(200);
        expect(me.body.data.tenantName).toBe('فروشگاه A');
        const t = await api().get('/api/v1/tenants/current').set(as('B')).expect(200);
        expect(t.body.data.name).toBe('فروشگاه B');
    });

    it('ورود، refresh و ساخت کاربر با شعبه (user_branches) کار می‌کند', async () => {
        const login = await api().post('/api/v1/auth/login').send({ phone: shops.A.phone, password: 'secret123' });
        expect([200, 201]).toContain(login.status);
        const branches = await api().get('/api/v1/branches').set(as('A')).expect(200);
        const branchId = branches.body.data[0].id;
        const u = await api().post('/api/v1/users').set(as('A')).send({ name: 'فروشنده', phone: `0936${String(Date.now()).slice(-7)}`, password: 'secret123', role: 'SALESMAN', allBranches: false, branchIds: [branchId], defaultBranchId: branchId });
        expect([200, 201]).toContain(u.status);
        const usersB = await api().get('/api/v1/users').set(as('B')).expect(200);
        expect(JSON.stringify(usersB.body)).not.toContain(u.body.data.id);
    });

    it('غیرفعال‌کردن کاربر فوراً اعتبار توکنش را می‌برد (کش احراز هویت پاک می‌شود)', async () => {
        const branches = await api().get('/api/v1/branches').set(as('A')).expect(200);
        const phone = `0937${String(Date.now()).slice(-7)}`;
        const u = await api().post('/api/v1/users').set(as('A')).send({ name: 'موقت', phone, password: 'secret123', role: 'SALESMAN', allBranches: true, defaultBranchId: branches.body.data[0].id });
        expect([200, 201]).toContain(u.status);
        const login = await api().post('/api/v1/auth/login').send({ phone, password: 'secret123' });
        const token = login.body.data.accessToken;
        await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
        await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);   // از کش
        await api().patch(`/api/v1/users/${u.body.data.id}`).set(as('A')).send({ isActive: false }).expect(200);
        await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
    });

    it('لیست‌ها، گزارش‌ها و داشبورد (تراکنش واحد و SQL خام) روی دیتابیس واقعی جواب می‌دهند', async () => {
        const party = await api().post('/api/v1/parties').set(as('A')).send({ name: 'مشتری تست', partyType: 'CUSTOMER' });
        expect([200, 201]).toContain(party.status);
        const paths = ['categories', 'checks', 'checks/due', 'data-import/history', 'expenses', 'expenses/summary', 'inventory', 'inventory/transactions', 'inventory/low-stock',
            'inventory/value', 'parties', `parties/${party.body.data.id}/statement`, `parties/${party.body.data.id}/balance`, 'payments', 'products', `products/${shops.A.productId}`, 'proformas', 'purchases',
            'returns', 'sales', 'sms/logs', 'tenants/current', 'warehouses', 'reports/dashboard', 'reports/sales', 'reports/top-products', 'reports/profit', 'reports/product-movers',
            'reports/debts', 'reports/receivables'];
        for (const path of paths) {
            const res = await api().get(`/api/v1/${path}`).set(as('A'));
            if (res.status !== 200) throw new Error(`GET /${path} → ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
        }
        const dash = (await api().get('/api/v1/reports/dashboard').set(as('A')).expect(200)).body.data;
        expect(dash.today.count).toBe(1);
        expect(dash.today.total).toBe(150);
        expect(typeof dash.lowStockCount).toBe('number');
        expect(dash.salesLast30Days).toHaveLength(30);
        expect(dash.salesLast30Days.reduce((t: number, d: { total: number }) => t + d.total, 0)).toBe(150);
        const dashB = (await api().get('/api/v1/reports/dashboard').set(as('B')).expect(200)).body.data;
        expect(dashB.today.count).toBe(0);                       // فروش A در داشبورد B دیده نمی‌شود
    });

    it('فروش آفلاین: ارسال تکراری و هم‌زمان با یک clientRequestId فقط یک فاکتور می‌سازد و موجودی یک بار کم می‌شود', async () => {
        const unitA = await api().post('/api/v1/units').set(as('A')).send({ name: 'عدد', code: `ou-${slug}`, type: 'COUNT' });
        const p = await api().post('/api/v1/products').set(as('A')).send({ name: 'لنت', unitId: unitA.body.data.id, purchasePrice: 100, salePrice: 150, initialQuantity: 10 });
        expect([200, 201]).toContain(p.status);
        const clientRequestId = `offline-${slug}`;
        const body = { clientRequestId, items: [{ productId: p.body.data.id, quantity: 2, unitPrice: 150 }], vatPercent: 9, payInFull: true, paymentMethod: 'CASH' };
        const results = await Promise.all([1, 2, 3, 4].map(() => api().post('/api/v1/sales').set(as('A')).send(body)));
        for (const r of results) expect([200, 201]).toContain(r.status);
        const ids = new Set(results.map((r) => r.body.data.id));
        expect(ids.size).toBe(1);                                                    // هر چهار ارسال همان یک فاکتور
        const again = await api().post('/api/v1/sales').set(as('A')).send(body);     // ارسال دوباره‌ی بعد از موفقیت
        expect(again.body.data.id).toBe([...ids][0]);
        const inv = results[0].body.data;
        expect(Number(inv.totalAmount)).toBe(327);                                   // ۳۰۰ + ۹٪
        expect(Number(inv.paidAmount)).toBe(327);                                    // payInFull: با مبلغ محاسبه‌ی سرور تسویه شد
        expect(Number(inv.remainingAmount)).toBe(0);
        // فروش سریع موجودی را از فهرست کالاها می‌خواند؛ باید موجودی «شعبه‌ی فعال» باشد، نه جمع همه‌ی شعبه‌ها
        const catalog = await api().get('/api/v1/products').query({ limit: 100, isActive: true, search: 'لنت' }).set(as('A')).expect(200);
        expect(typeof catalog.body.data.find((x: { id: string }) => x.id === p.body.data.id).branchStock).toBe('number');
        const stock = await api().get(`/api/v1/products/${p.body.data.id}`).set(as('A')).expect(200);
        expect(Number(stock.body.data.totalStock)).toBe(8);                          // فقط یک بار ۲ عدد کم شد
        const list = await api().get('/api/v1/sales').query({ search: inv.invoiceNumber }).set(as('A')).expect(200);
        expect(list.body.data.filter((x: { id: string }) => x.id === inv.id)).toHaveLength(1);

        // همان کلید در فروشگاه دیگر، فاکتور جدا و مستقل می‌سازد (یکتایی per-tenant؛ فاکتور A دیده نمی‌شود)
        const unitB = await api().post('/api/v1/units').set(as('B')).send({ name: 'عدد', code: `ob-${slug}`, type: 'COUNT' });
        const pb = await api().post('/api/v1/products').set(as('B')).send({ name: 'لنت', unitId: unitB.body.data.id, purchasePrice: 100, salePrice: 150, initialQuantity: 10 });
        const sb = await api().post('/api/v1/sales').set(as('B')).send({ ...body, items: [{ productId: pb.body.data.id, quantity: 1, unitPrice: 150 }] });
        expect([200, 201]).toContain(sb.status);
        expect(sb.body.data.id).not.toBe(inv.id);
        expect(sb.body.data.tenantId).not.toBe(inv.tenantId);
    });

    it('بازنشانی رمز توسط مدیر: رمز قدیم کار نمی‌کند و رمز جدید کار می‌کند', async () => {
        const branches = await api().get('/api/v1/branches').set(as('A')).expect(200);
        const phone = `0938${String(Date.now()).slice(-7)}`;
        const u = await api().post('/api/v1/users').set(as('A')).send({ name: 'فراموشی', phone, password: 'oldpass1', role: 'SALESMAN', allBranches: true, defaultBranchId: branches.body.data[0].id });
        expect([200, 201]).toContain(u.status);
        await api().post(`/api/v1/users/${u.body.data.id}/reset-password`).set(as('A')).send({ password: 'newpass1' }).expect(201);
        expect((await api().post('/api/v1/auth/login').send({ phone, password: 'oldpass1' })).status).toBe(401);
        expect([200, 201]).toContain((await api().post('/api/v1/auth/login').send({ phone, password: 'newpass1' })).status);
        await api().post(`/api/v1/users/${u.body.data.id}/reset-password`).set(as('B')).send({ password: 'hacked12' }).expect(404);   // مدیر فروشگاه دیگر
    });
});
