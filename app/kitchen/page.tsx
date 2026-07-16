'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useConnectivity } from '@/lib/useConnectivity'
import { ConnectivityBanner } from '@/lib/ConnectivityBanner'

// Manager/Touchscreen/shared-staff-code PINs are verified server-side via
// the verify_access_pin RPC (see access_pins table, shared with /admin) -
// nothing sensitive is hardcoded in this file.

export default function KitchenPage() {
  const isOnline = useConnectivity()

  // Load the same font system as the redesigned admin panel
  useEffect(() => {
    if (document.getElementById('kahfe-kitchen-fonts')) return
    const link = document.createElement('link')
    link.id = 'kahfe-kitchen-fonts'
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=IBM+Plex+Sans:wght@500;600;700&family=IBM+Plex+Mono:wght@500;600;700&display=swap'
    document.head.appendChild(link)
  }, [])

  const [auth, setAuth] = useState(false)
  const [staffName, setStaffName] = useState('')
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)
  const [loginSystemError, setLoginSystemError] = useState('')
  const [orders, setOrders] = useState<any[]>([])
  const [now, setNow] = useState(Date.now())

  const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours
  const sessionMaxAgeFor = (r: string | null) => (r === 'manager' || r === 'touchscreen') ? Infinity : SESSION_MAX_AGE_MS

  function clearSession() {
    localStorage.removeItem('kahfe_admin_role')
    localStorage.removeItem('kahfe_admin')
    localStorage.removeItem('kahfe_staff_name')
    localStorage.removeItem('kahfe_session_started_at')
    localStorage.removeItem('kahfe_session_epoch')
    localStorage.removeItem('kahfe_session_token')
    setAuth(false); setStaffName('')
  }

  async function getCurrentSessionEpoch(): Promise<string> {
    const { data } = await supabase.from('settings').select('value').eq('key', 'session_epoch').maybeSingle()
    return String(data?.value ?? '0')
  }

  // Reuses the same login session as /admin — if someone's already logged
  // into the admin panel on this device, the kitchen screen opens straight up
  useEffect(() => {
    (async () => {
      const savedRole = localStorage.getItem('kahfe_admin_role')
      const savedName = localStorage.getItem('kahfe_staff_name')
      const savedAt = Number(localStorage.getItem('kahfe_session_started_at') || 0)
      const savedEpoch = localStorage.getItem('kahfe_session_epoch')
      if (!(savedRole === 'manager' || savedRole === 'staff' || savedRole === 'touchscreen')) return
      if (!savedAt || Date.now() - savedAt > sessionMaxAgeFor(savedRole)) { clearSession(); return }
      const currentEpoch = await getCurrentSessionEpoch()
      if (savedEpoch !== currentEpoch) { clearSession(); return }
      setAuth(true)
      setStaffName(savedName || 'Mutfak')
    })()
  }, [])

  // Re-check periodically so a remote "log out all devices" from Ayarlar,
  // or the 24h expiry, takes effect without needing a manual reload
  useEffect(() => {
    if (!auth) return
    const interval = setInterval(async () => {
      const savedRole = localStorage.getItem('kahfe_admin_role')
      const savedAt = Number(localStorage.getItem('kahfe_session_started_at') || 0)
      if (!savedAt || Date.now() - savedAt > sessionMaxAgeFor(savedRole)) { clearSession(); return }
      const savedEpoch = localStorage.getItem('kahfe_session_epoch')
      const currentEpoch = await getCurrentSessionEpoch()
      if (savedEpoch !== currentEpoch) clearSession()
    }, 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [auth])

  async function login() {
    const { data, error } = await supabase.rpc('login_with_pin', { p_pin: pw, p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null }).maybeSingle() as { data: { role: string, token: string, staff_name: string } | null, error: any }
    if (error) { setLoginSystemError(error.message || 'Bilinmeyen hata'); return }
    setLoginSystemError('')
    if (!data) { setPwError(true); return }
    const normalizedRole = data.role === 'manager' ? 'manager' : data.role === 'touchscreen' ? 'touchscreen' : 'staff'
    localStorage.setItem('kahfe_admin_role', normalizedRole)
    localStorage.setItem('kahfe_staff_name', data.staff_name)
    localStorage.setItem('kahfe_session_started_at', String(Date.now()))
    localStorage.setItem('kahfe_session_token', data.token)
    const epoch = await getCurrentSessionEpoch()
    localStorage.setItem('kahfe_session_epoch', epoch)
    setAuth(true); setStaffName(data.staff_name)
  }

  async function loadOrders() {
    const { data } = await supabase.from('orders').select('*').eq('status', 'pending').order('created_at', { ascending: true })
    setOrders(data || [])
  }

  async function markDone(id: string) {
    setOrders(prev => prev.filter(o => o.id !== id))
    await supabase.from('orders').update({ status: 'served', handled_by: staffName }).eq('id', id)
  }

  function beep() {
    if (localStorage.getItem('kahfe_notif_sound') === 'off') return
    try {
      const ctx = new AudioContext()
      const tones = [880, 1046, 1318]
      tones.forEach((freq, i) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = freq; gain.gain.value = 0.3
        osc.start(ctx.currentTime + i * 0.16)
        osc.stop(ctx.currentTime + i * 0.16 + 0.15)
      })
    } catch (e) {}
  }

  useEffect(() => {
    if (!auth) return
    loadOrders()
    const channel = supabase
      .channel('kitchen-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload: any) => {
        if (payload.new.status === 'pending') {
          setOrders(prev => [...prev, payload.new])
          beep()
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => loadOrders())
      .subscribe()
    const poll = setInterval(loadOrders, 20000)
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => { supabase.removeChannel(channel); clearInterval(poll); clearInterval(clock) }
  }, [auth])

  if (!auth) return (
    <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <ConnectivityBanner />
      <div style={{ background: '#1A1A1A', padding: 32, width: '100%', maxWidth: 360, border: '1px solid #2A2A2A' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ color: '#C9A84C', fontSize: 10, letterSpacing: 4, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>MUTFAK EKRANI</div>
          <div style={{ color: '#F0EDE8', fontSize: 24, fontWeight: 800, fontFamily: "'Bricolage Grotesque', sans-serif", letterSpacing: '-0.01em' }}>KAHFE LOUNGE</div>
        </div>
        <input type="password" value={pw} onChange={e => { setPw(e.target.value); setPwError(false) }}
          onKeyDown={e => e.key === 'Enter' && login()}
          placeholder="Şifre veya PIN"
          style={{ width: '100%', height: 52, background: '#0A0A0A', border: pwError ? '1px solid #C0392B' : '1px solid #383838', color: '#F0EDE8', padding: '0 16px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, letterSpacing: '0.2em', outline: 'none', marginBottom: 8 }} />
        {pwError && <div style={{ color: '#C0392B', fontSize: 12, marginBottom: 12 }}>Hatalı şifre</div>}
        {loginSystemError && <div style={{ color: '#f39c12', fontSize: 12, marginBottom: 12, padding: 10, background: 'rgba(243,156,18,.1)', border: '1px solid rgba(243,156,18,.3)' }}>⚠️ Sistem hatası (şifre yanlış değil): {loginSystemError}</div>}
        <button onClick={login} style={{ width: '100%', height: 56, background: '#C9A84C', border: 'none', color: '#0A0A0A', fontWeight: 600, fontSize: 16, cursor: 'pointer', marginTop: 8, fontFamily: "'IBM Plex Sans', sans-serif" }}>Giriş Yap</button>
      </div>
    </div>
  )

  return (
    <div style={{ background: '#0A0A0A', minHeight: '100vh', padding: '24px 32px', fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <ConnectivityBanner />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div style={{ color: '#F0EDE8', fontSize: 30, fontWeight: 800, fontFamily: "'Bricolage Grotesque', sans-serif", letterSpacing: '-0.01em' }}>🍳 Mutfak Ekranı</div>
        <div style={{ color: '#8A8A8A', fontSize: 17, fontFamily: "'IBM Plex Mono', monospace" }}>{orders.length} bekleyen sipariş</div>
      </div>

      {orders.length === 0 && (
        <div style={{ textAlign: 'center', color: '#8A8A8A', padding: '100px 0', fontSize: 22 }}>Bekleyen sipariş yok ✓</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
        {orders.map(order => {
          const elapsedMin = Math.floor((now - new Date(order.created_at).getTime()) / 60000)
          const urgent = elapsedMin >= 10
          return (
            <div key={order.id} style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderTop: urgent ? '4px solid #C0392B' : '4px solid #C9A84C', padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                <div style={{ color: '#F0EDE8', fontSize: 30, fontWeight: 700, fontFamily: "'Bricolage Grotesque', sans-serif" }}>{order.table_name}</div>
                <div style={{ color: urgent ? '#e74c3c' : '#8A8A8A', fontSize: 17, fontFamily: "'IBM Plex Mono', monospace", fontWeight: urgent ? 700 : 500 }}>{elapsedMin} dk</div>
              </div>
              <div style={{ marginBottom: 18 }}>
                {order.items?.map((item: any, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: 14, fontSize: 21, color: '#F0EDE8', padding: '7px 0', borderBottom: '1px solid rgba(240,237,232,.06)' }}>
                    <span style={{ color: '#C9A84C', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, minWidth: 36 }}>{item.quantity}×</span>
                    <span>{item.name}</span>
                  </div>
                ))}
              </div>
              {order.note && (
                <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(201,168,76,.08)', border: '1px solid rgba(201,168,76,.2)', fontSize: 16, color: '#F0EDE8' }}>📝 {order.note}</div>
              )}
              <button onClick={() => markDone(order.id)} disabled={!isOnline} style={{ width: '100%', height: 60, background: isOnline ? '#27ae60' : '#2A2A2A', border: 'none', color: isOnline ? '#fff' : '#666', fontSize: 18, fontWeight: 600, cursor: isOnline ? 'pointer' : 'not-allowed', fontFamily: "'IBM Plex Sans', sans-serif" }}>{isOnline ? '✓ Hazır' : '🔴 Bağlantı Yok'}</button>
            </div>
          )
        })}
      </div>

      <div style={{ textAlign: 'center', marginTop: 40 }}>
        <button onClick={clearSession}
          style={{ background: 'transparent', border: '1px solid #383838', color: '#8A8A8A', fontSize: 13, padding: '8px 16px', cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif" }}>Çıkış</button>
      </div>
    </div>
  )
}
