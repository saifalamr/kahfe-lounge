import type { Metadata } from 'next'
import './globals.css'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/react'

export const metadata: Metadata = {
  title: 'Kahfe Lounge — Menü',
  description: 'Kahfe Lounge dijital menü',
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
