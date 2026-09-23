import { EnvValidator, loadEnv } from './env';

loadEnv();

const v = new EnvValidator();

// AGENT_ID ve AGENT_API_KEY'i sunucu üretir (branches.service.ts:195-197):
//   agentId = randomUUID()                     → UUID v4
//   apiKey  = randomBytes(32).toString('hex')  → 64 karakter hex
// Biçim kontrolü, yarım kopyalanmış/kırpılmış bir değeri ilk 401'i beklemeden
// burada yakalar.
const AGENT_ID = v.requirePattern(
  'AGENT_ID',
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  'UUID',
);

const AGENT_API_KEY = v.requirePattern(
  'AGENT_API_KEY',
  /^[0-9a-fA-F]{64}$/,
  '64 karakterlik hex',
);

const STOKPILOT_API_URL = v.requireUrl('STOKPILOT_API_URL', 'http://localhost:3000/api/v1');

const POLLING_INTERVAL_SEC = v.optionalPositiveNumber('POLLING_INTERVAL_SEC', 10);

v.assertValid('Kurulum için:  pnpm setup <KURULUM_KODU>');

export const config = {
  STOKPILOT_API_URL,
  AGENT_ID,
  AGENT_API_KEY,
  POLLING_INTERVAL_SEC,
};
