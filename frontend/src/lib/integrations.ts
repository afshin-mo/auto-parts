import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';

export interface SmsSettings { provider: 'kavenegar' | 'smsir' | 'log'; sender: string; enabled: boolean; hasApiKey: boolean; encryptionConfigured: boolean }
export interface GatewaySettings { provider: 'zarinpal'; sandbox: boolean; enabled: boolean; hasMerchantId: boolean; callbackUrl: string; encryptionConfigured: boolean }

export function useSmsSettings() {
  const { has } = useAuth();
  return useQuery({ queryKey: ['sms-settings'], enabled: has('sms.use'), queryFn: async () => (await api.get<SmsSettings>('/sms/settings')).data });
}
export function useGatewaySettings() {
  const { has } = useAuth();
  return useQuery({ queryKey: ['gateway-settings'], enabled: has('gateway.use'), queryFn: async () => (await api.get<GatewaySettings>('/online-payments/settings')).data });
}
