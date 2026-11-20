import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { effectivePermissions } from '../../../common/permissions';
import { tenantContext } from '../../../common/tenant-context';
import { authUserCache } from '../../../common/auth-user-cache';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        configService: ConfigService,
        private prisma: PrismaService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.getOrThrow<string>('jwt.secret'),
        });
    }

    async validate(payload: { sub: string }) {
        const cached = authUserCache.get<object>(payload.sub);
        if (cached) return cached;

        const user = await tenantContext.asSystem(() => this.prisma.user.findUnique({
            where: { id: payload.sub },
            include: {
                tenant: { select: { isActive: true, planStatus: true } },
                customRole: { select: { permissions: true } },
                branches: { select: { branchId: true } },
            },
        }));

        if (!user || !user.isActive || !user.tenant.isActive) {
            throw new UnauthorizedException('حساب کاربری غیرفعال است');
        }

        const authUser = {
            id: user.id,
            name: user.name,
            phone: user.phone,
            role: user.role,
            tenantId: user.tenantId,
            planStatus: user.tenant.planStatus,
            // مجوزهای مؤثر (نقش دلخواه یا پیش‌فرض نقش سیستمی) و دسترسی شعبه‌ها
            permissions: effectivePermissions(user.role, user.customRole?.permissions),
            allBranches: user.allBranches,
            branchIds: user.branches.map((b) => b.branchId),
            defaultBranchId: user.defaultBranchId,
        };
        authUserCache.set(payload.sub, authUser);
        return authUser;
    }
}
