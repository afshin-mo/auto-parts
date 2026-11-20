import { createTenantPrisma } from './tenant-prisma';
import { tenantContext } from '../../common/tenant-context';

/** نقش و تنظیم‌های فروشگاه که روی اتصال گذاشته می‌شود: [app.tenant_id, app.is_super, role] */
async function contextValues(rls: boolean | undefined, run: <T>(fn: () => Promise<T>) => Promise<T>) {
    const queryRaw = jest.fn();
    const tx = { $queryRaw: queryRaw };
    const base = { $extends: (def: unknown) => def, $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };
    const db: any = createTenantPrisma(base as any, rls === undefined ? undefined : { rls });
    await run(() => db.$transaction(async () => 'ok'));
    return queryRaw.mock.calls[0].slice(1);
}

describe('createTenantPrisma: تنظیم زمینه', () => {
    it('حالت سیستمی با RLS آماده، نقش auto_parts_system را می‌گیرد', async () => {
        expect(await contextValues(true, (f) => tenantContext.asSystem(f))).toEqual(['', '', 'auto_parts_system']);
    });
    it('حالت پیش‌فرض (بدون گزینه) مثل RLS آماده رفتار می‌کند', async () => {
        expect(await contextValues(undefined, (f) => tenantContext.asSystem(f))).toEqual(['', '', 'auto_parts_system']);
    });
    it('اگر RLS راه‌اندازی نشده، هرگز نقشی که وجود ندارد را انتخاب نمی‌کند (باگ «role does not exist»)', async () => {
        expect(await contextValues(false, (f) => tenantContext.asSystem(f))).toEqual(['', '', 'none']);
    });
    it('حالت فروشگاه: tenant_id ست می‌شود و نقش none می‌ماند', async () => {
        expect(await contextValues(true, (f) => tenantContext.asTenant('t1', f))).toEqual(['t1', '', 'none']);
        expect(await contextValues(false, (f) => tenantContext.asTenant('t1', f))).toEqual(['t1', '', 'none']);
    });
    it('بدون زمینه هیچ تنانتی ست نمی‌شود (fail-closed)', async () => {
        expect(await contextValues(true, (f) => f())).toEqual(['', '', 'none']);
    });
});
