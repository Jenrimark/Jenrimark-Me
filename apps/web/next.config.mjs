import { readFileSync } from 'node:fs';

const story = JSON.parse(readFileSync(new URL('./public/scenes/story-v6/story-video.json', import.meta.url), 'utf8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@jenrimark/scene', '@jenrimark/content'],
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: '/scenes/manifest.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        source: '/scenes/story-v6/story-video.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        source: '/scenes/story-v6/gaze-hd-:version/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
  async rewrites() {
    const api = process.env.API_ORIGIN || 'http://127.0.0.1:8080';
    return [
      { source: '/scenes/story-v6/gaze-hd/:path*', destination: `${story.gazeFramesDir}:path*` },
      { source: '/api/:path*', destination: `${api}/api/:path*` },
      { source: '/admin-api/:path*', destination: `${api}/api/:path*` },
    ];
  },
};

export default nextConfig;
