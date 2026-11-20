/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { calculateInvoice } from '../src/common/utils/invoice-calc';
import { jalaliYearMonth } from '../src/common/utils/jalali.util';

import { normalizeCode } from '../src/common/utils/code-normalize.util';
const prisma = new PrismaClient();
const DAY = 86400000;
const rnd = (a: number, b: number) => Math.floor(a + Math.random() * (b - a + 1));
const pick = <T>(arr: T[]) => arr[rnd(0, arr.length - 1)];

async function masterData() {
    const units = [
        ['عدد', 'pcs', 'count'], ['جفت', 'pair', 'count'], ['ست', 'set', 'count'], ['لیتر', 'ltr', 'volume'],
        ['کیلوگرم', 'kg', 'weight'], ['متر', 'm', 'length'], ['بسته', 'pack', 'count'],
    ];
    for (const [name, code, type] of units) {
        await prisma.unit.upsert({ where: { code }, update: {}, create: { name, code, type } });
    }

    const carMakers = [['ایران‌خودرو', 'ikco', 'ایران'], ['سایپا', 'saipa', 'ایران'], ['پژو', 'peugeot', 'فرانسه'], ['رنو', 'renault', 'فرانسه'], ['کیا', 'kia', 'کره'], ['هیوندای', 'hyundai', 'کره'], ['تویوتا', 'toyota', 'ژاپن']];
    for (const [name, code, country] of carMakers) {
        await prisma.brand.upsert({ where: { code }, update: {}, create: { name, code, country, kind: 'VEHICLE' } });
    }
    const partMakers = [['بوش', 'bosch', 'آلمان'], ['موبیس', 'mobis', 'کره'], ['ایساکو', 'isaco', 'ایران'], ['مگا موتور', 'mega', 'ایران'], ['ساکت', 'sakt', 'ایران'], ['کوییک', 'quick', 'ایران'], ['بهران', 'behran', 'ایران'], ['فرامکس', 'framax', 'ایران'], ['NGK', 'ngk', 'ژاپن'], ['سفیر', 'safir', 'ایران']];
    for (const [name, code, country] of partMakers) {
        await prisma.brand.upsert({ where: { code }, update: {}, create: { name, code, country, kind: 'PART' } });
    }

    const cats: Record<string, string[]> = {
        'ترمز': ['لنت ترمز', 'دیسک و کاسه', 'روغن ترمز'],
        'فیلتر': ['فیلتر روغن', 'فیلتر هوا', 'فیلتر بنزین', 'فیلتر کابین'],
        'روغن و مایعات': ['روغن موتور', 'ضدیخ', 'روغن گیربکس'],
        'جلوبندی': ['کمک فنر', 'مفصل و موقعیت', 'طبق و سیبک'],
        'برق و جرقه': ['شمع', 'باتری', 'وایر شمع'],
        'موتور': ['تسمه تایم', 'واشر', 'پمپ آب'],
    };
    let order = 0;
    for (const [parent, kids] of Object.entries(cats)) {
        const pCode = `cat-${parent}`;
        const p = await prisma.category.upsert({ where: { code: pCode }, update: {}, create: { name: parent, code: pCode, level: 1, sortOrder: order++ } });
        for (const k of kids) {
            const code = `cat-${k}`;
            await prisma.category.upsert({ where: { code }, update: {}, create: { name: k, code, parentId: p.id, level: 2 } });
        }
    }

    const b = async (code: string) => (await prisma.brand.findUniqueOrThrow({ where: { code } })).id;
    const vehicles: [string, string, number, number | null, string?][] = [
        ['peugeot', 'پژو ۲۰۶ تیپ ۲', 1380, 1396, 'TU3'], ['peugeot', 'پژو ۲۰۶ تیپ ۵', 1385, 1402, 'TU5'], ['peugeot', 'پژو ۴۰۵', 1375, 1402, 'XU7'],
        ['peugeot', 'پارس', 1383, 1402, 'XU7P'], ['ikco', 'سمند LX', 1381, 1401, 'EF7'], ['ikco', 'دنا', 1393, null, 'EF7'],
        ['ikco', 'رانا', 1394, null, 'TU5'], ['saipa', 'پراید ۱۳۱', 1372, 1397, '1.3'], ['saipa', 'تیبا', 1388, 1400, '1.5'],
        ['saipa', 'ساینا', 1396, 1402, '1.5'], ['saipa', 'کوییک', 1396, null, '1.5'], ['renault', 'تندر ۹۰', 1386, 1402, 'K7M'],
        ['kia', 'سراتو', 1388, 1400, '2.0'], ['hyundai', 'النترا', 1385, 1400, '1.8'], ['toyota', 'کرولا', 1385, 1400, '1.6'],
    ];
    for (const [bc, modelName, yearFrom, yearTo, engineType] of vehicles) {
        const brandId = await b(bc);
        const exists = await prisma.vehicle.findFirst({ where: { brandId, modelName } });
        if (!exists) await prisma.vehicle.create({ data: { brandId, modelName, yearFrom, yearTo, engineType, fuelType: 'بنزین' } });
    }
}

