/**
 * Admin tarafı — Geri Bildirimler ekranı (admin/feedback).
 *
 * SUPER_ADMIN login da PATRON gibi artık e-posta 2FA gerektiriyor (bkz.
 * auth.service.ts:TWO_FA_ROLES) ve gerçek bir SUPER_ADMIN hesabı UI'dan
 * (signup PATRON döner, admin panelinden kullanıcı oluşturma yok)
 * oluşturulamıyor — bu yüzden auth-2fa-screen.spec.ts'teki desenin AYNISI:
 * /auth/login + /auth/verify-2fa ağ seviyesinde mock'lanıyor. Admin
 * layout'un mount'ta çağırdığı diğer uçlar (errors/unresolved-count,
 * feedback/unread-count, stats) da mock'lanıyor — aksi halde sahte token
 * gerçek backend'e gidip 401 alır ve api.ts'in refresh/redirect
 * interceptor'ı testi login ekranına geri atar.
 */
import { test, expect } from '@playwright/test';

const MOCK_FEEDBACK_ITEM = {
  id: 'e2e-mock-feedback-id',
  subject: 'Rapor ekranı yavaş açılıyor',
  message: 'Günlük rapor sayfası açılırken uzun sürüyor.',
  status: 'NEW',
  createdAt: new Date().toISOString(),
  readAt: null,
  tenant: { id: 'e2e-mock-tenant-id', companyName: 'Mock Ltd E2E' },
  user: { id: 'e2e-mock-user-id', email: 'patron@mock.test', fullName: 'Mock Patron' },
};

test('SUPER_ADMIN — Geri Bildirimler sayfasına gidip listeyi görebilir', async ({ page }) => {
  await page.route('**/auth/login', (route) =>
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

  await page.route('**/auth/verify-2fa', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        statusCode: 200,
        message: 'Login successful',
        data: {
          accessToken: 'e2e-mock-access-token',
          user: {
            id: 'e2e-mock-super-admin-id',
            email: 'superadmin@mock.test',
            role: 'SUPER_ADMIN',
            tenantId: 'e2e-mock-host-tenant-id',
            branchId: null,
            planId: null,
          },
        },
      }),
    }),
  );

  await page.route('**/admin/errors/unresolved-count', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) }),
  );

  await page.route('**/admin/feedback/unread-count', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 1 }) }),
  );

  await page.route('**/admin/stats', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        totalTenants: 0,
        statusBreakdown: {},
        planBreakdown: {},
        newLast7Days: 0,
        totalUsers: 0,
        closedLast7Days: 0,
        estimatedMonthlyRevenue: 0,
        failedSyncJobs: 0,
      }),
    }),
  );

  // useAdminFeedback her zaman ?page=1 gönderiyor — glob yerine regex: yalnızca
  // ".../admin/feedback" ile (opsiyonel ?query) BİTEN istekleri yakalar,
  // ".../admin/feedback/unread-count" veya ".../admin/feedback/:id/read"
  // gibi daha spesifik (ayrıca kendi route()'u olan) yolları YAKALAMAZ.
  // "/api/v1/" ÖN EKİ ZORUNLU: aksi halde bu pattern, tarayıcının BİZZAT
  // "/admin/feedback" adresine (Next.js SAYFA rotası, aynı isim) yaptığı
  // navigasyon isteğini de yakalayıp ham JSON'ı sayfa içeriği olarak render
  // ettiriyordu (API portu 3000 ile web portu 3001 farklı ama path aynı).
  await page.route(/\/api\/v1\/admin\/feedback(\?.*)?$/, (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [MOCK_FEEDBACK_ITEM], total: 1, page: 1, pageSize: 20 }),
    });
  });

  // ── Login → 2FA ekranı → doğrula (hepsi mock) ───────────────────────────
  await page.goto('/login');
  await page.getByLabel('E-posta').fill('superadmin@mock.test');
  await page.getByLabel('Şifre').fill('HerhangiBirSifre1');
  await page.getByRole('button', { name: 'Giriş Yap' }).click();

  await expect(page.getByRole('heading', { name: 'Doğrulama Kodu' })).toBeVisible();
  await page.getByLabel('Doğrulama Kodu').fill('123456');
  await page.getByRole('button', { name: 'Doğrula' }).click();

  // ── Sidebar üzerinden Geri Bildirimler'e git ────────────────────────────
  const feedbackLink = page.getByRole('link', { name: 'Geri Bildirimler' });
  await expect(feedbackLink).toBeVisible();
  // Sidebar rozeti — mock'lanan unread-count (1). Rozet responsive olarak İKİ
  // kopya render ediliyor (bkz. admin/layout.tsx): ilki (lg:hidden) daraltılmış
  // menü için, ikincisi (lg:flex) genişletilmiş menü için. Playwright'ın
  // varsayılan Desktop Chrome viewport'u lg: breakpoint'inin üzerinde olduğu
  // için görünen her zaman İKİNCİSİ (.last()) — ilki DOM'da var ama gizli.
  await expect(feedbackLink.getByText('1', { exact: true }).last()).toBeVisible();
  await feedbackLink.click();

  await expect(page).toHaveURL(/\/admin\/feedback/);
  await expect(page.getByRole('heading', { name: 'Geri Bildirimler' })).toBeVisible();

  // Liste doğru göründü: konu, mesaj, gönderen tenant/kullanıcı.
  await expect(page.getByText(MOCK_FEEDBACK_ITEM.subject)).toBeVisible();
  await expect(page.getByText(MOCK_FEEDBACK_ITEM.message)).toBeVisible();
  await expect(page.getByText(/Mock Ltd E2E/)).toBeVisible();
  await expect(page.getByText(/Mock Patron/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Okundu Olarak İşaretle' }),
  ).toBeVisible();
});
