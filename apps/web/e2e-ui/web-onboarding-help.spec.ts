/**
 * "Kullanım Asistanı" — Faz 2, isletme/* (tek şubeli/STARTER PATRON'un WEB
 * deneyimi: yalnızca Raporlar + Barkod Entegrasyonu) için ilk kullanım turu
 * (OnboardingTour) ve sürekli erişilebilir yardım butonu (HelpCenter).
 *
 * onboarding-help.spec.ts'in web karşılığı — AYNI bileşenler (OnboardingTour,
 * HelpCenter) burada farklı `steps`/`items`/`storageKey` prop'larıyla yeniden
 * kullanılıyor. feedback-submit.spec.ts'teki gerekçenin AYNISI: PATRON login
 * artık 2FA gerektiriyor, bu yüzden gerçek bir oturum SIGNUP üzerinden elde
 * ediliyor (2FA'dan etkilenmiyor) — mock yok, gerçek backend'e karşı çalışır.
 */
import { test, expect, type Page } from '@playwright/test';

function uniqueSuffix(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function signupAsStarterPatron(page: Page): Promise<void> {
  const suffix = uniqueSuffix();

  await page.goto('/isletme-kaydi');
  await page.getByRole('button', { name: 'Tek Şubeli' }).click();

  await page.getByLabel('Firma Adı').fill(`E2E Web Onboarding Ltd ${suffix}`);
  await page.getByLabel('Vergi Numarası').fill(`WOB${suffix}`);
  await page.getByLabel('Şube Adı').fill('Merkez');
  await page.getByLabel('Ad Soyad').fill('E2E Test Kullanıcı');
  await page.getByLabel('E-posta').fill(`e2e-web-onboarding-${suffix}@example.test`);
  await page.getByLabel('Şifre', { exact: true }).fill('Test1234');
  await page.getByLabel('Şifre Tekrar').fill('Test1234');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Kaydol' }).click();

  // dashboardFor(PATRON, STARTER, !isNative()) → /isletme/raporlar (web deneyimi).
  await expect(page).toHaveURL(/\/isletme\/raporlar/, { timeout: 10000 });
}

test.describe('Web İlk Kullanım Turu (Onboarding)', () => {
  test('ilk girişte tur gösterilir, "Atla" ile kapanır, tekrar girişte gösterilmez', async ({
    page,
  }) => {
    await signupAsStarterPatron(page);

    // Yeni hesap, hiç /isletme/raporlar ziyareti yok → tur otomatik açılmalı.
    await expect(
      page.getByRole('heading', { name: 'StokPilot Web\'e Hoş Geldiniz' }),
    ).toBeVisible();

    // İleri ile bir sonraki adıma geçilebiliyor.
    await page.getByRole('button', { name: 'İleri' }).click();
    await expect(page.getByRole('heading', { name: 'Raporlar' })).toBeVisible();

    // Atla → tur kapanır.
    await page.getByRole('button', { name: 'Atla' }).click();
    await expect(page.getByRole('heading', { name: 'Raporlar' })).toHaveCount(0);

    // Sayfa yenilensin — flag localStorage'da kalıcı, tur BİR DAHA açılmamalı.
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'StokPilot Web\'e Hoş Geldiniz' }),
    ).toHaveCount(0);
  });

  test('son adımda "Başla" ile tur kapanır ve mobil onboarding flag\'inden bağımsızdır', async ({
    page,
  }) => {
    await signupAsStarterPatron(page);

    await expect(
      page.getByRole('heading', { name: 'StokPilot Web\'e Hoş Geldiniz' }),
    ).toBeVisible();

    // Son adıma kadar "İleri"ye bas (3 adım → 2 tıklama).
    const nextButton = page.getByRole('button', { name: 'İleri' });
    while (await nextButton.isVisible()) {
      await nextButton.click();
    }

    await expect(page.getByRole('heading', { name: 'Barkod Entegrasyonu' })).toBeVisible();
    await page.getByRole('button', { name: 'Başla' }).click();
    await expect(page.getByRole('heading', { name: 'Barkod Entegrasyonu' })).toHaveCount(0);

    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'StokPilot Web\'e Hoş Geldiniz' }),
    ).toHaveCount(0);

    // Web turu görüldü ama mobil turu ayrı bir key kullanıyor — birbirinden
    // bağımsız olduklarını doğrudan localStorage'dan doğrula.
    const flags = await page.evaluate(() => ({
      web: localStorage.getItem('stokpilot_web_onboarding_seen'),
      mobile: localStorage.getItem('stokpilot_onboarding_seen'),
    }));
    expect(flags.web).toBe('true');
    expect(flags.mobile).toBeNull();
  });
});