async function demoTenant() {
    if (await prisma.tenant.findUnique({ where: { slug: 'demo' } })) {
        console.log('فروشگاه نمونه از قبل وجود دارد؛ رد شد.');
        return;
    }
    const passwordHash = await bcrypt.hash('demo1234', 10);
    const tenant = await prisma.tenant.create({
        data: {
            name: 'یدکی امین', slug: 'demo', ownerName: 'امین رضایی', ownerPhone: '09120000000',
            city: 'تهران', address: 'خیابان شوش، پلاک ۱۲۰', phone: '02133445566',
            planType: 'PRO', planStatus: 'ACTIVE', maxProducts: 5000, maxUsers: 10, maxBranches: 5,
            settings: { currency: 'TOMAN', vatPercent: 9 },
        },
    });
    const hq = await prisma.branch.create({ data: { tenantId: tenant.id, name: 'شعبه مرکزی', code: 'HQ', isDefault: true, address: 'خیابان شوش، پلاک ۱۲۰' } });
    const shoosh = await prisma.branch.create({ data: { tenantId: tenant.id, name: 'شعبه شوش', code: 'SH', address: 'میدان شوش' } });
    const admin = await prisma.user.create({ data: { tenantId: tenant.id, name: 'امین رضایی', phone: '09120000000', passwordHash, role: 'TENANT_ADMIN', defaultBranchId: hq.id } });
    // فروشنده فقط به شعبه‌ی مرکزی دسترسی دارد (نمونه‌ی محدودسازی شعبه)
    await prisma.user.create({ data: { tenantId: tenant.id, name: 'سعید فروشنده', phone: '09121111111', passwordHash, role: 'SALESMAN', allBranches: false, defaultBranchId: hq.id, branches: { create: [{ branchId: hq.id, tenantId: tenant.id }] } } });
    const main = await prisma.warehouse.create({ data: { tenantId: tenant.id, branchId: hq.id, name: 'انبار اصلی', code: 'MAIN', isDefault: true } });
    await prisma.warehouse.create({ data: { tenantId: tenant.id, branchId: shoosh.id, name: 'انبار شوش', code: 'SHOOSH', address: 'شوش' } });

    const unit = async (code: string) => (await prisma.unit.findUniqueOrThrow({ where: { code } })).id;
    const brand = async (code: string) => (await prisma.brand.findUniqueOrThrow({ where: { code } })).id;
    const cat = async (name: string) => (await prisma.category.findUniqueOrThrow({ where: { code: `cat-${name}` } })).id;

    // [sku, name, cat, brand, unit, buy, sell, stock, min, oem, location]
    const catalog: [string, string, string, string, string, number, number, number, number, string, string][] = [
        ['BP-206-F', 'لنت جلو پژو ۲۰۶', 'لنت ترمز', 'framax', 'set', 520000, 680000, 24, 6, '425230', 'A-1-1'],
        ['BP-206-R', 'لنت عقب پژو ۲۰۶', 'لنت ترمز', 'framax', 'set', 380000, 490000, 18, 5, '425242', 'A-1-2'],
        ['BP-SM-F', 'لنت جلو سمند', 'لنت ترمز', 'framax', 'set', 480000, 640000, 3, 6, '1440002', 'A-1-3'],
        ['BP-PR-F', 'لنت جلو پراید', 'لنت ترمز', 'mega', 'set', 290000, 380000, 40, 10, '11100', 'A-1-4'],
        ['OF-206', 'فیلتر روغن پژو ۲۰۶ و ۴۰۵', 'فیلتر روغن', 'sakt', 'pcs', 78000, 110000, 85, 20, '1109.AL', 'B-1-1'],
        ['OF-PR', 'فیلتر روغن پراید', 'فیلتر روغن', 'sakt', 'pcs', 62000, 90000, 70, 20, '15208', 'B-1-2'],
        ['AF-206', 'فیلتر هوا پژو ۲۰۶', 'فیلتر هوا', 'sakt', 'pcs', 95000, 140000, 32, 10, '1444.TV', 'B-2-1'],
        ['AF-SM', 'فیلتر هوا سمند', 'فیلتر هوا', 'sakt', 'pcs', 105000, 150000, 4, 8, '1444.VK', 'B-2-2'],
        ['CF-206', 'فیلتر کابین پژو ۲۰۶', 'فیلتر کابین', 'mega', 'pcs', 88000, 135000, 27, 8, '6447.KP', 'B-3-1'],
        ['FF-GEN', 'فیلتر بنزین عمومی', 'فیلتر بنزین', 'sakt', 'pcs', 45000, 70000, 60, 15, 'FF-100', 'B-4-1'],
        ['EO-BH-4', 'روغن موتور بهران ۱۰W40 چهار لیتری', 'روغن موتور', 'behran', 'pcs', 780000, 960000, 36, 12, 'BH-1040', 'C-1-1'],
        ['EO-IS-4', 'روغن موتور ایساکو ۲۰W50 چهار لیتری', 'روغن موتور', 'isaco', 'pcs', 640000, 800000, 28, 12, 'IS-2050', 'C-1-2'],
        ['AN-5', 'ضدیخ ۵ لیتری', 'ضدیخ', 'behran', 'pcs', 420000, 560000, 22, 8, 'AN-05', 'C-2-1'],
        ['BF-DOT4', 'روغن ترمز DOT4', 'روغن ترمز', 'isaco', 'pcs', 95000, 135000, 44, 12, 'DOT4', 'C-3-1'],
        ['SA-206-F', 'کمک فنر جلو پژو ۲۰۶ (جفت)', 'کمک فنر', 'sakt', 'pair', 3200000, 4100000, 8, 3, '5202.TT', 'D-1-1'],
        ['SA-SM-R', 'کمک فنر عقب سمند (جفت)', 'کمک فنر', 'sakt', 'pair', 2400000, 3050000, 2, 3, '5206.SM', 'D-1-2'],
        ['RT-206', 'مفصل (rotul) گاردان پژو ۲۰۶', 'مفصل و موقعیت', 'mega', 'pcs', 260000, 360000, 15, 5, '3640.A3', 'D-2-1'],
        ['SP-NGK-206', 'شمع NGK پژو ۲۰۶ (ست ۴ تایی)', 'شمع', 'ngk', 'set', 460000, 620000, 30, 8, 'BKR6E', 'E-1-1'],
        ['SP-BS-PR', 'شمع بوش پراید (ست ۴ تایی)', 'شمع', 'bosch', 'set', 390000, 520000, 26, 8, 'WR7DC', 'E-1-2'],
        ['BT-60', 'باتری ۶۰ آمپر سپاهان', 'باتری', 'safir', 'pcs', 2850000, 3400000, 9, 4, 'BT-60', 'E-2-1'],
        ['TB-206', 'تسمه تایم پژو ۲۰۶ تیپ ۵', 'تسمه تایم', 'mobis', 'pcs', 680000, 890000, 12, 4, 'TB-TU5', 'F-1-1'],
        ['WP-206', 'واتر پمپ پژو ۲۰۶', 'پمپ آب', 'mega', 'pcs', 720000, 940000, 7, 3, 'WP-TU5', 'F-2-1'],
        ['GK-HD-206', 'واشر سرسیلندر پژو ۲۰۶', 'واشر', 'isaco', 'pcs', 410000, 560000, 10, 3, 'GK-TU5', 'F-3-1'],
        ['LB-SVC', 'اجرت تعویض روغن و فیلتر', 'روغن موتور', 'isaco', 'pcs', 0, 150000, 0, 0, '', ''],
    ];
    const products: { id: string; sku: string; name: string; unitId: string; buy: number; sell: number; isService: boolean }[] = [];
    for (const [sku, name, c, br, u, buy, sell, stock, min, oem, loc] of catalog) {
        const isService = sku === 'LB-SVC';
        const unitId = await unit(u);
        const p = await prisma.product.create({
            data: {
                tenantId: tenant.id, sku, name, categoryId: await cat(c), brandId: await brand(br), unitId,
                purchasePrice: buy, salePrice: sell, wholesalePrice: Math.round(sell * 0.93), minStock: min,
                oemCode: oem || null, location: loc || null, isService, warrantyMonths: isService ? 0 : 6,
            },
        });
        for (const [type, code] of [['SKU', sku], ['OEM', oem]] as const) {
            const codeNorm = normalizeCode(code);
            if (codeNorm) await prisma.productCode.create({ data: { tenantId: tenant.id, productId: p.id, type, code, codeNorm } });
        }
        products.push({ id: p.id, sku, name, unitId, buy, sell, isService });
        if (!isService) {
            // موجودی اولیه = موجودی نهایی + آنچه در فاکتورهای نمونه فروخته می‌شود (بعداً از آن کم می‌کنیم)
            await prisma.inventory.create({ data: { tenantId: tenant.id, productId: p.id, warehouseId: main.id, quantity: stock + 40, availableQuantity: stock + 40 } });
            await prisma.inventoryTransaction.create({
                data: { tenantId: tenant.id, productId: p.id, warehouseId: main.id, transactionType: 'ADJUSTMENT_INCREASE', quantity: stock + 40, unitId, unitCost: buy, totalCost: buy * (stock + 40), referenceType: 'initial', notes: 'موجودی اولیه', createdBy: admin.id, createdAt: new Date(Date.now() - 70 * DAY) },
            });
        }
    }

    // سازگاری با خودرو
    const veh = async (m: string) => (await prisma.vehicle.findFirstOrThrow({ where: { modelName: m } })).id;
    const compat: [string, string[]][] = [
        ['BP-206-F', ['پژو ۲۰۶ تیپ ۲', 'پژو ۲۰۶ تیپ ۵']], ['BP-206-R', ['پژو ۲۰۶ تیپ ۲', 'پژو ۲۰۶ تیپ ۵']],
        ['BP-SM-F', ['سمند LX']], ['BP-PR-F', ['پراید ۱۳۱']], ['OF-206', ['پژو ۲۰۶ تیپ ۲', 'پژو ۲۰۶ تیپ ۵', 'پژو ۴۰۵']],
        ['AF-206', ['پژو ۲۰۶ تیپ ۵']], ['SP-NGK-206', ['پژو ۲۰۶ تیپ ۲', 'پژو ۲۰۶ تیپ ۵']], ['TB-206', ['پژو ۲۰۶ تیپ ۵']],
        ['SA-206-F', ['پژو ۲۰۶ تیپ ۲', 'پژو ۲۰۶ تیپ ۵']], ['AF-SM', ['سمند LX']],
    ];
    for (const [sku, models] of compat) {
        const p = products.find((x) => x.sku === sku)!;
        for (const m of models) await prisma.productVehicleCompatibility.create({ data: { tenantId: tenant.id, productId: p.id, vehicleId: await veh(m), position: sku.endsWith('-F') ? 'جلو' : undefined } });
    }
    const sub = (a: string, b: string) => prisma.productSubstitute.create({ data: { tenantId: tenant.id, productId: products.find((x) => x.sku === a)!.id, substituteId: products.find((x) => x.sku === b)!.id, reason: 'جایگزین هم‌رده' } });
    await sub('OF-206', 'OF-PR');
    await sub('EO-BH-4', 'EO-IS-4');

    // طرف‌حساب‌ها
    const partyData: [string, 'CUSTOMER' | 'SUPPLIER', string, string][] = [
        ['مجید کریمی', 'CUSTOMER', '09121234501', 'تهران'], ['تعمیرگاه نوین', 'CUSTOMER', '09121234502', 'تهران'], ['علی صادقی', 'CUSTOMER', '09121234503', 'کرج'],
        ['مکانیکی برادران احمدی', 'CUSTOMER', '09121234504', 'تهران'], ['حسین نیک‌پور', 'CUSTOMER', '09121234505', 'شهریار'], ['تاکسی‌سرویس آزادی', 'CUSTOMER', '09121234506', 'تهران'],
        ['پخش قطعات سپهر', 'SUPPLIER', '09351234501', 'تهران'], ['شرکت فیلتر ساکت', 'SUPPLIER', '09351234502', 'تهران'], ['واردات یدک ایران‌کالا', 'SUPPLIER', '09351234503', 'تبریز'],
    ];
    const parties: { id: string; name: string; type: string }[] = [];
    let ci = 0, si = 0;
    for (const [name, type, mobile, city] of partyData) {
        const code = type === 'CUSTOMER' ? `C-${String(++ci).padStart(4, '0')}` : `S-${String(++si).padStart(4, '0')}`;
        const p = await prisma.party.create({ data: { tenantId: tenant.id, partyType: type, name, code, mobile, city, creditLimit: type === 'CUSTOMER' ? 30_000_000 : 0, paymentTerms: 30 } });
        parties.push({ id: p.id, name, type });
    }
    const customers = parties.filter((p) => p.type === 'CUSTOMER');

    // فاکتورهای فروش ۶۰ روز گذشته
    const counters = new Map<string, number>();
    const balances = new Map<string, number>();
    const sold = new Map<string, number>();
    const sellable = products.filter((p) => !p.isService && p.sell > 0);
    for (let d = 60; d >= 0; d--) {
        const n = d % 7 === 5 ? 0 : rnd(1, 3); // جمعه‌ها تعطیل
        for (let k = 0; k < n; k++) {
            const date = new Date(Date.now() - d * DAY);
            date.setHours(rnd(9, 19), rnd(0, 59), 0, 0);
            const lines = Array.from({ length: rnd(1, 3) }, () => {
                const p = pick(sellable);
                return { p, quantity: rnd(1, 3), discountPercent: Math.random() < 0.15 ? 5 : 0 };
            });
            const calc = calculateInvoice(lines.map((l) => ({ quantity: l.quantity, unitPrice: l.p.sell, discountPercent: l.discountPercent })), { vatPercent: 9 });
            const party = Math.random() < 0.75 ? pick(customers) : null;
            const payFull = !party || Math.random() < 0.6;
            const paid = payFull ? calc.totalAmount : Math.random() < 0.5 ? Math.round(calc.totalAmount * 0.5) : 0;
            const ym = jalaliYearMonth(date).replace('-', '');
            const seq = (counters.get(ym) ?? 0) + 1;
            counters.set(ym, seq);
            const inv = await prisma.invoice.create({
                data: {
                    tenantId: tenant.id, invoiceNumber: `S-${ym}-${String(seq).padStart(4, '0')}`, invoiceType: 'SALE',
                    status: paid >= calc.totalAmount ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'CONFIRMED', date, branchId: hq.id, warehouseId: main.id,
                    partyId: party?.id, partyName: party?.name ?? 'مشتری متفرقه', subtotal: calc.subtotal, discountAmount: 0,
                    vatAmount: calc.vatAmount, vatPercent: 9, totalAmount: calc.totalAmount, paidAmount: paid, remainingAmount: calc.totalAmount - paid,
                    createdBy: admin.id, createdAt: date,
                    items: { create: lines.map((l, i) => ({ tenantId: tenant.id, productId: l.p.id, productName: l.p.name, sku: l.p.sku, unitId: l.p.unitId, quantity: l.quantity, unitPrice: l.p.sell, discountAmount: calc.items[i].lineDiscount, discountPercent: l.discountPercent, vatAmount: calc.items[i].vat, vatPercent: 9, totalPrice: calc.items[i].total, sortOrder: i })) },
                },
            });
            for (const l of lines) {
                sold.set(l.p.id, (sold.get(l.p.id) ?? 0) + l.quantity);
                await prisma.inventoryTransaction.create({ data: { tenantId: tenant.id, productId: l.p.id, warehouseId: main.id, transactionType: 'SALE', quantity: -l.quantity, unitId: l.p.unitId, unitCost: l.p.buy, totalCost: l.p.buy * l.quantity, referenceType: 'invoice', referenceId: inv.id, createdBy: admin.id, createdAt: date } });
            }
            if (paid > 0) await prisma.payment.create({ data: { tenantId: tenant.id, direction: 'RECEIVED', method: pick(['CASH', 'CARD', 'TRANSFER'] as const), amount: paid, date, partyId: party?.id, invoiceId: inv.id, branchId: hq.id, createdBy: admin.id } });
            if (party) balances.set(party.id, (balances.get(party.id) ?? 0) + calc.totalAmount - paid);
        }
    }
    for (const [pid, q] of sold) {
        // موجودی را طوری تنظیم می‌کنیم که مقدار نهایی همان عدد کاتالوگ باشد (۴۰ + موجودی − فروخته‌شده ≥ ۰)
        const inv = await prisma.inventory.findFirstOrThrow({ where: { productId: pid } });
        const left = Math.max(0, Number(inv.quantity) - q);
        await prisma.inventory.update({ where: { id: inv.id }, data: { quantity: left, availableQuantity: left } });
    }
    for (const [pid, bal] of balances) await prisma.party.update({ where: { id: pid }, data: { currentBalance: bal } });

    // چک‌ها
    const due = (days: number) => new Date(Date.now() + days * DAY);
    await prisma.check.createMany({
        data: [
            { tenantId: tenant.id, checkType: 'RECEIVED', checkNumber: '784512', bankName: 'بانک ملت', amount: 18_500_000, dueDate: due(2), issueDate: due(-40), partyId: customers[1].id },
            { tenantId: tenant.id, checkType: 'RECEIVED', checkNumber: '784513', bankName: 'بانک ملی', amount: 9_200_000, dueDate: due(11), issueDate: due(-30), partyId: customers[3].id },
            { tenantId: tenant.id, checkType: 'PAID', checkNumber: '330021', bankName: 'بانک پاسارگاد', amount: 40_000_000, dueDate: due(5), issueDate: due(-20), partyId: parties.find((p) => p.type === 'SUPPLIER')!.id },
            { tenantId: tenant.id, checkType: 'RECEIVED', checkNumber: '784490', bankName: 'بانک تجارت', amount: 6_000_000, dueDate: due(-3), issueDate: due(-60), partyId: customers[0].id },
            { tenantId: tenant.id, checkType: 'RECEIVED', checkNumber: '784401', bankName: 'بانک صادرات', amount: 12_000_000, dueDate: due(-15), issueDate: due(-70), partyId: customers[2].id, status: 'CASHED', cashedAt: due(-14) },
        ],
    });

    // هزینه‌های نمونه
    const exp = (d: number, category: string, amount: number, description?: string) => ({ tenantId: tenant.id, branchId: hq.id, category, amount, date: new Date(Date.now() - d * DAY), description, createdBy: admin.id });
    await prisma.expense.createMany({ data: [exp(2, 'اجاره', 25_000_000, 'اجاره مغازه'), exp(5, 'حقوق و دستمزد', 18_000_000, 'حقوق فروشنده'), exp(9, 'برق، آب و گاز', 2_400_000), exp(12, 'حمل‌ونقل', 1_350_000), exp(20, 'تبلیغات', 3_000_000), exp(33, 'اجاره', 25_000_000, 'اجاره ماه قبل')] });

    console.log('\n✔ فروشگاه نمونه ساخته شد\n   ورود مدیر : 09120000000 / demo1234\n   ورود فروشنده: 09121111111 / demo1234\n');
}

async function main() {
    await masterData();
    if (process.env.SEED_DEMO !== 'false') await demoTenant();
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
