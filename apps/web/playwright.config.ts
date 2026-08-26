import { defineConfig, devices } from '@playwright/test';

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e-ui',
  fullyParallel: false, // testler aynı backend'e (stok_dev) karşı çalışıyor
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Testten önce dev sunucusunu otomatik başlatır, hazır olunca testleri koşar.
  webServer: {
    command: 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // .env.local'deki NEXT_PUBLIC_API_URL LAN IP'sine göre değişebiliyor
      // (bkz. update-local-ip.sh) — testler bu yüzden kırılgan olmasın diye
      // burada Playwright'ın başlattığı dev sunucusuna sabit localhost veriyoruz.
      // Tarayıcı da aynı makinede çalıştığı için localhost:3000 her zaman geçerli.
      NEXT_PUBLIC_API_URL: 'http://localhost:3000/api/v1',
    },
  },
});
