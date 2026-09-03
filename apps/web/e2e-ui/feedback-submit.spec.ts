/**
 * Kullanıcı tarafı — Geri Bildirim formu (isletme-app/ayarlar/geri-bildirim).
 *
 * PATRON login artık e-posta 2FA gerektiriyor (bkz. auth-2fa-screen.spec.ts),
 * bu yüzden LOGIN formu üzerinden gerçek bir token elde edilemiyor. Signup
 * (POST /tenants/signup) ise 2FA'DAN ETKİLENMİYOR — issueTokens()'ı doğrudan
 * çağırıyor (bkz. auth.service.ts) — bu yüzden gerçek, backend'in kabul
 * ettiği bir PATRON+STARTER oturumu elde etmenin en basit yolu taze bir
 * işletme kaydı oluşturmak. Form gönderimi GERÇEK backend'e karşı çalışır
 * (mock yok) — asıl iddia budur: POST /feedback gerçekten 201 dönüyor.
 *
 * IsletmeAppLayout guard'ı yalnızca role==='PATRON' && planId==='STARTER'
 * kontrol ediyor, isNative() değil — bu yüzden masaüstü Chromium'da
 * /isletme-app/* rotalarına doğrudan gidilebiliyor (bkz. layout.tsx).
 */
import { test, expect } from '@playwright/test';

function uniqueSuffix(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

test('STARTER PATRON — Geri Bildirim formunu gönderebilir, başarı mesajı görünür', async ({
  page,
}) => {
  const suffix = uniqueSuffix();

  // ── Signup (2FA'sız, gerçek backend) ────────────────────────────────────
  await page.goto('/isletme-kaydi');
  await page.getByRole('button', { name: 'Tek Şubeli' }).click();

  await page.getByLabel('Firma Adı').fill(`E2E Feedback Ltd ${suffix}`);
  await page.getByLabel('Vergi Numarası').fill(`FB${suffix}`);
  await page.getByLabel('Şube Adı').fill('Merkez');
  await page.getByLabel('Ad Soyad').fill('E2E Test Kullanıcı');
  await page.getByLabel('E-posta').fill(`e2e-feedback-${suffix}@example.test`);
  await page.getByLabel('Şifre', { exact: true }).fill('Test1234');
  await page.getByLabel('Şifre Tekrar').fill('Test1234');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Kaydol' }).click();

  // Signup başarılı → dashboardFor(PATRON, STARTER, !isNative()) → /isletme/raporlar
  // (auth-navigation.spec.ts'teki PATRON yönlendirme testiyle aynı hedef).
  await expect(page).toHaveURL(/\/isletme\/raporlar/, { timeout: 10000 });

  // ── Geri Bildirim formu ──────────────────────────────────────────────────
  await page.goto('/isletme-app/ayarlar/geri-bildirim');
  await expect(page.getByRole('heading', { name: 'Geri Bildirim' })).toBeVisible();

  await page.getByLabel('Konu').fill('Rapor ekranı yavaş açılıyor');
  await page
    .getByLabel('Mesaj')
    .fill('Günlük rapor sayfası açılırken 5 saniyeden fazla sürüyor, kontrol edebilir misiniz?');
  await page.getByRole('button', { name: 'Gönder' }).click();

  await expect(page.getByText('Geri bildiriminiz için teşekkürler')).toBeVisible({
    timeout: 5000,
  });

  // Form temizlendi.
  await expect(page.getByLabel('Konu')).toHaveValue('');
  await expect(page.getByLabel('Mesaj')).toHaveValue('');
});
