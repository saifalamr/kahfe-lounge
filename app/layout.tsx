import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kahfe Lounge — Menü',
  description: 'Kahfe Lounge dijital menü',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  )
}
