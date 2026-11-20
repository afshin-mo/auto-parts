import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { BranchContext } from '../branch.context';

/** زمینه‌ی شعبه‌ی درخواست جاری (شعبه‌ی فعال و شعبه‌های مجاز) */
export const BranchCtx = createParamDecorator((_data: unknown, ctx: ExecutionContext): BranchContext => {
    return ctx.switchToHttp().getRequest().branchCtx;
});
