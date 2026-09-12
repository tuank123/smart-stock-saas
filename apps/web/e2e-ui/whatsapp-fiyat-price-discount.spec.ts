/**
 * isletme-app/whatsapp-fiyat/duzenle — Fiyat / İndirim % state yönetimi.
 *
 * Test ettiği iki gerçek davranış hatası (bkz. görev notları):
 *  1. "Güncel Liste Fiyatı" (tedarikçinin bildirdiği orijinal fiyat) Kaydet
 *     sonrası tekrar açıldığında DEĞİŞMEMELİ — backend artık bunu ayrı bir
 *     alanda (supplierPrice) donduruyor, frontend de originalListPrice'ı
 *     ondan türetiyor (newPrice'tan değil).
 *  2. Fiyat alanına dokunulunca (silme ya da yeni değer girme) önceki
 *     İndirim % otomatik sıfırlanmalı — aksi halde eski % sessizce yeni
 *     fiyata da uygulanır (kirlenme). İndirim alanına değer girmek ise
 *     fiyat alanını hiç etkilememeli.
 *
 * signupAsStarterPatron() deseni onboarding-help.spec.ts'teki İLE AYNI:
 * PATRON login artık 2FA gerektiriyor ama SIGNUP gerektirmiyor — bu yüzden
 * mock yerine gerçek backend'e karşı gerçek bir oturum açılıyor. Yalnızca
 * portal/uploads uçları page.route() ile mock'lanıyor (tek bir sahte kalemle
 * çalışmak, gerçek bir tedarikçi/upload/ürün seti kurmaktan çok daha basit
 * ve bu saf state-mantığı testi için yeterli).
 */
import { test, expect, type Page } from '@playwright/test';

function uniqueSuffix(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function signupAsStarterPatron(page: Page): Promise<void> {
  const suffix = uniqueSuffix();

  await page.goto('/isletme-kaydi');
  await page.getByRole('button', { name: 'Tek Şubeli' }).click();

  await page.getByLabel('Firma Adı').fill(`E2E Fiyat Ltd ${suffix}`);
  await page.getByLabel('Vergi Numarası').fill(`PF${suffix}`);
  await page.getByLabel('Şube Adı').fill('Merkez');
  await page.getByLabel('Ad Soyad').fill('E2E Test Kullanıcı');
  await page.getByLabel('E-posta').fill(`e2e-fiyat-${suffix}@example.test`);
  await page.getByLabel('Şifre', { exact: true }).fill('Test1234');
  await page.getByLabel('Şifre Tekrar').fill('Test1234');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Kaydol' }).click();

  await expect(page).toHaveURL(/\/isletme\/raporlar/, { timeout: 10000 });
}

const MOCK_UPLOAD_ID = 'mock-upload-1';
const MOCK_PRODUCT_ID = 'mock-product-1';

interface MockItem {
  productId: string;
  productName: string;
  oldPrice: number | null;
  newPrice: number;
  discountPct: number | null;
  supplierPrice: number;
}

/**
 * GET .../detail/:id ve PATCH .../items uçlarını mock'lar. PATCH, gönderilen
 * newPrice/discountPct'i kalıcı state'e (bu closure'daki `item`) işler ve
 * supplierPrice'a HİÇ dokunmaz — böylece backend'deki düzeltilmiş davranış
 * (bkz. portal.service.ts:updateUploadItems) burada da birebir simüle edilir.
 */
async function mockPriceUpload(page: Page, initial: MockItem) {
  const item: MockItem = { ...initial };

  await page.route(
    new RegExp(`/api/v1/portal/uploads/detail/${MOCK_UPLOAD_ID}$`),
    (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: MOCK_UPLOAD_ID,
          tenantId: 'mock-tenant',
          branchId: 'mock-branch',
          supplierId: 'mock-supplier',
          portalId: 'mock-portal',
          uploaderPhone: '+905551112233',
          pdfUrl: 'mock.pdf',
          ocrExtractedFirm: 'Mock Tedarikçi',
          ocrExtractedPhone: null,
          uploadType: 'PRICE_UPDATE',
          status: 'PENDING_REVIEW',
          createdAt: new Date().toISOString(),
          supplier: { id: 'mock-supplier', name: 'Mock Tedarikçi' },
          parsedItems: [item],
        }),
      });
    },
  );

  await page.route(
    new RegExp(`/api/v1/portal/uploads/${MOCK_UPLOAD_ID}/items$`),
    (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        items: { productId: string; newPrice: number; discountPct?: number | null }[];
      };
      const incoming = body.items.find((i) => i.productId === item.productId);
      if (incoming) {
        item.newPrice = incoming.newPrice;
        item.discountPct = incoming.discountPct ?? null;
        // supplierPrice KASITLI OLARAK dokunulmuyor — donuk kalmalı.
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: MOCK_UPLOAD_ID, status: 'PENDING_REVIEW', parsedItems: [item] }),
      });
    },
  );
}

