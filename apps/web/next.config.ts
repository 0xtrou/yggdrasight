import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@yggdrasight/core', '@yggdrasight/db'],
  env: {
    MODE: process.env.MODE ?? '',
  },
}

export default nextConfig
