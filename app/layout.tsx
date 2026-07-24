import type { Metadata } from 'next'
import './globals.css'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/next'

export const metadata: Metadata = {
  title: 'Kahfe Lounge — Menü',
  description: 'Kahfe Lounge dijital menü. Kahve, nargile, yemek ve daha fazlası.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/favicon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/favicon-512.png',
  },
  openGraph: {
    title: 'Kahfe Lounge — Menü',
    description: 'Kahve, nargile, kahvaltı ve daha fazlası.',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Kahfe Lounge' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kahfe Lounge — Menü',
    images: ['/og-image.jpg'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
