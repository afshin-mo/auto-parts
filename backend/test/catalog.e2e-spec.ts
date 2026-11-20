import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { tenantContext } from '../src/common/tenant-context';

/**
 * کاتالوگ، جستجو و ورود فاکتور خرید با Postgres واقعی (بدون ماک). پیش‌نیاز مثل tenant-isolation.e2e-spec.ts:
 * دیتابیس migrate‌شده و آدرس کاربر برنامه در E2E_DATABASE_URL.
 */
const url = process.env.E2E_DATABASE_URL;
(url ? describe : describe.skip)('catalog & search (real DB)', () => {
    let app: INestApplication;
    let token = '';
    const api = () => request(app.getHttpServer());
    const auth = () => ({ Authorization: `Bearer ${token}` });
    const slug = Date.now().toString(36);
    const importRows = (rows: object[], path = 'products', extra: object = {}) => api().post(`/api/v1/data-import/${path}`).set(auth()).send({ rows, ...extra });

    beforeAll(async () => {
        process.env.DATABASE_URL = url;
        process.env.JWT_SECRET = 'test-secret';
        process.env.JWT_REFRESH_SECRET = 'test-refresh';
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { AppModule } = require('../src/app.module');
        const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = mod.createNestApplication();
        app.use(tenantContext.middleware);
        app.setGlobalPrefix('api');
        app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
        app.useGlobalFilters(new AllExceptionsFilter());
        app.useGlobalInterceptors(new TransformInterceptor());
        await app.init();
        const reg = await api().post('/api/v1/auth/register').send({ name: 'مدیر', phone: `0916${String(Date.now()).slice(-7)}`, password: 'secret123', tenantName: `کاتالوگ ${slug}`, tenantSlug: `cat-${slug}` });
        token = reg.body.data.accessToken;
    });
    afterAll(() => app?.close());

    const lookup = async (q: string) => {
        const r = await api().get('/api/v1/products/lookup').query({ q }).set(auth()).expect(200);
        expect(Array.isArray(r.body.data)).toBe(true);                         // قبلاً شیء { data, total } بود و فرانت می‌شکست
        return r.body.data as { sku: string; name: string }[];
    };

    it('ورود بدون قیمت فروش پذیرفته می‌شود؛ نام با حروف عربی نرمال ذخیره می‌شود', async () => {
        const res = await importRows([
            { sku: '245851-10', name: 'ديسك  ترمز جلو بدون پيچ ( ست 2 تايي )', brand: '10', partNumber: '245851', taxGoodsId: '2904341547690' },
            { sku: '500655-PT6', name: 'لنت ترمز جلو', brand: 'PT6', partNumber: '500655' },
            { sku: '500655-PA5', name: 'لنت ترمز جلو', brand: 'PA5', partNumber: '500655' },
            { sku: '502804-P58', name: 'كيت كلاچ پرايد', brand: 'P58', partNumber: '502804' },
        ]).expect(201);
        expect(res.body.data).toMatchObject({ created: 4, errors: [] });
        const list = await api().get('/api/v1/products').query({ search: 'دیسک' }).set(auth()).expect(200);
        expect(list.body.data[0]).toMatchObject({ name: 'دیسک ترمز جلو بدون پیچ ( ست 2 تایی )' });   // ي/ك عربی و فاصله‌ی دوتایی اصلاح شد
        expect(Number(list.body.data[0].salePrice)).toBe(0);
    });

    it('جستجو: فارسی/عربی، سریال، مارک، سریال+مارک، نام+مارک، رقم فارسی', async () => {
        const skus = async (q: string) => (await lookup(q)).map((h) => h.sku).sort();
        expect(await skus('دیسک ترمز')).toEqual(['245851-10']);
        expect(await skus('ديسك ترمز')).toEqual(['245851-10']);               // کیبورد عربی هم
        expect(await skus('کیت کلاچ')).toEqual(['502804-P58']);
        expect(await skus('500655')).toEqual(['500655-PA5', '500655-PT6']);   // یک سریال، دو مارک
        expect(await skus('500655 PT6')).toEqual(['500655-PT6']);
        expect(await skus('PA5')).toEqual(['500655-PA5']);                    // فقط مارک
        expect(await skus('لنت PA5')).toEqual(['500655-PA5']);
        expect(await skus('ست ۲')).toEqual(['245851-10']);                     // رقم فارسی ↔ لاتین
        expect(await skus('هیچی-نیست')).toEqual([]);
        for (const q of ['PT6', 'دیسک 245851']) {                              // فهرست کالاها هم همان منطق را دارد
            const r = await api().get('/api/v1/products').query({ search: q }).set(auth()).expect(200);
            expect(r.body.data.length).toBe(1);
        }
    });

    it('ساخت کالا بدون قیمت فروش (قیمت هنگام فروش تعیین می‌شود)', async () => {
        const unit = await api().post('/api/v1/units').set(auth()).send({ name: 'عدد', code: `u-${slug}`, type: 'COUNT' });
        const p = await api().post('/api/v1/products').set(auth()).send({ name: 'كاسه نمد', unitId: unit.body.data.id, purchasePrice: 100 });
        expect([200, 201]).toContain(p.status);
        expect(Number(p.body.data.salePrice)).toBe(0);
        expect(p.body.data.name).toBe('کاسه نمد');
        const quick = await api().post('/api/v1/products/quick').set(auth()).send({ name: 'ثبت سریع بدون قیمت', unitId: unit.body.data.id });
        expect([200, 201]).toContain(quick.status);
    });

    it('فاکتور خرید: موجودی چندباره با بهای هر فاکتور؛ ورود دوباره‌ی همان فایل موجودی را دو برابر نمی‌کند', async () => {
        const rows = [
            { code: '500655-PT6', quantity: 4, unitCost: 4039200, note: 'فاکتور خرید 18289852 - 1405/08/03' },
            { code: '500655-PT6', quantity: 6, unitCost: 4100000, note: 'فاکتور خرید 18289999 - 1405/08/10' },
            { code: '500655-PT6', quantity: 2, unitCost: 4100000, note: 'فاکتور خرید 18289999 - 1405/08/10' },   // قلم مشابه در همان فاکتور؛ مجاز
            { code: '245851-10', quantity: 5, unitCost: 100, note: 'فاکتور خرید 1 - 1405/01/01' },
        ];
        const stockOf = async (q: string) => Number((await api().get('/api/v1/products').query({ search: q }).set(auth()).expect(200)).body.data[0].totalStock);
        const dry = await importRows(rows, 'stock', { mode: 'ADD', dryRun: true }).expect(201);
        expect(dry.body.data.errors).toEqual([]);
        expect(await stockOf('500655-PT6')).toBe(0);                          // dryRun چیزی ننوشت
        const first = await importRows(rows, 'stock', { mode: 'ADD' }).expect(201);
        expect(first.body.data).toMatchObject({ errors: [], updated: 4, unchanged: 0 });
        expect(await stockOf('500655-PT6')).toBe(12);
        const again = await importRows(rows, 'stock', { mode: 'ADD' }).expect(201);
        expect(again.body.data).toMatchObject({ updated: 0, unchanged: 4 });  // همه تکراری
        expect(await stockOf('500655-PT6')).toBe(12);                         // دو برابر نشد
        expect(await stockOf('245851-10')).toBe(5);
        // یک فاکتور تازه به همان کالا: فقط آن اضافه می‌شود
        await importRows([...rows, { code: '500655-PT6', quantity: 3, unitCost: 4200000, note: 'فاکتور خرید 18290000 - 1405/09/01' }], 'stock', { mode: 'ADD' }).expect(201);
        expect(await stockOf('500655-PT6')).toBe(15);
        const hist = await api().get('/api/v1/inventory/transactions').query({ limit: 100 }).set(auth()).expect(200);
        expect(JSON.stringify(hist.body)).toContain('18289852');                // شماره‌ی فاکتور در سابقه‌ی انبار
    });

    it('فروش: نام مشتری، مالیات اختیاری با درصد دستی و قیمت فروش در لحظه‌ی فروش', async () => {
        const found = (await lookup('500655 PT6'))[0] as { id?: string };
        const pid = (await api().get('/api/v1/products').query({ search: '500655-PT6' }).set(auth())).body.data[0].id as string;
        void found;
        const sale = (body: object) => api().post('/api/v1/sales').set(auth()).send({ items: [{ productId: pid, quantity: 1, unitPrice: 5000000 }], payInFull: true, paymentMethod: 'CASH', ...body });
        const plain = await sale({ vatPercent: 0, partyName: 'آقای احمدی' });
        expect([200, 201]).toContain(plain.status);
        expect(plain.body.data.partyName).toBe('آقای احمدی');                    // نام مشتری روی فاکتور
        expect(Number(plain.body.data.totalAmount)).toBe(5000000);                // بدون مالیات
        const taxed = await sale({ vatPercent: 10 });
        expect(Number(taxed.body.data.totalAmount)).toBe(5500000);                // درصد دستی
        const hit = await api().get('/api/v1/sales').query({ search: 'احمدی' }).set(auth()).expect(200);
        expect(hit.body.data.some((x: { id: string }) => x.id === plain.body.data.id)).toBe(true);   // با نام مشتری قابل جستجو
    });

    it('یک کالا با چند ردیف و چند قیمت (نقد/اعتباری) خطای تکراری نمی‌دهد: ادغام، جمع تعداد، قیمت آخرین ردیف', async () => {
        for (const path of ['products/import', 'data-import/products']) {
            const sku = `DUP-${path.length}-${slug}`;
            const res = await api().post(`/api/v1/${path}`).set(auth()).send({ rows: [
                { sku, name: 'کیت کلاچ', brand: 'P87', partNumber: '801168', purchasePrice: 1000, initialQuantity: 5 },     // خرید نقدی
                { sku: `${sku}-B`, name: 'لنت', brand: 'PT6', purchasePrice: 300, initialQuantity: 2 },
                { sku, name: 'کیت کلاچ', brand: 'P87', partNumber: '801168', purchasePrice: 1200, initialQuantity: 5 },     // همان کالا، خرید اعتباری، قیمت دیگر
                { sku: `${sku}-C`, name: '', purchasePrice: 1 },                                                          // خطای واقعی: نام خالی
            ] }).expect(201);
            expect(res.body.data).toMatchObject({ created: 2, merged: 1, skipped: 0 });
            expect(res.body.data.errors).toEqual([{ row: 4, sku: `${sku}-C`, message: 'نام کالا خالی است' }]);          // شماره‌ی ردیف درست فایل
            const list = await api().get('/api/v1/products').query({ search: sku }).set(auth()).expect(200);
            const p = list.body.data.find((x: { sku: string }) => x.sku === sku);
            expect(Number(p.purchasePrice)).toBe(1200);                                                                 // آخرین ردیف
            expect(Number(p.totalStock)).toBe(10);                                                                       // ۵ + ۵
            expect(Number(p.salePrice)).toBe(0);                                                                         // قیمت فروش اجباری نیست
        }
    });
});