const EDIT_URL = `/isletme-app/whatsapp-fiyat/duzenle?uploadId=${MOCK_UPLOAD_ID}`;
const priceInput = (page: Page) => page.locator(`#price-${MOCK_PRODUCT_ID}`);
const discInput = (page: Page) => page.locator(`#disc-${MOCK_PRODUCT_ID}`);

test.describe('WhatsApp Fiyat Düzenle — Güncel Liste Fiyatı + İndirim state yönetimi', () => {
  test('Kaydet sonrası "Güncel Liste Fiyatı" değişmez; tekrar açılınca yalnızca fiyatı değiştirince eski indirim otomatik sıfırlanır', async ({
    page,
  }) => {
    await signupAsStarterPatron(page);
    await mockPriceUpload(page, {
      productId: MOCK_PRODUCT_ID,
      productName: 'Ayran 500ml',
      oldPrice: 10,
      newPrice: 11,
      discountPct: null,
      supplierPrice: 11,
    });

    await page.goto(EDIT_URL);
    await expect(page.getByText('Güncel Liste Fiyatı: 11,00 ₺')).toBeVisible();

    // Fiyatı değiştir + %10 indirim uygula, kaydet.
    await priceInput(page).fill('20');
    await discInput(page).fill('10');
    await expect(page.getByText(/Belirlenen Satış Fiyatı:\s*18,00\s*₺/)).toBeVisible();

    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText('Fiyat listesi kaydedildi')).toBeVisible();

    // "Tekrar açma" — gerçek bir yeniden yükleme (component state sıfırlanır,
    // GET detail'den taze veri okunur).
    await page.reload();

    // SORUN 1 düzeltmesi: Güncel Liste Fiyatı HÂLÂ orijinal (11,00 ₺) —
    // kaydedilen 20 DEĞİL.
    await expect(page.getByText('Güncel Liste Fiyatı: 11,00 ₺')).toBeVisible();
    // Kaydedilen değerler doğru geri yüklendi.
    await expect(priceInput(page)).toHaveValue('20');
    await expect(discInput(page)).toHaveValue('10');

    // SORUN 2 düzeltmesi: yalnızca fiyatı değiştir, indirime dokunma.
    await priceInput(page).fill('30');

    // Eski %10 otomatik sıfırlanmalı.
    await expect(discInput(page)).toHaveValue('');
    // Belirlenen Satış Fiyatı artık indirimsiz 30,00 ₺ (27,00 ya da 18,00 DEĞİL).
    await expect(page.getByText(/Belirlenen Satış Fiyatı:\s*30,00\s*₺/)).toBeVisible();
  });

  test('Fiyat alanı tamamen silinirse İndirim % de otomatik sıfırlanır', async ({ page }) => {
    await signupAsStarterPatron(page);
    await mockPriceUpload(page, {
      productId: MOCK_PRODUCT_ID,
      productName: 'Coca-Cola 33cl',
      oldPrice: 14,
      newPrice: 15,
      discountPct: 25,
      supplierPrice: 15,
    });

    await page.goto(EDIT_URL);
    await expect(discInput(page)).toHaveValue('25');

    await priceInput(page).fill('');

    await expect(discInput(page)).toHaveValue('');
  });

  test('İndirim % alanına değer girmek fiyat alanını SİLMEZ', async ({ page }) => {
    await signupAsStarterPatron(page);
    await mockPriceUpload(page, {
      productId: MOCK_PRODUCT_ID,
      productName: 'Su 50cl',
      oldPrice: 4,
      newPrice: 5,
      discountPct: null,
      supplierPrice: 5,
    });

    await page.goto(EDIT_URL);
    await expect(priceInput(page)).toHaveValue('5');

    await discInput(page).fill('20');

    // Fiyat alanı hâlâ dolu ve aynı değerde.
    await expect(priceInput(page)).toHaveValue('5');
    // Belirlenen Satış Fiyatı indirimle güncellendi (5 * 0.8 = 4,00 ₺).
    await expect(page.getByText(/Belirlenen Satış Fiyatı:\s*4,00\s*₺/)).toBeVisible();
  });
});
