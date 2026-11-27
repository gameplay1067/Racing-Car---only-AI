import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: false,
  assetPrefix: '.',
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