test.describe('Web Yardım Butonu / SSS', () => {
  test('yardım butonu Raporlar\'da görünür, SSS açılır, arama çalışır, "bulunamadı" mobile yönlendirir (link olmadan)', async ({
    page,
  }) => {
    await signupAsStarterPatron(page);

    // Onboarding turu önce kapatılmalı (Atla) ki altındaki ekranla etkileşime girilebilsin.
    await page.getByRole('button', { name: 'Atla' }).click();

    const helpButton = page.getByRole('button', { name: 'Yardım' });
    await expect(helpButton).toBeVisible();
    await helpButton.click();

    await expect(page.getByRole('heading', { name: 'Yardım' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Raporlar sayfasında ne görebilirim?' }),
    ).toBeVisible();

    // Soruya tıklayınca cevap açılır (accordion).
    await page.getByRole('button', { name: 'Raporlar sayfasında ne görebilirim?' }).click();
    await expect(page.getByText(/günlük ve aylık raporlarının listesini/)).toBeVisible();

    // Arama: "kurulum" → Barkod Entegrasyonu soruları görünür, Raporlar'a özel soru kaybolur.
    await page.getByLabel('SSS içinde ara').fill('kurulum');
    await expect(
      page.getByRole('button', { name: 'Kurulum kodu ne işe yarar, nasıl kullanılır?' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Raporlar sayfasında ne görebilirim?' }),
    ).toHaveCount(0);

    // Mobildeki 19 maddelik SSS burada YOK — web'e özel içerik kullanılıyor.
    await page.getByLabel('SSS içinde ara').fill('Geçici Kasa');
    await expect(
      page.getByRole('button', { name: /Geçici Kasa/ }),
    ).toHaveCount(0);

    // Sonuç bulunamayan bir arama → web'de Geri Bildirim formu OLMADIĞI için
    // mobil uygulamaya yönlendiren düz metin, TIKLANABİLİR bir link değil.
    await page.getByLabel('SSS içinde ara').fill('zzzzz-bulunamayacak-bir-arama-terimi');
    await expect(
      page.getByText(/mobil uygulamadaki Ayarlar > Geri Bildirim ekranını kullanabilirsiniz/),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Geri Bildirim Gönder' })).toHaveCount(0);
  });

  test('yardım butonu Barkod Entegrasyonu sayfasında da görünür (ortak layout)', async ({
    page,
  }) => {
    await signupAsStarterPatron(page);
    await page.getByRole('button', { name: 'Atla' }).click();

    await page.goto('/isletme/entegrasyon');
    await expect(page.getByRole('heading', { name: 'Barkod Entegrasyonu' })).toBeVisible();

    // isletme/entegrasyon'a doğrudan gidildiğinde onboarding turu tekrar AÇILMAMALI
    // — tur yalnızca isletme/raporlar'da render edilir ve flag zaten görüldü.
    await expect(
      page.getByRole('heading', { name: 'StokPilot Web\'e Hoş Geldiniz' }),
    ).toHaveCount(0);

    const helpButton = page.getByRole('button', { name: 'Yardım' });
    await expect(helpButton).toBeVisible();
    await helpButton.click();

    await expect(
      page.getByRole('button', { name: 'Kurulum kodu ne işe yarar, nasıl kullanılır?' }),
    ).toBeVisible();
  });
});
