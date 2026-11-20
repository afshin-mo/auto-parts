/* eslint-disable no-console */
/**
 * یک‌بار پس از `prisma migrate deploy` برای دیتابیس‌های قدیمی اجرا شود (چند بار اجرا هم بی‌خطر است):
 *   npm run backfill:v2
 *
 *  ۱) برای هر فروشگاه «شعبه مرکزی» می‌سازد و انبارها/کاربران/فاکتورها/پرداخت‌ها/هزینه‌های بدون شعبه را به آن وصل می‌کند
 *  ۲) شماره‌های جستجوی (ProductCode) همه‌ی کالاها را از روی SKU/شماره فنی/OEM/بارکد می‌سازد
 *  ۳) فروشگاه‌هایی که قبلاً برند/دسته/واحد «سراسری» ساخته‌اند (با کد imp-…) را به همان فروشگاه نسبت می‌دهد
 */
import { PrismaClient } from '@prisma/client';
import { normalizeCode } from '../src/common/utils/code-normalize.util';

const prisma = new PrismaClient();

async function main() {
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
    for (const t of tenants) {
        let hq = await prisma.branch.findFirst({ where: { tenantId: t.id, isDefault: true } });
        if (!hq) hq = await prisma.branch.create({ data: { tenantId: t.id, name: 'شعبه مرکزی', code: 'HQ', isDefault: true } });
        const where = { tenantId: t.id, branchId: null };
        const [w, i, p, e, c] = await Promise.all([
            prisma.warehouse.updateMany({ where, data: { branchId: hq.id } }),
            prisma.invoice.updateMany({ where, data: { branchId: hq.id } }),
            prisma.payment.updateMany({ where, data: { branchId: hq.id } }),
            prisma.expense.updateMany({ where, data: { branchId: hq.id } }),
            prisma.check.updateMany({ where, data: { branchId: hq.id } }),
        ]);
        await prisma.user.updateMany({ where: { tenantId: t.id, defaultBranchId: null }, data: { defaultBranchId: hq.id } });
        console.log(`✔ ${t.name}: انبار ${w.count} · فاکتور ${i.count} · پرداخت ${p.count} · هزینه ${e.count} · چک ${c.count}`);
    }

    // شماره‌های جستجو
    let done = 0;
    for (;;) {
        const batch = await prisma.product.findMany({
            where: { deletedAt: null, codes: { none: {} } },
            select: { id: true, tenantId: true, sku: true, partNumber: true, oemCode: true, barcode: true },
            take: 500,
        });
        if (!batch.length) break;
        const rows = batch.flatMap((p) => {
            const seen = new Set<string>();
            return ([['SKU', p.sku], ['PART_NUMBER', p.partNumber], ['OEM', p.oemCode], ['BARCODE', p.barcode]] as const).flatMap(([type, code]) => {
                const codeNorm = normalizeCode(code);
                if (!codeNorm || seen.has(codeNorm)) return [];
                seen.add(codeNorm);
                return [{ tenantId: p.tenantId, productId: p.id, type, code: String(code).slice(0, 100), codeNorm }];
            });
        });
        // کالایی که هیچ شماره‌ای ندارد هم نباید هر بار دوباره پردازش شود
        if (!rows.length) break;
        await prisma.productCode.createMany({ data: rows, skipDuplicates: true });
        done += batch.length;
        if (batch.every((b) => !rows.some((r) => r.productId === b.id))) break;
    }
    console.log(`✔ شماره‌ی جستجو برای ${done} کالا ساخته شد`);

    // برند/دسته‌هایی که ورودگروهی سراسری ساخته بود
    const orphan = await prisma.$executeRawUnsafe(`UPDATE brands b SET tenant_id = x.tenant_id FROM (SELECT DISTINCT brand_id, tenant_id FROM products WHERE brand_id IS NOT NULL) x WHERE b.id = x.brand_id AND b.tenant_id IS NULL AND b.code LIKE 'imp-%'`);
    const orphanC = await prisma.$executeRawUnsafe(`UPDATE categories c SET tenant_id = x.tenant_id FROM (SELECT DISTINCT category_id, tenant_id FROM products WHERE category_id IS NOT NULL) x WHERE c.id = x.category_id AND c.tenant_id IS NULL AND c.code LIKE 'imp-%'`);
    console.log(`✔ برند ${orphan} و دسته ${orphanC} سراسری به فروشگاه صاحبش نسبت داده شد`);
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
