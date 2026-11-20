import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { effectivePermissions } from '../../common/permissions';

type UserWithTenant = {
    id: string; name: string; phone: string; email: string | null; role: string; tenantId: string;
    allBranches: boolean; defaultBranchId: string | null;
    tenant: { name: string; slug: string; planType: string; planStatus: string; trialEndDate: Date | null };
    customRole?: { name: string; permissions: string[] } | null;
};

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private config: ConfigService,
    ) { }

    private issueTokens(user: { id: string; phone: string; role: string; tenantId: string }) {
        const payload = { sub: user.id, phone: user.phone, role: user.role, tenantId: user.tenantId };
        return {
            accessToken: this.jwtService.sign(payload),
            refreshToken: this.jwtService.sign(payload, {
                secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
                expiresIn: this.config.getOrThrow<string>('jwt.refreshExpiresIn') as any,
            }),
        };
    }

    /** اطلاعات کاربر برای کلاینت: به‌همراه مجوزهای مؤثر و شعبه‌هایی که می‌تواند ببیند */
    private async publicUser(user: UserWithTenant) {
        const unrestricted = user.allBranches || user.role === 'SUPER_ADMIN';
        const branches = await this.prisma.branch.findMany({
            where: {
                tenantId: user.tenantId, isActive: true,
                ...(unrestricted ? {} : { users: { some: { userId: user.id } } }),
            },
            select: { id: true, name: true, code: true, isDefault: true },
            orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        });
        return {
            id: user.id,
            name: user.name,
            phone: user.phone,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId,
            tenantName: user.tenant.name,
            tenantSlug: user.tenant.slug,
            planType: user.tenant.planType,
            planStatus: user.tenant.planStatus,
            trialEndDate: user.tenant.trialEndDate,
            roleName: user.customRole?.name ?? null,
            permissions: effectivePermissions(user.role, user.customRole?.permissions),
            allBranches: unrestricted,
            branches,
            defaultBranchId: user.defaultBranchId ?? branches.find((b) => b.isDefault)?.id ?? branches[0]?.id ?? null,
        };
    }

    async login({ phone, password }: LoginDto) {
        const user = await this.prisma.user.findUnique({ where: { phone }, include: { tenant: true, customRole: { select: { name: true, permissions: true } } } });

        // مقایسه همیشه انجام می‌شود تا زمان پاسخ، وجود یا عدم وجود کاربر را لو ندهد
        const hash = user?.passwordHash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali';
        const valid = await bcrypt.compare(password, hash);
        if (!user || !valid) throw new UnauthorizedException('شماره موبایل یا رمز عبور اشتباه است');
        if (!user.isActive || !user.tenant.isActive) throw new UnauthorizedException('حساب کاربری غیرفعال است');

        const now = new Date();
        await this.prisma.$transaction(async (tx) => {
            await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
            await tx.tenant.update({ where: { id: user.tenantId }, data: { lastLoginAt: now } });
        });

        return { ...this.issueTokens(user), user: await this.publicUser(user) };
    }

    async register(dto: RegisterDto) {
        const { phone, password, name, email, tenantName, tenantSlug } = dto;

        if (await this.prisma.user.findUnique({ where: { phone } })) {
            throw new ConflictException('این شماره موبایل قبلاً ثبت‌نام کرده است');
        }
        if (await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } })) {
            throw new ConflictException('این نشانی اختصاصی قبلاً گرفته شده است');
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const { user, tenant } = await this.prisma.$transaction(async (tx) => {
            const tenant = await tx.tenant.create({
                data: {
                    name: tenantName,
                    slug: tenantSlug,
                    ownerName: name,
                    ownerPhone: phone,
                    ownerEmail: email,
                    planType: 'FREE',
                    planStatus: 'TRIAL',
                    trialEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                    maxProducts: 100,
                    maxUsers: 3,
                    maxBranches: 1,
                    settings: { currency: 'RIAL', vatPercent: 9 },
                },
            });
            const branch = await tx.branch.create({
                data: { tenantId: tenant.id, name: 'شعبه مرکزی', code: 'HQ', isDefault: true },
            });
            await tx.warehouse.create({
                data: { tenantId: tenant.id, branchId: branch.id, name: 'انبار اصلی', code: 'MAIN', isDefault: true },
            });
            const user = await tx.user.create({
                data: { tenantId: tenant.id, name, phone, email, passwordHash, role: 'TENANT_ADMIN', defaultBranchId: branch.id },
            });
            return { user, tenant };
        });

        return { ...this.issueTokens(user), user: await this.publicUser({ ...user, tenant }) };
    }

    async refreshToken(refreshToken: string) {
        if (!refreshToken) throw new UnauthorizedException('توکن نامعتبر است');
        let payload: { sub: string };
        try {
            payload = this.jwtService.verify(refreshToken, {
                secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
            });
        } catch {
            throw new UnauthorizedException('نشست منقضی شده است، دوباره وارد شوید');
        }

        const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: { tenant: true } });
        if (!user || !user.isActive || !user.tenant.isActive) {
            throw new UnauthorizedException('حساب کاربری غیرفعال است');
        }
        return this.issueTokens(user);
    }

    async me(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { tenant: true, customRole: { select: { name: true, permissions: true } } } });
        if (!user) throw new UnauthorizedException();
        return this.publicUser(user);
    }

    async changePassword(userId: string, dto: ChangePasswordDto) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new UnauthorizedException();
        if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
            throw new BadRequestException('رمز عبور فعلی اشتباه است');
        }
        await this.prisma.user.update({
            where: { id: userId },
            data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) },
        });
        return { changed: true };
    }
}
