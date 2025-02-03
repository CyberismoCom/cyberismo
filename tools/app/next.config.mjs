import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable experimental features including Turbopack
  experimental: {
    turbo: {
      enabled: true
    }
  },
  // Specify packages that should only be bundled on server-side
  serverExternalPackages: ['pino', 'thread-stream', 'handlebars'],
  // Keep redirects as they are compatible
  async redirects() {
    return [
      {
        source: '/:path*.html',
        destination: '/:path*',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
