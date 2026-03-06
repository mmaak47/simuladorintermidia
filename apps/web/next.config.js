/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@dooh/core', '@dooh/render'],
  experimental: {
    serverActions: true,
  },
};

module.exports = nextConfig;
