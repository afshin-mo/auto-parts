import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { ALL_PERMISSION_KEYS, PERMISSIONS, effectivePermissions, systemRolePermissions } from './permissions';

function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

describe('کاتالوگ مجوزها', () => {
    it('کلیدها یکتا و با قالب «بخش.عملیات» هستند', () => {
        expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
        PERMISSIONS.forEach((p) => expect(p.key).toMatch(/^[a-z]+\.[a-zA-Z]+$/));
    });

    it('هر مجوزی که روی یک مسیر با @Perm گذاشته شده در کاتالوگ هست (جلوگیری از کلید اشتباه)', () => {
        const root = join(__dirname, '..', 'modules');
        const used = new Set<string>();
        walk(root).filter((f) => f.endsWith('.controller.ts')).forEach((f) => {
            for (const m of readFileSync(f, 'utf8').matchAll(/@Perm\(([^)]*)\)/g)) {
                for (const k of m[1].matchAll(/'([^']+)'/g)) used.add(k[1]);
            }
        });
        expect(used.size).toBeGreaterThan(30);
        const unknown = [...used].filter((k) => !ALL_PERMISSION_KEYS.includes(k));
        expect(unknown).toEqual([]);
    });
});

describe('مجوزهای پیش‌فرض نقش‌ها', () => {
    it('مدیر فروشگاه همه‌ی مجوزها را دارد', () => {
        expect(systemRolePermissions('TENANT_ADMIN').sort()).toEqual([...ALL_PERMISSION_KEYS].sort());
    });
    it('فروشنده قیمت خرید، گزارش و مدیریت کاربران را نمی‌بیند ولی می‌فروشد', () => {
        const p = systemRolePermissions('SALESMAN');
        expect(p).toContain('sales.create');
        expect(p).toContain('products.view');
        expect(p).not.toContain('products.viewCost');
        expect(p).not.toContain('reports.profit');
        expect(p).not.toContain('users.manage');
        expect(p).not.toContain('purchases.view');
    });
    it('انباردار موجودی را اصلاح می‌کند ولی فاکتور فروش صادر نمی‌کند', () => {
        const p = systemRolePermissions('WAREHOUSE');
        expect(p).toContain('inventory.adjust');
        expect(p).toContain('products.create');
        expect(p).not.toContain('sales.create');
    });
    it('حسابدار گزارش بدهکاران و چک را دارد ولی کالا نمی‌سازد', () => {
        const p = systemRolePermissions('ACCOUNTANT');
        expect(p).toContain('reports.debts');
        expect(p).toContain('checks.manage');
        expect(p).not.toContain('products.create');
    });
});

describe('effectivePermissions', () => {
    it('نقش دلخواه جایگزین پیش‌فرض می‌شود و کلیدهای نامعتبر حذف می‌شوند', () => {
        expect(effectivePermissions('SALESMAN', ['products.view', 'bogus.key'])).toEqual(['products.view']);
    });
    it('بدون نقش دلخواه، پیش‌فرض نقش سیستمی', () => {
        expect(effectivePermissions('MANAGER', null)).toEqual(systemRolePermissions('MANAGER'));
    });
});
