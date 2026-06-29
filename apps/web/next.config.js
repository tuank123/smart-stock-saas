/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.NODE_ENV === 'production' && process.env.NEXT_BUILD_EXPORT === 'true' && {
    output: 'export',
    trailingSlash: true,
    images: { unoptimized: true },
  }),
  reactStrictMode: true,
};

module.exports = nextConfig;
