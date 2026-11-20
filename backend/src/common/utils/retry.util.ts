import { Prisma } from '@prisma/client';

/** وقتی دو درخواست هم‌زمان یک شماره فاکتور بگیرند، یکی خطای یکتایی می‌خورد؛ دوباره تلاش می‌کنیم */
export async function retryOnUnique<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
    for (let i = 1; ; i++) {
        try {
            return await fn();
        } catch (e) {
            const unique = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
            if (!unique || i >= attempts) throw e;
        }
    }
}
