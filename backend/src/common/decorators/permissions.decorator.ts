import { SetMetadata } from '@nestjs/common';

export const PERMS_KEY = 'permissions';

/** دسترسی به مسیر، اگر کاربر «دست‌کم یکی» از مجوزهای داده‌شده را داشته باشد */
export const Perm = (...keys: string[]) => SetMetadata(PERMS_KEY, keys);
