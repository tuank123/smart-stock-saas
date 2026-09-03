/**
 * Auth + navigasyon UI testleri — apps/api/test/*.e2e-spec.ts backend'i
 * (HTTP kodları, veri doğruluğu) kapsıyor ama sayfa yönlendirme / auth store
 * hydration mantığını hiç dokunmuyordu. 25 Ağustos 2026'daki "login sonrası
 * dashboard yerine login ekranına geri dönme" hatası (isNative()/dashboardFor()
 * tutarsızlığı + hydration zamanlaması) tam olarak bu boşluk yüzünden hiçbir
 * otomatik testte yakalanamadı — bu dosya o boşluğu kapatıyor.
 *
 * Gerçek backend'e (stok_dev, localhost:3000) karşı çalışır — mock yok.
 *
 * ── storageState mi, her testte yeniden login mi? ────────────────────────
 * `POST /auth/login`'de IP bazlı framework throttle'ı var
 * (auth.controller.ts: @Throttle({ limit: 5, ttl: 900_000 })). 6 testin
 * HER BİRİ kendi login'ini taze atsaydı, bu limit HER ÇALIŞTIRMADA aşılırdı
 * (tek seferlik şans eseri değil, yapısal bir çakışma — bunu elle
 * doğrulayarak bulduk). Bu yüzden:
 *   - Yalnızca login DAVRANIŞININ KENDİSİNİ test eden 3 senaryo (PATRON
 *     yönlendirme, SUBE_MUDURU yönlendirme, yanlış şifre) formu gerçekten
 *     doldurup submit ediyor.
 *   - Zaten girişli bir kullanıcının davranışını test eden 3 senaryo
 *     (reload sonrası oturum, logout, yetkisiz rota) test 1/2'de elde
 *     edilen storageState'i yeniden kullanıyor — login'i tekrar atmıyor.
 * Toplamda test başına yalnızca 3 gerçek POST /auth/login isteği atılıyor.
 *
 * `test.describe.serial` ZORUNLU: 3-4-5-6, 2'nin storageState'ine bağımlı —
 * sıra karışırsa ya da 2 başarısız olursa Playwright kalanları otomatik
 * atlar (serial modun garantisi).
 *
 * Hesaplar (stok_dev'de mevcut, canlı login ile doğrulandı):
 *   admin@acme.com   / Admin123!    → PATRON,      plan STARTER → web'de /isletme/raporlar
 *   manager@acme.com / Manager123!  → SUBE_MUDURU                → /mudur/dashboard
 * teksube@acme.com (Teksube1234!) DB'de kontrol edildi: PATRON + STARTER —
 * admin@acme.com ile AYNI rol/plan kombinasyonu, farklı bir senaryo eklemiyor,
 * bu yüzden kullanılmadı. KASIYER/DEPO rolünde çok sayıda eski test hesabı
 * var (ör. calisan@test.com, depo_test@test.com) ama şifreleri bilinmiyor —
 * bu dosyada varsayım/tahmin kullanılmadı.
 *
 * ── PATRON/SUPER_ADMIN e-posta 2FA (Eylül 2026) ──────────────────────────
 * admin@acme.com (PATRON) artık doğru şifreyle bile DOĞRUDAN dashboard'a
 * gitmiyor — /auth/login requires2fa+tempToken döndürüyor, gerçek token
 * yalnızca POST /auth/verify-2fa'dan sonra geliyor. Bu ortamda e-posta mock
 * modda (EMAIL_ENABLED=false) gönderildiği için gerçek kod Playwright'tan
 * ERİŞİLEMEZ (yalnızca backend loglarına/Redis'e yazılıyor) — bu yüzden:
 *   - Test 1 yalnızca "2FA ekranı doğru göründü, dashboard'a DOĞRUDAN
 *     geçilmedi" kısmına kadar doğruluyor; verify-2fa'nın uçtan uca gerçekten
 *     çalıştığı apps/api/test/auth-2fa.e2e-spec.ts'te (gerçek kod, Redis'ten
 *     okunarak) zaten kanıtlanıyor.
 *   - 2FA ekranının backend yanıtlarına (başarı/yanlış kod/süresi dolmuş
 *     tempToken) doğru tepki verdiği auth-2fa-screen.spec.ts'te ağ seviyesinde
 *     mock'lanarak (page.route) ayrıca test ediliyor.
 *   - Artık admin@acme.com üzerinden basit bir login ile TAM yetkili bir
 *     storageState elde edilemediği için, "zaten girişli kullanıcı"
 *     senaryoları (3/5: reload/logout) manager@acme.com'a (SUBE_MUDURU,
 *     2FA'dan ETKİLENMEYEN rol) taşındı — test ettikleri hydration/guard/
 *     logout mantığı role'den bağımsız, her layout'ta aynı desen.
 */
import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre').fill(password);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
}

