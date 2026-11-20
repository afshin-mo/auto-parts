import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { BranchesService } from '../../modules/branches/branches.service';

/** شعبه‌ی فعال را از هدر x-branch-id می‌خواند و با دسترسی‌های کاربر تطبیق می‌دهد (هدر به‌تنهایی اعتبار ندارد) */
@Injectable()
export class BranchGuard implements CanActivate {
    constructor(private reflector: Reflector, private branches: BranchesService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
        if (isPublic) return true;

        const req = context.switchToHttp().getRequest();
        if (!req.user?.tenantId) return true; // TenantGuard پیش‌تر خطا می‌دهد
        req.branchCtx = await this.branches.resolveContext(req.user, req.headers['x-branch-id']);
        return true;
    }
}
