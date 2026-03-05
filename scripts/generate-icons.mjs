import sharp from 'sharp'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'assets', 'logo.png')
const PUBLIC = join(ROOT, 'apps', 'web', 'public')

const BG_COLOR = { r: 10, g: 10, b: 10, alpha: 1 }

async function generateMaskableIcon(size, padding = 0.1) {
  const pad = Math.round(size * padding)
  const logoSize = size - pad * 2

  const logo = await sharp(SRC)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG_COLOR,
    },
  })
    .composite([{ input: logo, left: pad, top: pad }])
    .png()
    .toBuffer()
}

async function generateOGImage(width, height) {
  const logoSize = Math.round(Math.min(width, height) * 0.55)
  const x = Math.round((width - logoSize) / 2)
  const y = Math.max(0, Math.round((height - logoSize) / 2) - 40)

  const logo = await sharp(SRC)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()

  // Create SVG text overlay
  const textSvg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text x="${width / 2}" y="${y + logoSize + 55}" text-anchor="middle"
            font-family="system-ui, -apple-system, sans-serif" font-size="42" font-weight="bold" fill="white">
        Oculus Trading
      </text>
      <text x="${width / 2}" y="${y + logoSize + 90}" text-anchor="middle"
            font-family="system-ui, -apple-system, sans-serif" font-size="22" fill="rgba(255,255,255,0.5)">
        AI-Powered Trading Intelligence Terminal
      </text>
    </svg>
  `)

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: BG_COLOR,
    },
  })
    .composite([
      { input: logo, left: x, top: y },
      { input: textSvg, left: 0, top: 0 },
    ])
    .png()
    .toBuffer()
}

async function generateMSTile(width, height) {
  const logoSize = Math.round(Math.min(width, height) * 0.6)
  const x = Math.round((width - logoSize) / 2)
  const y = Math.round((height - logoSize) / 2)

  const logo = await sharp(SRC)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: logo, left: x, top: y }])
    .png()
    .toBuffer()
}

// All icons use the full square logo — no cropping.
// Small sizes get normalise + strong sharpen so detail survives at 16-32px.
async function generateSquareIcon(size) {
  let pipeline = sharp(SRC)
    .resize(size, size, {
      kernel: sharp.kernel.lanczos3,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })

  if (size <= 64) {
    pipeline = pipeline
      .normalise()
      .sharpen({ sigma: 1.5, m1: 2.0, m2: 1.0 })
  } else if (size <= 128) {
    pipeline = pipeline.sharpen({ sigma: 0.8, m1: 1.0, m2: 0.5 })
  } else {
    pipeline = pipeline.sharpen({ sigma: 0.5, m1: 0.8, m2: 0.5 })
  }

  return pipeline.png().toBuffer()
}

async function main() {
  mkdirSync(join(PUBLIC, 'icons'), { recursive: true })

  // ── Square icons (Lanczos3 + sharpen) ──────────────────────
  console.log('Generating square icons...')
  const sizes = [16, 32, 48, 64, 96, 128, 144, 150, 152, 167, 180, 192, 256, 310, 384, 512]
  for (const size of sizes) {
    const buf = await generateSquareIcon(size)
    await sharp(buf).toFile(join(PUBLIC, 'icons', `icon-${size}x${size}.png`))
    console.log(`  icon-${size}x${size}.png`)
  }

  // Copy to standard locations
  const { copyFileSync } = await import('fs')
  copyFileSync(join(PUBLIC, 'icons', 'icon-16x16.png'), join(PUBLIC, 'favicon-16x16.png'))
  copyFileSync(join(PUBLIC, 'icons', 'icon-32x32.png'), join(PUBLIC, 'favicon-32x32.png'))
  copyFileSync(join(PUBLIC, 'icons', 'icon-180x180.png'), join(PUBLIC, 'apple-touch-icon.png'))
  copyFileSync(join(PUBLIC, 'icons', 'icon-192x192.png'), join(PUBLIC, 'icon-192x192.png'))
  copyFileSync(join(PUBLIC, 'icons', 'icon-512x512.png'), join(PUBLIC, 'icon-512x512.png'))
  console.log('  Copied to standard locations')

  // ── Maskable icons ──────────────────────────────────────────
  console.log('Generating maskable icons...')
  for (const size of [192, 384, 512]) {
    const buf = await generateMaskableIcon(size)
    await sharp(buf).toFile(join(PUBLIC, 'icons', `maskable-icon-${size}x${size}.png`))
    console.log(`  maskable-icon-${size}x${size}.png`)
  }

  // ── OG / Twitter images ─────────────────────────────────────
  console.log('Generating Open Graph images...')
  const ogBuf = await generateOGImage(1200, 630)
  await sharp(ogBuf).toFile(join(PUBLIC, 'og-image.png'))
  console.log('  og-image.png (1200x630)')

  const twBuf = await generateOGImage(1200, 600)
  await sharp(twBuf).toFile(join(PUBLIC, 'twitter-image.png'))
  console.log('  twitter-image.png (1200x600)')

  // ── Microsoft tile images ───────────────────────────────────
  console.log('Generating Microsoft tile images...')
  const wideTile = await generateMSTile(310, 150)
  await sharp(wideTile).toFile(join(PUBLIC, 'icons', 'mstile-310x150.png'))
  console.log('  mstile-310x150.png')

  const largeTile = await generateMSTile(310, 310)
  await sharp(largeTile).toFile(join(PUBLIC, 'icons', 'mstile-310x310.png'))
  console.log('  mstile-310x310.png')

  const smallTile = await generateMSTile(70, 70)
  await sharp(smallTile).toFile(join(PUBLIC, 'icons', 'mstile-70x70.png'))
  console.log('  mstile-70x70.png')

  console.log('\nAll icons generated successfully!')
}

main().catch(console.error)
