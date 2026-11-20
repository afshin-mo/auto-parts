import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const required = this.reflector.getAllAndOverride<string[]>(PERMS_KEY, [context.getHandler(), context.getClass()]);
        if (!required || required.length === 0) return true;

        const { user } = context.switchToHttp().getRequest();
        if (!user) return false;
        if (user.role === 'SUPER_ADMIN') return true;

        const have: string[] = user.permissions ?? [];
        if (required.some((k) => have.includes(k))) return true;
        throw new ForbiddenException('شما به این بخش دسترسی ندارید');
    }
}
