'use client'
import { useEffect, useState } from 'react'
import { useConnectivity } from './useConnectivity'

export function ConnectivityBanner() {
  const isOnline = useConnectivity()
  const [showBackOnline, setShowBackOnline] = useState(false)
  const [wasOffline, setWasOffline] = useState(false)

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true)
    } else if (wasOffline) {
      setShowBackOnline(true)
      const t = setTimeout(() => { setShowBackOnline(false); setWasOffline(false) }, 3000)
      return () => clearTimeout(t)
    }
  }, [isOnline])

  if (!isOnline) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999, background: '#C0392B', color: '#fff', textAlign: 'center', padding: '10px 16px', fontSize: 14, fontWeight: 700, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
        🔴 Bağlantı Yok — Sipariş/ödeme işlemleri çalışmayacaktır. Lütfen internet bağlantısını kontrol edin.
      </div>
    )
  }

  if (showBackOnline) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999, background: '#27ae60', color: '#fff', textAlign: 'center', padding: '10px 16px', fontSize: 14, fontWeight: 700, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
        ✓ Bağlantı geri geldi
      </div>
    )
  }

  return null
}
