import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { authUserCache } from '../../../common/auth-user-cache';

describe('JwtStrategy cache', () => {
    const row = (over: object = {}) => ({
        id: 'u1', name: 'n', phone: '09', role: 'SALESMAN', tenantId: 't1', isActive: true, allBranches: true, defaultBranchId: null,
        tenant: { isActive: true, planStatus: 'ACTIVE' }, customRole: null, branches: [{ branchId: 'b1' }], ...over,
    });
    const make = (rows: object[]) => {
        const findUnique = jest.fn(async () => rows.shift());
        const strategy = new JwtStrategy({ getOrThrow: () => 'secret' } as any, { user: { findUnique } } as any);
        return { strategy, findUnique };
    };
    beforeEach(() => authUserCache.clear());

    it('کاربر را کش می‌کند و کپی برمی‌گرداند (تغییر req.user روی درخواست بعد اثر ندارد)', async () => {
        const { strategy, findUnique } = make([row()]);
        const a: any = await strategy.validate({ sub: 'u1' });
        a.branchIds.push('hack');
        const b: any = await strategy.validate({ sub: 'u1' });
        expect(findUnique).toHaveBeenCalledTimes(1);
        expect(b.branchIds).toEqual(['b1']);
    });

    it('بعد از clear دوباره از دیتابیس می‌خواند', async () => {
        const { strategy, findUnique } = make([row(), row({ role: 'MANAGER' })]);
        await strategy.validate({ sub: 'u1' });
        authUserCache.clear('u1');
        expect(((await strategy.validate({ sub: 'u1' })) as any).role).toBe('MANAGER');
        expect(findUnique).toHaveBeenCalledTimes(2);
    });

    it('کاربر غیرفعال هرگز کش نمی‌شود و رد می‌شود', async () => {
        const { strategy, findUnique } = make([row({ isActive: false }), row({ isActive: false })]);
        await expect(strategy.validate({ sub: 'u1' })).rejects.toBeInstanceOf(UnauthorizedException);
        await expect(strategy.validate({ sub: 'u1' })).rejects.toBeInstanceOf(UnauthorizedException);
        expect(findUnique).toHaveBeenCalledTimes(2);
    });

    it('بعد از TTL دوباره از دیتابیس می‌خواند', async () => {
        jest.useFakeTimers();
        try {
            const { strategy, findUnique } = make([row(), row()]);
            await strategy.validate({ sub: 'u1' });
            jest.setSystemTime(Date.now() + 31_000);
            await strategy.validate({ sub: 'u1' });
            expect(findUnique).toHaveBeenCalledTimes(2);
        } finally { jest.useRealTimers(); }
    });
});
