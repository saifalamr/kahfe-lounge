import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Kahfe Lounge — Patron',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Kahfe Lounge',
  },
}

export const viewport: Viewport = {
  themeColor: '#0D0D0D',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export default function PatronLayout({ children }: { children: React.ReactNode }) {
  return children
}
