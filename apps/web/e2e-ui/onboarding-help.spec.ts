/**
 * "Kullanım Asistanı" — isletme-app/* (tek şubeli PATRON) için ilk kullanım
 * turu (OnboardingTour) ve sürekli erişilebilir yardım butonu (HelpCenter).
 *
 * feedback-submit.spec.ts'teki gerekçenin AYNISI: PATRON login artık 2FA
 * gerektiriyor, bu yüzden gerçek bir oturum SIGNUP üzerinden elde ediliyor
 * (2FA'dan etkilenmiyor) — mock yok, gerçek backend'e karşı çalışır.
 */
import { test, expect, type Page } from '@playwright/test';

function uniqueSuffix(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function signupAsStarterPatron(page: Page): Promise<void> {
  const suffix = uniqueSuffix();

  await page.goto('/isletme-kaydi');
  await page.getByRole('button', { name: 'Tek Şubeli' }).click();

  await page.getByLabel('Firma Adı').fill(`E2E Onboarding Ltd ${suffix}`);
  await page.getByLabel('Vergi Numarası').fill(`OB${suffix}`);
  await page.getByLabel('Şube Adı').fill('Merkez');
  await page.getByLabel('Ad Soyad').fill('E2E Test Kullanıcı');
  await page.getByLabel('E-posta').fill(`e2e-onboarding-${suffix}@example.test`);
  await page.getByLabel('Şifre', { exact: true }).fill('Test1234');
  await page.getByLabel('Şifre Tekrar').fill('Test1234');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Kaydol' }).click();

  // dashboardFor(PATRON, STARTER, !isNative()) → /isletme/raporlar (web deneyimi).
  // IsletmeAppLayout'un guard'ı yalnızca role+plan kontrol ediyor, bu yüzden
  // masaüstü Chromium'dan doğrudan /isletme-app/* rotalarına gidilebiliyor.
  await expect(page).toHaveURL(/\/isletme\/raporlar/, { timeout: 10000 });
}

test.describe('İlk Kullanım Turu (Onboarding)', () => {
  test('ilk girişte tur gösterilir, "Atla" ile kapanır, tekrar girişte gösterilmez', async ({
    page,
  }) => {
    await signupAsStarterPatron(page);

    // Yeni hesap, hiç dashboard ziyareti yok → tur otomatik açılmalı.
    await page.goto('/isletme-app/dashboard');
    await expect(
      page.getByRole('heading', { name: 'StokPilot\'a Hoş Geldiniz' }),
    ).toBeVisible();

    // İleri ile bir sonraki adıma geçilebiliyor.
    await page.getByRole('button', { name: 'İleri' }).click();
    await expect(page.getByRole('heading', { name: 'Geçici Kasa' })).toBeVisible();

    // Atla → tur kapanır.
    await page.getByRole('button', { name: 'Atla' }).click();
    await expect(page.getByRole('heading', { name: 'Geçici Kasa' })).toHaveCount(0);

    // Dashboard'un kendisi hâlâ normal şekilde görünüyor (tur içeriği değil).
    await expect(page.getByRole('link', { name: 'Geçici Kasa' })).toBeVisible();

    // Sayfa yenilensin — flag localStorage'da kalıcı, tur BİR DAHA açılmamalı.
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'StokPilot\'a Hoş Geldiniz' }),
    ).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Geçici Kasa' })).toBeVisible();
  });

  test('son adımda "Başla" ile tur kapanır ve bir daha gösterilmez', async ({ page }) => {
    await signupAsStarterPatron(page);
    await page.goto('/isletme-app/dashboard');

    await expect(
      page.getByRole('heading', { name: 'StokPilot\'a Hoş Geldiniz' }),
    ).toBeVisible();

    // Son adıma kadar "İleri"ye bas (9 adım → 8 tıklama).
    const nextButton = page.getByRole('button', { name: 'İleri' });
    while (await nextButton.isVisible()) {
      await nextButton.click();
    }

    await expect(page.getByRole('heading', { name: 'Ayarlar' })).toBeVisible();
    await page.getByRole('button', { name: 'Başla' }).click();
    await expect(page.getByRole('heading', { name: 'Ayarlar' })).toHaveCount(0);

    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'StokPilot\'a Hoş Geldiniz' }),
    ).toHaveCount(0);
  });
});

test.describe('Yardım Butonu / SSS', () => {
  test('yardım butonu dashboard\'da görünür, tıklanınca SSS listesi açılır ve arama çalışır', async ({
    page,
  }) => {
    await signupAsStarterPatron(page);
    await page.goto('/isletme-app/dashboard');

    // Onboarding turu önce kapatılmalı (Atla) ki altındaki ekranla etkileşime girilebilsin.
    await page.getByRole('button', { name: 'Atla' }).click();

    const helpButton = page.getByRole('button', { name: 'Yardım' });
    await expect(helpButton).toBeVisible();
    await helpButton.click();

    await expect(page.getByRole('heading', { name: 'Yardım' })).toBeVisible();
    // Kategoriye göre gruplu SSS listesi — en az bir soru görünür.
    await expect(
      page.getByRole('button', { name: 'Geçici Kasa\'dan nasıl satış yaparım?' }),
    ).toBeVisible();

    // Soruya tıklayınca cevap açılır (accordion).
    await page.getByRole('button', { name: 'Geçici Kasa\'dan nasıl satış yaparım?' }).click();
    await expect(page.getByText(/Barkod okutarak ya da ürün arayarak/)).toBeVisible();

    // Arama: "şifre" → hesap/şifre ile ilgili soru görünür, alakasız bir soru kaybolur.
    await page.getByLabel('SSS içinde ara').fill('şifre');
    await expect(
      page.getByRole('button', { name: 'Şifremi nasıl değiştiririm?' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Bir faturayı nasıl tararım?' }),
    ).toHaveCount(0);

    // Sonuç bulunamayan bir arama → Geri Bildirim'e yönlendiren mesaj.
    await page.getByLabel('SSS içinde ara').fill('zzzzz-bulunamayacak-bir-arama-terimi');
    await expect(page.getByText('Aradığınızı bulamadınız mı?')).toBeVisible();
    const feedbackLink = page.getByRole('link', { name: 'Geri Bildirim Gönder' });
    await expect(feedbackLink).toBeVisible();

    await feedbackLink.click();
    await expect(page).toHaveURL(/\/isletme-app\/ayarlar\/geri-bildirim/);
    await expect(page.getByRole('heading', { name: 'Geri Bildirim' })).toBeVisible();
  });

  test('yardım butonu başka bir ekranda (Stok Sorgulama) da görünür', async ({ page }) => {
    await signupAsStarterPatron(page);

    // Dashboard'a hiç uğramadan doğrudan başka bir isletme-app ekranına git —
    // OnboardingTour yalnızca dashboard/page.tsx'te render edildiği için burada
    // hiç açılmaz, HelpCenter ise layout.tsx'te olduğu için her yerde görünür.
    await page.goto('/isletme-app/stok-sorgu');
    await expect(page.getByRole('heading', { name: 'Stok Sorgulama' })).toBeVisible();

    const helpButton = page.getByRole('button', { name: 'Yardım' });
    await expect(helpButton).toBeVisible();
    await helpButton.click();

    await expect(
      page.getByRole('button', { name: 'Bir ürünün stok miktarını nasıl öğrenirim?' }),
    ).toBeVisible();
  });
});
