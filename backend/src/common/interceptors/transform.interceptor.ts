import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Prisma } from '@prisma/client';

export interface ResponseFormat<T> {
    success: boolean;
    data: T;
    meta?: unknown;
    timestamp: string;
}

/** Decimal های Prisma را به عدد تبدیل می‌کند (به‌جای رشته) */
function serialize(value: any): any {
    if (value === null || value === undefined) return value;
    if (Prisma.Decimal.isDecimal(value)) return value.toNumber();
    if (value instanceof Date) return value;
    if (Array.isArray(value)) return value.map(serialize);
    if (typeof value === 'object') {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
        return out;
    }
    return value;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ResponseFormat<T>> {
    intercept(_context: ExecutionContext, next: CallHandler): Observable<ResponseFormat<T>> {
        return next.handle().pipe(
            map((raw) => {
                const timestamp = new Date().toISOString();
                const data = serialize(raw);
                // پاسخ‌های صفحه‌بندی‌شده: { data, meta } → meta در سطح بالا
                if (data && typeof data === 'object' && !Array.isArray(data) && 'data' in data && 'meta' in data) {
                    return { success: true, data: data.data, meta: data.meta, timestamp };
                }
                return { success: true, data, timestamp };
            }),
        );
    }
}
