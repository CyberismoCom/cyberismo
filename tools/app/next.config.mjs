import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias.handlebars = path.resolve(
      '../../node_modules/handlebars/dist/handlebars.js',
    );
    return config;
  },
};

export default nextConfig;
