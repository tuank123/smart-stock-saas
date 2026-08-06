import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as dotenv from 'dotenv';

const ENV_PATH = path.resolve(__dirname, '..', '.env');
const AGENT_VERSION = '0.1.0';

// Kurulum, mevcut kimlik bilgilerine ihtiyaç duymaz → config.ts import EDİLMEZ.
dotenv.config({ path: ENV_PATH });
const API_URL = process.env.STOKPILOT_API_URL ?? 'http://localhost:3000/api/v1';

// .env içinde KEY=value satırını günceller; yoksa sonuna ekler.
function upsertEnv(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) {
    return content.replace(re, line);
  }
  const sep = content.length === 0 || content.endsWith('\n') ? '' : '\n';
  return `${content}${sep}${line}\n`;
}

async function main() {
  const token = process.argv[2];
  if (!token) {
    console.error('❌ Kurulum kodu gerekli.  Kullanım: ts-node src/setup.ts <KURULUM_KODU>');
    process.exit(1);
  }

  console.log(`🔌 StokPilot'a bağlanılıyor: ${API_URL}`);

  let agentId: string;
  let apiKey: string;
  try {
    const res = await axios.post(`${API_URL}/branches/agent-connect`, {
      token: token.trim(),
      agentVersion: AGENT_VERSION,
    });
    agentId = res.data?.agentId;
    apiKey = res.data?.apiKey;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const msg = err.response?.data?.message ?? err.message;
      console.error(`❌ Bağlantı başarısız: ${Array.isArray(msg) ? msg.join(', ') : msg}`);
    } else {
      console.error('❌ Beklenmeyen hata:', err);
    }
    process.exit(1);
  }

  if (!agentId || !apiKey) {
    console.error('❌ Sunucu agentId/apiKey döndürmedi. Kurulum kodu geçersiz olabilir.');
    process.exit(1);
  }

  // .env dosyasını oku (yoksa boş başla) ve kimlik bilgilerini yaz.
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  content = upsertEnv(content, 'STOKPILOT_API_URL', API_URL);
  content = upsertEnv(content, 'AGENT_ID', agentId);
  content = upsertEnv(content, 'AGENT_API_KEY', apiKey);
  if (!/^POLLING_INTERVAL_SEC=/m.test(content)) {
    content = upsertEnv(content, 'POLLING_INTERVAL_SEC', '10');
  }
  fs.writeFileSync(ENV_PATH, content, 'utf8');

  console.log('✅ Kurulum tamamlandı. Kimlik bilgileri .env dosyasına yazıldı.');
  console.log(`   AGENT_ID = ${agentId}`);
  console.log('   AGENT_API_KEY = (gizli, .env dosyasına kaydedildi)');
  console.log('   Artık `pnpm dev` ile Agent başlatılabilir.');
}

main();
