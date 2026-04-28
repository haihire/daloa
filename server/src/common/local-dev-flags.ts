import { ConfigService } from '@nestjs/config';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export function isLocalQuotaApisDisabled(config: ConfigService): boolean {
  const raw = config.get<string>('LOCAL_DISABLE_QUOTA_APIS');
  if (!raw) return false;
  return TRUE_VALUES.has(raw.trim().toLowerCase());
}
