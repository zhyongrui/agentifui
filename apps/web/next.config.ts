import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@agentifui/shared', '@agentifui/ui', '@agentifui/db'],
};

export default nextConfig;
