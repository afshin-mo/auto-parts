/** شعبه‌ی فعال کاربر (در مرورگر ذخیره می‌شود؛ سرور هر بار آن را با دسترسی کاربر تطبیق می‌دهد) */
const KEY = 'branchId';
export const ALL_BRANCHES = 'all';
export const getBranchId = (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const setBranchId = (id: string | null) => { try { id ? localStorage.setItem(KEY, id) : localStorage.removeItem(KEY); } catch { /* ignore */ } };
