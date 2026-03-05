import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@oculus/core', '@oculus/db'],
}

export default nextConfig