test.describe.serial('Auth / navigasyon', () => {
  // Test 2'de doldurulur, 3/5/6'da storageState olarak yeniden kullanılır.
  let managerState:
    | Awaited<ReturnType<ReturnType<Page['context']>['storageState']>>
    | undefined;

  test('PATRON girişi 2FA ekranını gösteriyor, dashboard\'a DOĞRUDAN geçmiyor', async ({
    page,
  }) => {
    // PATRON için e-posta 2FA ZORUNLU — doğru kimlik bilgileriyle bile artık
    // /isletme/raporlar'a DOĞRUDAN gitmiyor, önce "Doğrulama Kodu" ekranı
    // gösteriliyor. Bu ortamda gerçek kodu Playwright'tan okumanın bilinen
    // bir yolu yok (bkz. dosya başındaki not) — test burada duruyor.
    await login(page, 'admin@acme.com', 'Admin123!');

    await expect(page.getByRole('heading', { name: 'Doğrulama Kodu' })).toBeVisible();
    await expect(page.getByLabel('Doğrulama Kodu')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Doğrula' })).toBeVisible();

    // Dashboard'a DOĞRUDAN geçilmedi, tam yetkili bir oturum açılmadı.
    await expect(page).not.toHaveURL(/\/isletme\/raporlar/);
    await expect(page.getByTitle('Çıkış yap')).toHaveCount(0);
    // tempToken hassas veri — URL'e hiç yazılmamalı (yalnızca React state'te).
    expect(page.url()).not.toContain('tempToken');
  });

  test('SUBE_MUDURU girişi doğru sayfaya yönlendiriyor (/mudur/dashboard)', async ({ page }) => {
    await login(page, 'manager@acme.com', 'Manager123!');

    await expect(page).toHaveURL(/\/mudur\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();

    managerState = await page.context().storageState();
  });

  test('Sayfa yenileme sonrası oturum korunuyor (hydration regresyon testi)', async ({
    browser,
  }) => {
    // 25 Ağustos'taki hatanın doğrudan regresyon testi: hasHydrated henüz
    // false iken auth store'un "kullanıcı yok" sanıp login/kök ekrana geri
    // atması senaryosu. SUBE_MUDURU kullanılıyor (bkz. dosya başındaki 2FA
    // notu) — hydration mantığı role'den bağımsız, mudur/layout.tsx de
    // isletme/layout.tsx ile AYNI hasHydrated deseniyle çalışıyor.
    const context = await browser.newContext({ storageState: managerState });
    const page = await context.newPage();
    await page.goto('/mudur/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();

    await page.reload();

    // Rehydrate süresince FullPageSpinner gösterilir, sonra ya aynı sayfada
    // kalınır ya da login/köke geri atılır — asıl iddia: geri ATILMAMALI.
    await expect(page).toHaveURL(/\/mudur\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'StokPilot Girişi' })).toHaveCount(0);

    await context.close();
  });

  test('Yanlış şifreyle giriş net bir hata mesajı gösteriyor, sonsuza kadar donmuyor', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('E-posta').fill('admin@acme.com');
    await page.getByLabel('Şifre').fill('YanlisSifre999');
    await page.getByRole('button', { name: 'Giriş Yap' }).click();

    // Backend UnauthorizedException('Invalid credentials') →
    // getLoginErrorMessage() bunu tam olarak bu Türkçe metne çeviriyor.
    await expect(page.getByText('E-posta veya şifre hatalı')).toBeVisible({ timeout: 5000 });

    // Buton "Giriş yapılıyor..." durumunda sonsuza kalmamalı, tekrar
    // tıklanabilir "Giriş Yap" haline dönmeli.
    const submitButton = page.getByRole('button', { name: 'Giriş Yap' });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();

    // Yanlış şifre denemesi hiçbir şekilde dashboard'a sürüklememeli.
    await expect(page).toHaveURL(/\/login/);
  });

  test('Çıkış yapınca login ekranına dönülüyor', async ({ browser }) => {
    // SUBE_MUDURU kullanılıyor (bkz. dosya başındaki 2FA notu). MudurSidebar
    // (bottom-tab-bar) çıkışı doğrudan bir buton olarak değil, "Daha Fazla"
    // sheet'inin içinde gösteriyor — isletme/Header.tsx'teki tek tıkla
    // çıkıştan farklı ama aynı useAuth().logout() akışını tetikliyor.
    const context = await browser.newContext({ storageState: managerState });
    const page = await context.newPage();
    await page.goto('/mudur/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Daha Fazla' }).click();
    await page.getByRole('button', { name: 'Çıkış Yap' }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'StokPilot Girişi' })).toBeVisible();

    await context.close();
  });

  test('Yetkisiz rota erişimi engelleniyor (SUBE_MUDURU → /admin/dashboard)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: managerState });
    const page = await context.newPage();
    await page.goto('/mudur/dashboard');
    await expect(page).toHaveURL(/\/mudur\/dashboard/);

    // admin/layout.tsx: allowed = role === 'SUPER_ADMIN'; SUBE_MUDURU için
    // false → router.replace('/login').
    await page.goto('/admin/dashboard');

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Genel Bakış' })).toHaveCount(0);
    await expect(page.getByText('Yönetim')).toHaveCount(0);

    await context.close();
  });
});
