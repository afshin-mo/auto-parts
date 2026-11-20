import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { tenantContext } from '../tenant-context';

const BLOCKED_PLANS = ['SUSPENDED', 'EXPIRED', 'CANCELLED'];

/**
 * شناسه فروشگاه (tenant) فقط از توکن کاربر خوانده می‌شود، نه از هدر درخواست؛
 * بنابراین کاربر نمی‌تواند با ارسال x-tenant-id به داده‌ی فروشگاه دیگری دسترسی پیدا کند.
 */
@Injectable()
export class TenantGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) return true;

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user?.tenantId) {
            throw new UnauthorizedException('شناسه فروشگاه مشخص نیست');
        }
        if (BLOCKED_PLANS.includes(user.planStatus)) {
            throw new ForbiddenException('اشتراک فروشگاه فعال نیست');
        }

        request.tenantId = user.tenantId;
        tenantContext.set(user.tenantId, user.role === 'SUPER_ADMIN');
        return true;
    }
}
