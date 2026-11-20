import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BranchContext, branchFilter, branchSql } from '../../common/branch.context';
import { jalaliMonthStart, startOfDay, toJalali, JALALI_MONTHS } from '../../common/utils/jalali.util';

/** منطقه‌ی زمانی سرور؛ «روز» در SQL باید با روز محلیِ JS (startOfDay) یکی باشد */
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const VALID = { status: { notIn: ['CANCELLED', 'DRAFT'] as ('CANCELLED' | 'DRAFT')[] }, deletedAt: null };

@Injectable()
export class ReportsService {
    constructor(private prisma: PrismaService) { }

    private range(from?: string, to?: string) {
        const end = to ? new Date(to) : new Date();
        end.setHours(23, 59, 59, 999);
        const start = from ? new Date(from) : new Date(end.getTime() - 29 * 86400000);
        start.setHours(0, 0, 0, 0);
        return { start, end };
    }

    async dashboard(tenantId: string, ctx: BranchContext) {
        // همه‌ی کوئری‌ها در یک تراکنش: زمینه‌ی فروشگاه فقط یک بار ست می‌شود (به‌جای ~۴۰ دستور SQL) و فقط یک اتصال می‌گیرد؛
        // کوئری‌های داخل تراکنش روی همان اتصال صف می‌شوند. timeout بیشتر از پیش‌فرض ۵ ثانیه برای فروشگاه‌های بزرگ.
        return this.prisma.$transaction(async (tx) => {
            const bf = branchFilter(ctx);
            const today = startOfDay();
            const monthStart = jalaliMonthStart();
            const since30 = new Date(today.getTime() - 29 * 86400000);

            // فروش خالص = فروش − برگشت از فروش
            const sum = async (from: Date) => {
                const [s, r] = await Promise.all([
                    tx.invoice.aggregate({ where: { tenantId, invoiceType: 'SALE', ...VALID, AND: [bf], date: { gte: from } }, _sum: { totalAmount: true }, _count: true }),
                    tx.invoice.aggregate({ where: { tenantId, invoiceType: 'SALE_RETURN', ...VALID, AND: [bf], date: { gte: from } }, _sum: { totalAmount: true } }),
                ]);
                return { _sum: { totalAmount: Number(s._sum.totalAmount ?? 0) - Number(r._sum.totalAmount ?? 0) }, _count: s._count };
            };

            const [todayAgg, monthAgg, receivable, payable, dueChecks, recent, last30, lowStock] = await Promise.all([
                sum(today),
                sum(monthStart),
                tx.party.aggregate({ where: { tenantId, partyType: 'CUSTOMER', currentBalance: { gt: 0 } }, _sum: { currentBalance: true } }),
                tx.party.aggregate({ where: { tenantId, partyType: 'SUPPLIER', currentBalance: { gt: 0 } }, _sum: { currentBalance: true } }),
                tx.check.findMany({
                    where: { tenantId, status: 'PENDING', dueDate: { lte: new Date(today.getTime() + 7 * 86400000) } },
                    include: { party: { select: { name: true } } }, orderBy: { dueDate: 'asc' }, take: 6,
                }),
                tx.invoice.findMany({
                    where: { tenantId, invoiceType: 'SALE', deletedAt: null, AND: [bf] },
                    select: { id: true, invoiceNumber: true, date: true, totalAmount: true, status: true, partyName: true, party: { select: { name: true } } },
                    orderBy: { createdAt: 'desc' }, take: 6,
                }),
                // جمع روزانه در خود دیتابیس (به‌جای آوردن همه‌ی فاکتورهای ۳۰ روز)؛ «روز» همان روز محلیِ سرور است، مثل startOfDay
                tx.$queryRaw<{ day: string; invoice_type: string; total: number }[]>(Prisma.sql`
                    SELECT ((date AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::date::text AS day, invoice_type::text AS invoice_type, COALESCE(SUM(total_amount), 0)::float8 AS total
                      FROM invoices
                     WHERE tenant_id = ${tenantId} AND invoice_type IN ('SALE', 'SALE_RETURN') AND status NOT IN ('CANCELLED', 'DRAFT')
                       AND deleted_at IS NULL AND ${branchSql(ctx, 'branch_id')} AND date >= ${since30}
                     GROUP BY 1, 2`),
                // تعداد کالاهای کم‌موجودی در دیتابیس (به‌جای آوردن همه‌ی کالاها با ردیف‌های موجودی)
                tx.$queryRaw<{ n: number }[]>(Prisma.sql`
                    SELECT count(*)::int AS n
                      FROM products p
                     WHERE p.tenant_id = ${tenantId} AND p.deleted_at IS NULL AND p.is_active AND NOT p.is_service AND p.min_stock > 0
                       AND COALESCE((SELECT SUM(i.quantity) FROM inventory i JOIN warehouses w ON w.id = i.warehouse_id
                                      WHERE i.product_id = p.id AND ${branchSql(ctx, 'w.branch_id')}), 0) <= p.min_stock`),
            ]);

            const byDay = new Map<string, number>();
            for (let i = 0; i < 30; i++) byDay.set(new Date(since30.getTime() + i * 86400000).toDateString(), 0);
            for (const r of last30) {
                const [y, m, d] = r.day.split('-').map(Number);
                const k = new Date(y, m - 1, d).toDateString();
                byDay.set(k, (byDay.get(k) ?? 0) + (r.invoice_type === 'SALE_RETURN' ? -1 : 1) * r.total);
            }
            const lowStockCount = lowStock[0]?.n ?? 0;

            return {
                today: { total: Number(todayAgg._sum.totalAmount ?? 0), count: todayAgg._count },
                month: { total: Number(monthAgg._sum.totalAmount ?? 0), count: monthAgg._count },
                receivable: Number(receivable._sum.currentBalance ?? 0),
                payable: Number(payable._sum.currentBalance ?? 0),
                lowStockCount,
                dueChecks,
                recentInvoices: recent,
                salesLast30Days: [...byDay.entries()].map(([d, total]) => ({ date: new Date(d), total })),
            };
            }, { maxWait: 10_000, timeout: 20_000 });
    }

