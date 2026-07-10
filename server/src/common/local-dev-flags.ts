import { ConfigService } from '@nestjs/config';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function isTrueEnv(config: ConfigService, key: string): boolean {
  const raw = config.get<string>(key);
  if (!raw) return false;
  return TRUE_VALUES.has(raw.trim().toLowerCase());
}

export function isLocalQuotaApisDisabled(config: ConfigService): boolean {
  return isTrueEnv(config, 'LOCAL_DISABLE_QUOTA_APIS');
}
