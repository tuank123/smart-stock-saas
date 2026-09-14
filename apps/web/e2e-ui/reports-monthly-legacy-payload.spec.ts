/**
 * /reports/detay — MonthlyDetail, eski (defectiveItems alanı olmayan) bir
 * payload ile ÇÖKMEMELİ.
 *
 * Gerçek çökme (manuel testte bulundu): ScheduledReport.payload şema-
 * sürümsüz bir JSON blob — defectiveItems alanı bugünkü Zayiatlar
 * özelliğinden ÖNCE üretilmiş MONTHLY raporlarda hiç yok. MonthlyDetail
 * bunu zorunlu bir TypeScript alanı gibi destructure edip doğrudan
 * `.length`/`.map()` çağırınca "Cannot read properties of undefined"
 * hatasıyla React error boundary'ye düşüyordu. Düzeltme: `payload.defectiveItems ?? []`.
 *
 * signupAsStarterPatron() deseni whatsapp-fiyat-price-discount.spec.ts /
 * onboarding-help.spec.ts ile AYNI: PATRON login 2FA gerektirir ama SIGNUP
 * gerektirmez, bu yüzden mock yerine gerçek backend'e karşı gerçek bir
 * oturum açılıyor. Signup sonrası STARTER PATRON otomatik olarak
 * /isletme/raporlar'a yönlendirilir — üretim ortamında kullanıcının bu
 * çökmeye ulaştığı GERÇEK yol da bu (ReportsContent → /reports/detay).
 */
import { test, expect, type Page } from '@playwright/test';

function uniqueSuffix(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function signupAsStarterPatron(page: Page): Promise<void> {
  const suffix = uniqueSuffix();

  await page.goto('/isletme-kaydi');
  await page.getByRole('button', { name: 'Tek Şubeli' }).click();

  await page.getByLabel('Firma Adı').fill(`E2E Rapor Ltd ${suffix}`);
  await page.getByLabel('Vergi Numarası').fill(`RP${suffix}`);
  await page.getByLabel('Şube Adı').fill('Merkez');
  await page.getByLabel('Ad Soyad').fill('E2E Test Kullanıcı');
  await page.getByLabel('E-posta').fill(`e2e-rapor-${suffix}@example.test`);
  await page.getByLabel('Şifre', { exact: true }).fill('Test1234');
  await page.getByLabel('Şifre Tekrar').fill('Test1234');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Kaydol' }).click();

  await expect(page).toHaveURL(/\/isletme\/raporlar/, { timeout: 10000 });
}

const MOCK_REPORT_ID = 'mock-monthly-legacy-1';

test('reports/detay — defectiveItems alanı OLMAYAN eski bir MONTHLY payload çökmeye yol açmaz', async ({
  page,
}) => {
  await signupAsStarterPatron(page);

  // GET /reports/:id — bilerek defectiveItems alanı OLMAYAN, bugünkü
  // özellikten önce üretilmiş gerçek bir kaydın (id=d0fadac2...) birebir
  // şeklini simüle eder.
  await page.route(new RegExp(`/api/v1/reports/${MOCK_REPORT_ID}$`), (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: MOCK_REPORT_ID,
        reportType: 'MONTHLY',
        reportDate: '2026-07-01T00:00:00.000Z',
        generatedAt: '2026-07-31T22:20:05.433Z',
        isRead: false,
        readAt: null,
        pdfUrl: null,
        payload: {
          year: 2026,
          month: 7,
          period: '2026-07',
          totals: { totalOrders: 2, totalMovements: 1, priceAnomalies: 0 },
          branchComparison: [
            {
              branchId: 'mock-branch-1',
              branchName: 'Merkez',
              orderCount: 2,
              stockMovementCount: 1,
              criticalStockCount: 0,
            },
          ],
          dailyReportCount: 31,
          // defectiveItems KASITLI OLARAK YOK — eski kayıt simülasyonu.
        },
      }),
    });
  });

  await page.goto(`/reports/detay?id=${MOCK_REPORT_ID}`);

  // Çökme olsaydı error boundary bu metni gösterirdi.
  await expect(page.getByText('Bir şeyler ters gitti')).not.toBeVisible();

  // Sayfa normal şekilde render olmuş: mevcut alanlar görünüyor...
  await expect(page.getByText('Günlük Rapor Sayısı')).toBeVisible();

  // ...ve defectiveItems olmayan (undefined) payload'da Zayiatlar bölümü
  // boş-durum mesajıyla düşmeden render oluyor.
  await expect(page.getByText('Zayiatlar')).toBeVisible();
  await expect(page.getByText('Bu ay zayiat kaydı yok.')).toBeVisible();

  // Bu kullanıcı STARTER PATRON — Şube Karşılaştırma (çok şubeli PATRON'a
  // özel) rol bazlı gizleniyor, payload'da branchComparison olsa bile
  // (bkz. ReportDetailContent.tsx:MonthlyDetail).
  await expect(page.getByText('Şube Karşılaştırma')).not.toBeVisible();
  await expect(page.getByText('Merkez')).not.toBeVisible();
});
