import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';

export interface MoodianSettings {
  environment: 'sandbox' | 'production'; memoryId: string; economicCode: string; enabled: boolean; hasPrivateKey: boolean; hasServerKey: boolean; serverKeyId: string;
  unitCodes: Record<string, string>; ready: boolean; lastError: string | null; lastSyncAt: string | null; encryptionConfigured: boolean;
  counts: { notSent: number; pending: number; success: number; failed: number };
}

export const TAX_STATUS: Record<string, { label: string; tone: string }> = {
  NOT_SENT: { label: 'ارسال‌نشده', tone: 'gray' }, PENDING: { label: 'در انتظار تأیید', tone: 'amber' },
  SUCCESS: { label: 'ثبت‌شده در مودیان', tone: 'green' }, FAILED: { label: 'رد شد', tone: 'red' },
};

/** تنظیمات مودیان (فقط برای نقش‌هایی که اجازه دارند)؛ برای سایرین undefined */
export function useMoodian() {
  const { has } = useAuth();
  const allowed = has('moodian.use');
  return useQuery({ queryKey: ['moodian-settings'], enabled: allowed, queryFn: async () => (await api.get<MoodianSettings>('/moodian/settings')).data });
}
