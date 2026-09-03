/**
 * PATRON/SUPER_ADMIN e-posta 2FA ekranının (TwoFaCodeForm) DAVRANIŞ testleri.
 *
 * auth-navigation.spec.ts'teki "PATRON girişi 2FA ekranını gösteriyor" testi
 * GERÇEK backend'e karşı çalışıp requires2fa/tempToken'ın gerçekten
 * döndüğünü kanıtlıyor — ama bu ortamda e-posta mock modda gönderildiği
 * (EMAIL_ENABLED=false) için gerçek 6 haneli kodu Playwright'tan okumanın
 * bilinen bir yolu yok (yalnızca backend loglarına/Redis'e yazılıyor).
 *
 * Bu dosya bunun yerine ekranın backend YANITLARINA doğru tepki verdiğini
 * (başarı/yanlış kod/süresi dolmuş tempToken) `page.route()` ile HEM
 * /auth/login HEM /auth/verify-2fa ağ isteklerini mock'layarak test ediyor.
 * Bilerek: gerçek backend'e HİÇ istek gitmiyor, bu yüzden auth-navigation
 * .spec.ts'in paylaştığı /auth/login IP rate-limit bütçesine (5/15dk)
 * DOKUNMUYOR — dört test de aynı çalıştırmada güvenle bir arada durabiliyor.
 * verify-2fa'nın gerçek kodla uçtan uca çalıştığı zaten hem
 * apps/api/test/auth-2fa.e2e-spec.ts'te hem auth-navigation.spec.ts'te
 * (dolaylı olarak, ekranın göründüğü noktaya kadar) kanıtlanıyor.
 */
import { test, expect, type Page, type Route } from '@playwright/test';

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre').fill(password);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
}

/** /auth/login'i her zaman requires2fa+tempToken döndürecek şekilde mock'lar. */
async function mockLoginRequires2fa(page: Page) {
  await page.route('**/auth/login', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        statusCode: 200,
        message: 'Doğrulama kodu e-posta adresinize gönderildi',
        data: { requires2fa: true, tempToken: 'e2e-mock-temp-token' },
      }),
    }),
  );
}

async function mockVerifyTwoFaSuccess(page: Page) {
  await page.route('**/auth/verify-2fa', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        statusCode: 200,
        message: 'Login successful',
        data: {
          accessToken: 'e2e-mock-access-token',
          user: {
            id: 'e2e-mock-user-id',
            email: 'admin@acme.com',
            role: 'PATRON',
            tenantId: 'e2e-mock-tenant-id',
            branchId: null,
            planId: 'STARTER',
          },
        },
      }),
    }),
  );
}

async function mockVerifyTwoFaError(page: Page, message: string) {
  await page.route('**/auth/verify-2fa', (route: Route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: 401, message, error: 'Unauthorized' }),
    }),
  );
}

test.describe('Login — 2FA ekranı (mock ağ yanıtlarıyla)', () => {
  test('doğru kod → tam token, dashboard\'a yönlendirilir (dashboardFor: PATRON+STARTER → /isletme/raporlar)', async ({
    page,
  }) => {
    await mockLoginRequires2fa(page);
    await mockVerifyTwoFaSuccess(page);

    await login(page, 'admin@acme.com', 'Admin123!');
    await expect(page.getByRole('heading', { name: 'Doğrulama Kodu' })).toBeVisible();

    await page.getByLabel('Doğrulama Kodu').fill('123456');
    await page.getByRole('button', { name: 'Doğrula' }).click();

    await expect(page).toHaveURL(/\/isletme\/raporlar/);
    // isletme/layout.tsx yalnızca allowed=true iken (gerçek bir authenticated
    // state) <Header/>'ı render eder.
    await expect(page.getByTitle('Çıkış yap')).toBeVisible();

    // Token gerçekten localStorage'a yazıldı (setAuth çalıştı).
    const stored = await page.evaluate(() => localStorage.getItem('stokpilot_access_token'));
    expect(stored).toBe('e2e-mock-access-token');
  });

  test('yanlış kod → net bir hata mesajı gösterilir, input temizlenir, ekranda kalınır', async ({
    page,
  }) => {
    await mockLoginRequires2fa(page);
    await mockVerifyTwoFaError(page, 'Kod hatalı veya süresi dolmuş');

    await login(page, 'admin@acme.com', 'Admin123!');
    await expect(page.getByRole('heading', { name: 'Doğrulama Kodu' })).toBeVisible();

    const codeInput = page.getByLabel('Doğrulama Kodu');
    await codeInput.fill('000000');
    await page.getByRole('button', { name: 'Doğrula' }).click();

    await expect(page.getByText('Kod hatalı veya süresi dolmuş')).toBeVisible();
    await expect(codeInput).toHaveValue('');
    // Dashboard'a da login'e de atılmadı — hâlâ 2FA ekranındayız.
    await expect(page.getByRole('heading', { name: 'Doğrulama Kodu' })).toBeVisible();
    await expect(page).not.toHaveURL(/\/isletme\/raporlar/);
  });

  test('tempToken süresi dolmuş/geçersizse login ekranına geri döner ve mesaj gösterilir', async ({
    page,
  }) => {
    await mockLoginRequires2fa(page);
    // auth.service.ts:verifyTwoFa — jwtService.verifyAsync reddederse bu mesaj.
    await mockVerifyTwoFaError(page, 'Geçersiz veya süresi dolmuş doğrulama token\'ı');

    await login(page, 'admin@acme.com', 'Admin123!');
    await expect(page.getByRole('heading', { name: 'Doğrulama Kodu' })).toBeVisible();

    await page.getByLabel('Doğrulama Kodu').fill('123456');
    await page.getByRole('button', { name: 'Doğrula' }).click();

    // Kimlik bilgisi formuna geri dönüldü (2FA ekranı değil).
    await expect(page.getByRole('heading', { name: 'StokPilot Girişi' })).toBeVisible();
    await expect(page.getByText('Oturum süresi doldu. Lütfen tekrar giriş yapın.')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('deneme limiti aşılınca da login ekranına geri döner (mesajın kendisi "tekrar giriş yapın" diyor)', async ({
    page,
  }) => {
    await mockLoginRequires2fa(page);
    // auth.service.ts:verifyTwoFa — TWO_FA_MAX_ATTEMPTS aşılınca bu mesaj.
    await mockVerifyTwoFaError(page, 'Çok fazla hatalı deneme. Lütfen tekrar giriş yapın.');

    await login(page, 'admin@acme.com', 'Admin123!');
    await expect(page.getByRole('heading', { name: 'Doğrulama Kodu' })).toBeVisible();

    await page.getByLabel('Doğrulama Kodu').fill('123456');
    await page.getByRole('button', { name: 'Doğrula' }).click();

    await expect(page.getByRole('heading', { name: 'StokPilot Girişi' })).toBeVisible();
    await expect(page.getByText('Oturum süresi doldu. Lütfen tekrar giriş yapın.')).toBeVisible();
  });

  test('"giriş ekranına dönüp" bağlantısı manuel olarak da kimlik bilgisi formuna döner', async ({
    page,
  }) => {
    await mockLoginRequires2fa(page);

    await login(page, 'admin@acme.com', 'Admin123!');
    await expect(page.getByRole('heading', { name: 'Doğrulama Kodu' })).toBeVisible();

    await page.getByRole('button', { name: 'giriş ekranına dönüp' }).click();

    await expect(page.getByRole('heading', { name: 'StokPilot Girişi' })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
