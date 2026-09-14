import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { RUN_START_FILE } from './global-setup';

// Playwright test koşusu (pass/fail fark etmez) BİTTİKTEN SONRA bir kez
// çalışır — bu koşu boyunca gerçek POST /tenants/signup ile oluşturulan
// tenant'ları (bkz. onboarding-help/web-onboarding-help/feedback-submit/
// whatsapp-fiyat-price-discount/reports-monthly-legacy-payload.spec.ts'teki
// signupAsStarterPatron() helper'ları) temizler — apps/api/src/scripts/
// cleanup-playwright-tenants.ts'i, bu koşunun başlangıç zamanını (global-
// setup.ts'in yazdığı dosya) --since olarak geçirerek çağırır.
//
// Prisma/DB erişimi BİLEREK apps/web'e eklenmedi (pnpm strict izolasyon,
// @prisma/client apps/web'den resolve edilemiyor) — bunun yerine zaten
// dotenv+PrismaClient kurulu olan apps/api'deki script child-process olarak
// çalıştırılıyor.
//
// Temizlik BAŞARISIZ olursa bile test SONUCUNU etkilemez (try/catch, yalnızca
// uyarı logu) — bu, CI'da (her koşu zaten taze bir DB kullanıyor, script
// zararsız ama gerekli de değil) job'u kırmamak için önemli.
export default function globalTeardown() {
  let since: string;
  try {
    const raw = fs.readFileSync(RUN_START_FILE, 'utf-8');
    since = JSON.parse(raw).startedAt;
  } catch (err) {
    console.warn('⚠️  [global-teardown] Koşu başlangıç zamanı okunamadı, temizlik atlanıyor:', err);
    return;
  }

  const repoRoot = path.resolve(__dirname, '../../..');

  try {
    execFileSync(
      'pnpm',
      ['--filter', 'api', 'exec', 'ts-node', 'src/scripts/cleanup-playwright-tenants.ts', `--since=${since}`],
      { cwd: repoRoot, stdio: 'inherit' },
    );
  } catch (err) {
    console.warn('⚠️  [global-teardown] cleanup-playwright-tenants.ts başarısız (test sonucunu etkilemez):', err);
  } finally {
    try {
      fs.unlinkSync(RUN_START_FILE);
    } catch {
      // Dosya zaten yoksa/silinmişse önemli değil.
    }
  }
}
