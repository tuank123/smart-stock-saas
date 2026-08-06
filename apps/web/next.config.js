/** @type {import('next').NextConfig} */
const isMobileExport = process.env.NEXT_BUILD_EXPORT === 'true';

const nextConfig = {
  // Mobil export (.next-mobile) ile web geliştirme (.next) aynı build klasörünü
  // paylaşmasın → pnpm dev ve pnpm build:mobile birbirini bozmaz.
  distDir: isMobileExport ? '.next-mobile' : '.next',
  ...(process.env.NODE_ENV === 'production' && isMobileExport && {
    output: 'export',
    trailingSlash: true,
    images: { unoptimized: true },
  }),
  reactStrictMode: true,
};

module.exports = nextConfig;
