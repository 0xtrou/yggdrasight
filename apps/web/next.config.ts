import type { NextConfig } from 'next'

console.log(`Next.js config loaded with MODE=${process.env.MODE}`)
const nextConfig: NextConfig = {
  transpilePackages: ['@yggdrasight/core', '@yggdrasight/db'],
  env: {
    MODE: process.env.MODE ?? '',
    // '1' only in the Cloudflare landing build (infra/workers.manifest.ts buildEnv):
    // no MongoDB/Redis/workers behind it, so middleware answers /api/* with 404.
    LANDING_ONLY: process.env.LANDING_ONLY ?? '',
  },
}

export default nextConfig
