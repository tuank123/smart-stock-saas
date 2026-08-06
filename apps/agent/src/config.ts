import * as path from 'path';
import * as dotenv from 'dotenv';

// apps/agent/.env dosyasını yükle (çalışma dizininden bağımsız).
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const STOKPILOT_API_URL =
  process.env.STOKPILOT_API_URL ?? 'http://localhost:3000/api/v1';
const AGENT_ID = process.env.AGENT_ID ?? '';
const AGENT_API_KEY = process.env.AGENT_API_KEY ?? '';
const POLLING_INTERVAL_SEC = Number(process.env.POLLING_INTERVAL_SEC ?? '10');

// Kimlik bilgileri yoksa: önce `pnpm setup <KURULUM_KODU>` çalıştırılmalı.
if (!AGENT_ID || !AGENT_API_KEY) {
  console.error(
    '❌ AGENT_ID ve AGENT_API_KEY .env dosyasında tanımlı olmalı.\n' +
      '   Önce kurulum yapın:  ts-node src/setup.ts <KURULUM_KODU>',
  );
  process.exit(1);
}

export const config = {
  STOKPILOT_API_URL,
  AGENT_ID,
  AGENT_API_KEY,
  POLLING_INTERVAL_SEC:
    Number.isFinite(POLLING_INTERVAL_SEC) && POLLING_INTERVAL_SEC > 0
      ? POLLING_INTERVAL_SEC
      : 10,
};
