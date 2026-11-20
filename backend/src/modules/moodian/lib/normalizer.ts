/**
 * نرمال‌سازی داده برای امضا (طبق سند سازمان): آرایه/شیء تخت می‌شود (کلیدها با نقطه)، کلیدها مرتب می‌شوند،
 * مقدارها با # به هم می‌چسبند؛ مقدار خالی = # ، خود # در مقدار = ##
 */
export function flatten(value: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
    if (value !== null && typeof value === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            const key = prefix ? `${prefix}.${k}` : k;
            if (v !== null && typeof v === 'object') flatten(v, key, out);
            else out[key] = v;
        }
    }
    return out;
}

export function normalize(data: Record<string, unknown> | unknown[]): string {
    const flat = flatten(data);
    return Object.keys(flat)
        .sort() // ترتیب بایتی رشته‌ها، مثل ksort در پیاده‌سازی مرجع
        .map((k) => {
            const v = flat[k];
            if (typeof v === 'boolean') return v ? 'true' : 'false';
            if (v === '' || v === null || v === undefined) return '#';
            return String(v).replace(/#/g, '##');
        })
        .join('#');
}
