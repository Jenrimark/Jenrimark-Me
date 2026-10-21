/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@jenrimark/scene', '@jenrimark/content'],
  images: { unoptimized: true },
  async rewrites() {
    const api = process.env.API_ORIGIN || 'http://127.0.0.1:8080';
    return [
      { source: '/api/:path*', destination: `${api}/api/:path*` },
      { source: '/admin-api/:path*', destination: `${api}/api/:path*` },
    ];
  },
};

export default nextConfig;
