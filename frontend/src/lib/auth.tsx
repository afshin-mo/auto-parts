import { createContext, ReactNode, useContext, useEffect, useState, useCallback } from 'react';
import { api, ApiError, tokens, setUnauthorizedHandler } from './api';
import { ALL_BRANCHES, getBranchId, setBranchId } from './branch';

export interface BranchInfo { id: string; name: string; code: string; isDefault?: boolean }
export interface User {
  id: string; name: string; phone: string; email?: string; role: string; roleName?: string | null; tenantId: string; tenantName: string; tenantSlug: string; planType: string; planStatus: string;
  permissions: string[]; branches: BranchInfo[]; allBranches: boolean; defaultBranchId: string | null;
}
interface AuthCtx {
  user: User | null; loading: boolean; login: (p: string, pw: string) => Promise<void>; register: (b: unknown) => Promise<void>; logout: () => void;
  /** آیا کاربر دست‌کم یکی از این مجوزها را دارد؟ */
  has: (...perms: string[]) => boolean; refreshUser: () => Promise<void>;
  /** شعبه‌ی فعال: شناسه‌ی شعبه یا 'all' (همه‌ی شعبه‌های مجاز، فقط مشاهده) */
  branchId: string | null; branch: BranchInfo | null; setBranch: (id: string) => void;
}
const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

/** آخرین کاربر شناخته‌شده؛ وقتی سرور در دسترس نیست (آفلاین) به‌جای خروج از حساب از همین استفاده می‌شود */
const LAST_USER = 'lastUser';
const saveLastUser = (u: User) => { try { localStorage.setItem(LAST_USER, JSON.stringify(u)); } catch { /* ignore */ } };
function readLastUser(): User | null {
  try { const u = JSON.parse(localStorage.getItem(LAST_USER) ?? 'null') as User | null; return u?.id && Array.isArray(u.branches) && Array.isArray(u.permissions) ? u : null; } catch { return null; }
}

/** شعبه‌ی ذخیره‌شده اگر برای این کاربر مجاز نبود، به شعبه‌ی پیش‌فرض برمی‌گردد */
function validBranch(u: User): string | null {
  const stored = getBranchId();
  if (stored === ALL_BRANCHES && u.branches.length > 1) return stored;
  if (stored && u.branches.some((b) => b.id === stored)) return stored;
  return u.defaultBranchId ?? u.branches[0]?.id ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [branchId, setBranchState] = useState<string | null>(getBranchId());
  const [loading, setLoading] = useState(!!tokens.access);

  const adopt = useCallback((u: User | null) => {
    setUser(u);
    if (u) { saveLastUser(u); const b = validBranch(u); setBranchId(b); setBranchState(b); }
  }, []);
  const logout = useCallback(() => { tokens.clear(); setBranchId(null); setUser(null); }, []);
  const refreshUser = useCallback(async () => { adopt((await api.get<User>('/auth/me')).data); }, [adopt]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokens.access) return;
    api.get<User>('/auth/me').then((r) => adopt(r.data)).catch((e) => {
      // قطع شبکه یا خطای سرور ≠ نامعتبر بودن نشست؛ با آخرین کاربر شناخته‌شده ادامه می‌دهیم (۴۰۱ را لایه‌ی API خودش خروج می‌دهد)
      const cached = e instanceof ApiError && (e.status === 0 || e.status >= 500) ? readLastUser() : null;
      if (cached) adopt(cached); else tokens.clear();
    }).finally(() => setLoading(false));
  }, [logout, adopt]);

  const accept = (d: { accessToken: string; refreshToken: string; user: User }) => { tokens.set(d.accessToken, d.refreshToken); adopt(d.user); };
  const value: AuthCtx = {
    user, loading, logout, refreshUser, branchId,
    branch: user?.branches.find((b) => b.id === branchId) ?? null,
    // با عوض شدن شعبه همه‌ی داده‌ها باید دوباره از سرور بیایند؛ بارگذاری مجدد ساده‌ترین راه مطمئن است
    setBranch: (id) => { setBranchId(id); window.location.reload(); },
    login: async (p, pw) => accept((await api.login(p, pw)).data),
    register: async (b) => accept((await api.register(b)).data),
    has: (...perms) => !!user && (user.role === 'SUPER_ADMIN' || user.permissions.includes('*') || perms.length === 0 || perms.some((p) => user.permissions.includes(p))),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
