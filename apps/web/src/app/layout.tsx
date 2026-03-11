import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Inter } from 'next/font/google'
import './globals.css'

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://yggdrasight.com'
const SITE_NAME = 'Yggdrasight'
const SITE_TITLE = 'Yggdrasight | AI-Native Trading Intelligence Terminal'
const SITE_DESCRIPTION =
  'AI-powered trading intelligence terminal with real-time market analysis, multi-timeframe signals, and automated execution for crypto and traditional markets.'

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  colorScheme: 'dark',
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  // ── Core ──────────────────────────────────────────────
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'trading terminal',
    'crypto trading',
    'market analysis',
    'AI trading',
    'trading signals',
    'technical analysis',
    'market intelligence',
    'options trading',
    'real-time market data',
    'automated trading',
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: 'finance',

  // ── Icons ─────────────────────────────────────────────
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      { rel: 'mask-icon', url: '/icon-512x512.png', color: '#0a0a0a' },
    ],
  },

  // ── PWA / Manifest ────────────────────────────────────
  manifest: '/manifest.json',

  // ── Open Graph (Facebook, LinkedIn, Discord, etc.) ───
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
  },

  // ── Twitter / X ──────────────────────────────────────
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    creator: '@yggdrasight',
  },

  // ── Microsoft ────────────────────────────────────────
  other: {
    'msapplication-TileColor': '#0a0a0a',
    'msapplication-config': '/browserconfig.xml',
  },

  // ── Robots ────────────────────────────────────────────
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  // ── Alternates ────────────────────────────────────────
  alternates: {
    canonical: SITE_URL,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} ${inter.variable}`}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
