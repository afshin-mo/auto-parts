import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../database/prisma/prisma.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** هر کلیدی که شبیه رمز، توکن، کلید خصوصی/API یا مرچنت‌کد باشد در گزارش فعالیت ذخیره نمی‌شود */
export const SENSITIVE = /password|token|secret|private|api[-_]?key|merchant|authorization/i;

export function scrub(body: any): any {
    if (!body || typeof body !== 'object') return body;
    if (Array.isArray(body)) return body.map(scrub);
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(body)) out[k] = SENSITIVE.test(k) ? '***' : scrub(v);
    return out;
}

/** ثبت خودکار تمام عملیات نوشتنی کاربران در AuditLog */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
    private readonly logger = new Logger(AuditInterceptor.name);

    constructor(private prisma: PrismaService) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const req = context.switchToHttp().getRequest();
        if (!MUTATING.has(req.method) || !req.user) return next.handle();

        return next.handle().pipe(
            tap(() => {
                const segments = String(req.route?.path ?? req.path).split('/').filter(Boolean);
                const entityType = segments.find((s) => !s.startsWith(':') && s !== 'api' && !/^v\d+$/.test(s)) ?? 'unknown';
                this.prisma.auditLog
                    .create({
                        data: {
                            tenantId: req.user.tenantId,
                            userId: req.user.id,
                            action: `${req.method} ${req.route?.path ?? req.path}`.slice(0, 100),
                            entityType: entityType.slice(0, 100),
                            entityId: req.params?.id,
                            newValues: scrub(req.body) ?? undefined,
                            ipAddress: req.ip,
                            userAgent: req.headers['user-agent'],
                        },
                    })
                    .catch((e) => this.logger.warn(`audit log failed: ${e.message}`));
            }),
        );
    }
}
