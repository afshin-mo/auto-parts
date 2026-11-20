import { BadRequestException } from '@nestjs/common';
import { BranchContext, branchFilter, branchSql, requireActiveBranch } from './branch.context';

const ctx = (p: Partial<BranchContext>) => Object.assign(new BranchContext(), p);

describe('branchFilter', () => {
    it('با شعبه‌ی فعال فقط همان شعبه', () => {
        expect(branchFilter(ctx({ activeId: 'b1', allowedIds: ['b1', 'b2'], unrestricted: true }))).toEqual({ branchId: 'b1' });
    });
    it('«همه‌ی شعبه‌ها» برای کاربر بدون محدودیت، رکوردهای قدیمیِ بی‌شعبه را هم شامل می‌شود', () => {
        expect(branchFilter(ctx({ activeId: null, allowedIds: ['b1', 'b2'], unrestricted: true }))).toEqual({ OR: [{ branchId: { in: ['b1', 'b2'] } }, { branchId: null }] });
    });
    it('کاربر محدود هرگز رکورد شعبه‌ی غیرمجاز یا بی‌شعبه نمی‌بیند', () => {
        expect(branchFilter(ctx({ activeId: null, allowedIds: ['b1'], unrestricted: false }))).toEqual({ branchId: { in: ['b1'] } });
    });
});

describe('requireActiveBranch', () => {
    it('در حالت «همه‌ی شعبه‌ها» خطا می‌دهد', () => {
        expect(() => requireActiveBranch(ctx({ activeId: null }))).toThrow(BadRequestException);
    });
    it('شناسه‌ی شعبه‌ی فعال را برمی‌گرداند', () => {
        expect(requireActiveBranch(ctx({ activeId: 'b1' }))).toBe('b1');
    });
});

describe('branchSql', () => {
    it('همان منطق branchFilter را به SQL پارامتری می‌دهد', () => {
        const a = branchSql(ctx({ activeId: 'b1', allowedIds: ['b1', 'b2'], unrestricted: true }), 'w.branch_id');
        expect(a.sql).toBe('w.branch_id = ?'); expect(a.values).toEqual(['b1']);
        const u = branchSql(ctx({ allowedIds: ['b1', 'b2'], unrestricted: true }), 'branch_id');
        expect(u.sql).toBe('(branch_id = ANY(?::text[]) OR branch_id IS NULL)'); expect(u.values).toEqual([['b1', 'b2']]);
        const r = branchSql(ctx({ allowedIds: ['b1'], unrestricted: false }), 'branch_id');
        expect(r.sql).toBe('branch_id = ANY(?::text[])'); expect(r.values).toEqual([['b1']]);
    });
});
