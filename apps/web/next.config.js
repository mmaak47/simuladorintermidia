const deploymentVersion =
  process.env.NEXT_PUBLIC_DEPLOYMENT_VERSION ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GIT_COMMIT_SHA ||
  process.env.SOURCE_VERSION ||
  new Date().toISOString();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.DOCKER_BUILD === '1' ? 'standalone' : undefined,
  transpilePackages: ['@dooh/core', '@dooh/render'],
  env: {
    NEXT_PUBLIC_DEPLOYMENT_VERSION: deploymentVersion,
  },
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
};

module.exports = nextConfig;
