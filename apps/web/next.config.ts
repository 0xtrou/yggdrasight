import type { NextConfig } from 'next'

console.log(`Next.js config loaded with MODE=${process.env.MODE}`)
const nextConfig: NextConfig = {
  transpilePackages: ['@yggdrasight/core', '@yggdrasight/db'],
  env: {
    MODE: process.env.MODE ?? '',
  },
}

export default nextConfig
