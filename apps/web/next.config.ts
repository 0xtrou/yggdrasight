import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@yggdrasight/core', '@yggdrasight/db'],
}

export default nextConfig
