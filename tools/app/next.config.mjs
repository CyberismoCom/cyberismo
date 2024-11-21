import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias.handlebars = path.resolve(
      './node_modules/handlebars/dist/handlebars.js',
    );
    config.externals.push({
      'thread-stream': 'commonjs thread-stream',
      pino: 'commonjs pino',
    });
    return config;
  },
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
