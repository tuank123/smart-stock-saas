/** @type {import('next').NextConfig} */
const isMobileExport = process.env.NEXT_BUILD_EXPORT === 'true';
const isProdExport = process.env.NODE_ENV === 'production' && isMobileExport;

const nextConfig = {
  // Mobil export (.next-mobile) ile web geliştirme (.next) aynı build klasörünü
  // paylaşmasın → pnpm dev ve pnpm build:mobile birbirini bozmaz.
  //
  // İSTİSNA: gerçek export build'inde (isProdExport) distDir'i ASLA '.next'
  // dışına çıkarmıyoruz. Next.js'in kendi build kodu (next/dist/build/index.js)
  // şunu yapıyor: output:'export' aktifken distDir varsayılan ('.next') değilse,
  // o özel distDir değerini "export hedefi" (outDir) olarak yeniden yorumluyor
  // ve export'u out/ yerine doğrudan o klasöre yazıyor — kendi deyimiyle
  // "the user-configured distDir is actually the outDir". Yani '.next-mobile'
  // verirsek export sessizce out/ yerine .next-mobile/'a yazılıyor, out/ hiç
  // oluşmuyor (capacitor.config.ts'in webDir:'out' beklentisiyle uyuşmuyor).
  // Bunu yaşayıp bulduk: 'Compiled successfully' diyor ama out/ yok.
  distDir: isProdExport ? '.next' : isMobileExport ? '.next-mobile' : '.next',
  ...(isProdExport && {
    output: 'export',
    trailingSlash: true,
    images: { unoptimized: true },
  }),
  reactStrictMode: true,
};

module.exports = nextConfig;
