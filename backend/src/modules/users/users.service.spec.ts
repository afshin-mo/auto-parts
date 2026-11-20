import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService.resetPassword', () => {
    const make = (target: { role: string } | null) => {
        const update = jest.fn();
        const prisma = { user: { findFirst: jest.fn(async () => (target ? { id: 'u2', ...target } : null)), update } };
        return { svc: new UsersService(prisma as any), update };
    };

    it('مدیر فروشگاه رمز یک فروشنده را عوض می‌کند', async () => {
        const { svc, update } = make({ role: 'SALESMAN' });
        await expect(svc.resetPassword('t1', 'u2', 'secret123', 'TENANT_ADMIN')).resolves.toEqual({ reset: true });
        expect(update).toHaveBeenCalledTimes(1);
    });
    it('کاربر پیدا نشد → ۴۰۴', async () => {
        await expect(make(null).svc.resetPassword('t1', 'u2', 'secret123', 'TENANT_ADMIN')).rejects.toBeInstanceOf(NotFoundException);
    });
    it('رمز SUPER_ADMIN را هیچ‌کس عوض نمی‌کند', async () => {
        const { svc, update } = make({ role: 'SUPER_ADMIN' });
        await expect(svc.resetPassword('t1', 'u2', 'secret123', 'TENANT_ADMIN')).rejects.toBeInstanceOf(ForbiddenException);
        expect(update).not.toHaveBeenCalled();
    });
    it('نقش غیرمدیر (حتی با users.manage) رمز مدیر فروشگاه را عوض نمی‌کند', async () => {
        const { svc, update } = make({ role: 'TENANT_ADMIN' });
        await expect(svc.resetPassword('t1', 'u2', 'secret123', 'MANAGER')).rejects.toBeInstanceOf(ForbiddenException);
        expect(update).not.toHaveBeenCalled();
    });
    it('مدیر فروشگاه رمز مدیر دیگر را می‌تواند عوض کند', async () => {
        const { svc } = make({ role: 'TENANT_ADMIN' });
        await expect(svc.resetPassword('t1', 'u2', 'secret123', 'TENANT_ADMIN')).resolves.toEqual({ reset: true });
    });
});