    /** خلاصه فروش به تفکیک روز یا ماه شمسی */
    async salesSummary(tenantId: string, ctx: BranchContext, from?: string, to?: string, groupBy: 'day' | 'month' = 'day') {
        const { start, end } = this.range(from, to);
        const invoices = await this.prisma.invoice.findMany({
            where: { tenantId, invoiceType: { in: ['SALE', 'SALE_RETURN'] }, ...VALID, AND: [branchFilter(ctx)], date: { gte: start, lte: end } },
            select: { date: true, invoiceType: true, subtotal: true, discountAmount: true, vatAmount: true, totalAmount: true },
        });

        const buckets = new Map<string, { label: string; sort: number; count: number; subtotal: number; discount: number; vat: number; total: number }>();
        for (const i of invoices) {
            const j = toJalali(i.date);
            const key = groupBy === 'month' ? `${j.jy}-${j.jm}` : `${j.jy}-${j.jm}-${j.jd}`;
            const label = groupBy === 'month' ? `${JALALI_MONTHS[j.jm - 1]} ${j.jy}` : `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
            const b = buckets.get(key) ?? { label, sort: startOfDay(i.date).getTime(), count: 0, subtotal: 0, discount: 0, vat: 0, total: 0 };
            const sign = i.invoiceType === 'SALE_RETURN' ? -1 : 1;
            if (sign === 1) b.count++;
            b.subtotal += sign * Number(i.subtotal);
            b.discount += sign * Number(i.discountAmount);
            b.vat += sign * Number(i.vatAmount);
            b.total += sign * Number(i.totalAmount);
            if (startOfDay(i.date).getTime() < b.sort) b.sort = startOfDay(i.date).getTime();
            buckets.set(key, b);
        }
        const rows = [...buckets.values()].sort((a, b) => a.sort - b.sort);
        return {
            from: start, to: end, groupBy, rows,
            totals: rows.reduce((t, r) => ({ count: t.count + r.count, total: t.total + r.total, vat: t.vat + r.vat, discount: t.discount + r.discount }), { count: 0, total: 0, vat: 0, discount: 0 }),
        };
    }

    async topProducts(tenantId: string, ctx: BranchContext, from?: string, to?: string, limit = 10) {
        const bf = branchFilter(ctx);
        const { start, end } = this.range(from, to);
        const items = await this.prisma.invoiceItem.groupBy({
            by: ['productId', 'productName', 'sku'],
            where: { invoice: { tenantId, invoiceType: 'SALE', ...VALID, AND: [bf], date: { gte: start, lte: end } } },
            _sum: { quantity: true, totalPrice: true },
            orderBy: { _sum: { totalPrice: 'desc' } },
            take: limit,
        });
        const back = await this.prisma.invoiceItem.groupBy({
            by: ['productId'],
            where: { invoice: { tenantId, invoiceType: 'SALE_RETURN', ...VALID, AND: [bf], date: { gte: start, lte: end } } },
            _sum: { quantity: true, totalPrice: true },
        });
        const ret = new Map(back.map((b) => [b.productId, b._sum]));
        return items
            .map((i) => ({
                productId: i.productId, name: i.productName, sku: i.sku,
                quantity: Number(i._sum.quantity ?? 0) - Number(ret.get(i.productId)?.quantity ?? 0),
                revenue: Number(i._sum.totalPrice ?? 0) - Number(ret.get(i.productId)?.totalPrice ?? 0),
            }))
            .sort((a, b) => b.revenue - a.revenue);
    }

    /** سود ناخالص = فروش خالص (بدون مالیات) − بهای تمام‌شده ؛ سود خالص = سود ناخالص − هزینه‌ها */
    async profit(tenantId: string, ctx: BranchContext, from?: string, to?: string) {
        const { start, end } = this.range(from, to);
        const bf = branchFilter(ctx);
        const inv = (t: 'SALE' | 'SALE_RETURN') => this.prisma.invoice.aggregate({
            where: { tenantId, invoiceType: t, ...VALID, AND: [bf], date: { gte: start, lte: end } }, _sum: { subtotal: true, discountAmount: true },
        });
        const [rev, retRev, cogsOut, cogsIn, exp] = await Promise.all([
            inv('SALE'), inv('SALE_RETURN'),
            this.prisma.inventoryTransaction.aggregate({ where: { tenantId, transactionType: 'SALE', warehouse: { AND: [bf] }, createdAt: { gte: start, lte: end } }, _sum: { totalCost: true } }),
            this.prisma.inventoryTransaction.aggregate({ where: { tenantId, transactionType: 'SALE_RETURN', warehouse: { AND: [bf] }, createdAt: { gte: start, lte: end } }, _sum: { totalCost: true } }),
            this.prisma.expense.aggregate({ where: { tenantId, AND: [bf], date: { gte: start, lte: end } }, _sum: { amount: true } }),
        ]);
        const revenue = Number(rev._sum.subtotal ?? 0) - Number(rev._sum.discountAmount ?? 0) - (Number(retRev._sum.subtotal ?? 0) - Number(retRev._sum.discountAmount ?? 0));
        const cogs = Number(cogsOut._sum.totalCost ?? 0) - Number(cogsIn._sum.totalCost ?? 0);
        const expenses = Number(exp._sum.amount ?? 0);
        const grossProfit = revenue - cogs;
        return {
            from: start, to: end, revenue, cogs, grossProfit, expenses, netProfit: grossProfit - expenses,
            marginPercent: revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
        };
    }

    async receivables(tenantId: string, type: 'CUSTOMER' | 'SUPPLIER' = 'CUSTOMER') {
        const parties = await this.prisma.party.findMany({
            where: { tenantId, partyType: type, currentBalance: { not: 0 } },
            select: { id: true, name: true, code: true, mobile: true, phone: true, currentBalance: true, creditLimit: true },
            orderBy: { currentBalance: 'desc' },
        });
        return { total: parties.reduce((s, p) => s + Number(p.currentBalance), 0), parties };
    }

    /**
     * گزارش پرفروش / کم‌فروش / بی‌گردش (راکد) بر اساس حرکت واقعی انبار در بازه‌ی انتخابی.
     *  - پرفروش: کالاهایی که روی هم ۸۰٪ تعداد فروش بازه را می‌سازند (قاعده‌ی پارتو)
     *  - کم‌فروش: بقیه‌ی کالاهای فروخته‌شده
     *  - بی‌گردش: موجودی دارند ولی در بازه هیچ فروشی نداشته‌اند (سرمایه‌ی خوابیده)
     */
    async productMovers(tenantId: string, ctx: BranchContext, from?: string, to?: string, limit = 50) {
        const { start, end } = this.range(from, to);
        const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
        const wf = { warehouse: { AND: [branchFilter(ctx)] } };

        const [products, soldRows, lastRows, lotRows] = await Promise.all([
            this.prisma.product.findMany({
                where: { tenantId, deletedAt: null, isActive: true, isService: false },
                select: {
                    id: true, sku: true, name: true, purchasePrice: true, salePrice: true, minStock: true, createdAt: true,
                    inventory: { where: { warehouse: { AND: [branchFilter(ctx)] } }, select: { quantity: true } },
                },
                take: 20000,
            }),
            this.prisma.inventoryTransaction.groupBy({
                by: ['productId'],
                where: { tenantId, ...wf, transactionType: { in: ['SALE', 'SALE_RETURN'] }, createdAt: { gte: start, lte: end } },
                _sum: { quantity: true },
            }),
            this.prisma.inventoryTransaction.groupBy({
                by: ['productId'],
                where: { tenantId, ...wf, transactionType: 'SALE' },
                _max: { createdAt: true },
            }),
            // ارزش موجودی = جمع (تعداد × قیمت خرید) هر ردیف قیمت، نه قیمت فعلی کالا × کل موجودی
            this.prisma.inventoryLot.findMany({ where: { tenantId, quantity: { gt: 0 }, ...wf }, select: { productId: true, quantity: true, unitCost: true } }),
        ]);
        const value = new Map<string, number>();
        for (const l of lotRows) value.set(l.productId, (value.get(l.productId) ?? 0) + Number(l.quantity) * Number(l.unitCost));
        // حرکت فروش با علامت منفی ذخیره می‌شود (خروج)؛ فروش خالص = −مجموع
        const sold = new Map(soldRows.map((r) => [r.productId, -Number(r._sum.quantity ?? 0)]));
        const last = new Map(lastRows.map((r) => [r.productId, r._max.createdAt]));
        const now = Date.now();

        const rows = products.map((p) => {
            const stock = p.inventory.reduce((s, i) => s + Number(i.quantity), 0);
            const soldQty = Math.max(0, Number(sold.get(p.id) ?? 0));
            const lastSaleAt = last.get(p.id) ?? null;
            const perDay = soldQty / days;
            return {
                productId: p.id, sku: p.sku, name: p.name, stock, soldQty,
                lastSaleAt,
                daysSinceLastSale: lastSaleAt ? Math.floor((now - lastSaleAt.getTime()) / 86400000) : null,
                stockValue: Math.round(value.get(p.id) ?? stock * Number(p.purchasePrice)),
                turnover: stock > 0 ? Math.round((soldQty / stock) * 100) / 100 : soldQty > 0 ? null : 0,
                coverDays: perDay > 0 ? Math.round(stock / perDay) : null,
                isNew: now - p.createdAt.getTime() < days * 86400000,
            };
        });

        const sellers = rows.filter((r) => r.soldQty > 0).sort((a, b) => b.soldQty - a.soldQty);
        const totalSold = sellers.reduce((s, r) => s + r.soldQty, 0);
        let acc = 0;
        const fast: typeof rows = [], slow: typeof rows = [];
        for (const r of sellers) {
            (acc < totalSold * 0.8 ? fast : slow).push(r);
            acc += r.soldQty;
        }
        // کم‌فروش‌ها از کمترین فروش شروع می‌شوند
        slow.sort((a, b) => a.soldQty - b.soldQty);
        const dead = rows.filter((r) => r.stock > 0 && r.soldQty === 0 && !r.isNew).sort((a, b) => b.stockValue - a.stockValue);

        return {
            from: start, to: end, days,
            summary: {
                fastCount: fast.length, slowCount: slow.length, deadCount: dead.length,
                deadStockValue: dead.reduce((s, r) => s + r.stockValue, 0),
                totalSoldQty: totalSold,
            },
            fast: fast.slice(0, limit), slow: slow.slice(0, limit), dead: dead.slice(0, limit),
        };
    }

    /**
     * بدهکاران (کسانی که به ما بدهکارند) و بستانکاران (کسانی که ما به آن‌ها بدهکاریم) با سن بدهی.
     * سن بدهی تقریبی و به روش FIFO است: مانده‌ی فعلی از جدیدترین فاکتورها پر می‌شود (قدیمی‌ترها اول تسویه شده‌اند)
     * و هر فاکتور بر اساس سررسید (یا تاریخ + مهلت پرداخت) در یکی از سطل‌های سنی قرار می‌گیرد.
     */
    async debts(tenantId: string) {
        const parties = await this.prisma.party.findMany({
            where: { tenantId, currentBalance: { not: 0 } },
            select: { id: true, name: true, code: true, mobile: true, phone: true, partyType: true, currentBalance: true, creditLimit: true, paymentTerms: true, openingBalance: true },
        });
        const ids = parties.map((p) => p.id);
        const [invoices, lastPay] = ids.length ? await Promise.all([
            this.prisma.invoice.findMany({
                where: { tenantId, partyId: { in: ids }, invoiceType: { in: ['SALE', 'PURCHASE'] }, status: { notIn: ['CANCELLED', 'DRAFT'] }, deletedAt: null },
                select: { partyId: true, invoiceType: true, date: true, dueDate: true, totalAmount: true },
                orderBy: { date: 'desc' },
            }),
            this.prisma.payment.groupBy({ by: ['partyId'], where: { tenantId, partyId: { in: ids } }, _max: { date: true } }),
        ]) : [[], []];

        const byParty = new Map<string, typeof invoices>();
        invoices.forEach((i) => byParty.set(i.partyId!, [...(byParty.get(i.partyId!) ?? []), i]));
        const lastPayMap = new Map(lastPay.map((l) => [l.partyId!, l._max.date]));
        const today = startOfDay().getTime();
        const BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90plus'] as const;
        const bucketOf = (overdueDays: number) => overdueDays <= 0 ? 'current' : overdueDays <= 30 ? 'd1_30' : overdueDays <= 60 ? 'd31_60' : overdueDays <= 90 ? 'd61_90' : 'd90plus';

        const rows = parties.map((p) => {
            const balance = Number(p.currentBalance);
            const owesUs = (p.partyType === 'CUSTOMER') === (balance > 0); // مشتری با مانده‌ی مثبت یا تأمین‌کننده با مانده‌ی منفی
            let remaining = Math.abs(balance);
            const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
            let oldest = 0;
            // فقط فاکتورهای هم‌جهت با مانده در تخصیص شرکت می‌کنند
            const wantType = balance > 0 ? (p.partyType === 'CUSTOMER' ? 'SALE' : 'PURCHASE') : null;
            for (const inv of wantType ? (byParty.get(p.id) ?? []).filter((i) => i.invoiceType === wantType) : []) {
                if (remaining <= 0) break;
                const amt = Math.min(remaining, Number(inv.totalAmount));
                const due = inv.dueDate ?? new Date(inv.date.getTime() + (p.paymentTerms ?? 0) * 86400000);
                const overdue = Math.floor((today - startOfDay(due).getTime()) / 86400000);
                buckets[bucketOf(overdue)] += amt;
                oldest = Math.max(oldest, overdue);
                remaining -= amt;
            }
            // باقی‌مانده (مانده‌ی اول دوره یا اختلاف) قدیمی‌ترین محسوب می‌شود
            if (remaining > 0) buckets.d90plus += remaining;
            return {
                id: p.id, name: p.name, code: p.code, mobile: p.mobile ?? p.phone, partyType: p.partyType,
                balance: Math.abs(balance), buckets, oldestOverdueDays: Math.max(0, oldest),
                lastPaymentAt: lastPayMap.get(p.id) ?? null, creditLimit: p.creditLimit ? Number(p.creditLimit) : null,
                side: owesUs ? 'DEBTOR' as const : 'CREDITOR' as const,
            };
        });

        const pack = (side: 'DEBTOR' | 'CREDITOR') => {
            const list = rows.filter((r) => r.side === side).sort((a, b) => b.balance - a.balance);
            const totals = { total: 0, ...Object.fromEntries(BUCKETS.map((b) => [b, 0])) } as Record<string, number>;
            list.forEach((r) => { totals.total += r.balance; BUCKETS.forEach((b) => (totals[b] += r.buckets[b])); });
            return { totals, rows: list };
        };
        return { debtors: pack('DEBTOR'), creditors: pack('CREDITOR') };
    }
}
