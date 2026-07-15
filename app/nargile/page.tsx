'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useConnectivity } from '@/lib/useConnectivity'
import { ConnectivityBanner } from '@/lib/ConnectivityBanner'
import { buildKitchenTicketEscPos, printViaRawBT } from '@/app/admin/lib/escpos'

// Manager/Touchscreen/shared-staff-code PINs are verified server-side via
// the verify_access_pin RPC (see access_pins table, shared with /admin) -
// nothing sensitive is hardcoded in this file.

export default function NargilePage() {
  const isOnline = useConnectivity()

  // Load the same font system as the redesigned admin panel
  useEffect(() => {
    if (document.getElementById('kahfe-nargile-fonts')) return
    const link = document.createElement('link')
    link.id = 'kahfe-nargile-fonts'
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
  // Maps a menu item id -> its printer station, built from menu_items +
  // the category_stations setting configured in Ayarlar
  const [itemStationMap, setItemStationMap] = useState<Record<string, 'kitchen'|'nargile'>>({})
  // Same global toggle as Ayarlar > Otomatik Yazdırma (admin panel). This
  // device needs RawBT installed and configured to point at the physical
  // nargile-room printer for this to do anything - there's no in-app way
  // to verify that from here, so the toggle staying on with a printer
  // that's misconfigured/offline will silently do nothing rather than error.
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false)
  // Android/Chrome won't reliably let a page silently launch RawBT with
  // zero user interaction behind it - that's a real browser security rule,
  // not something togglable in our code. One tap anywhere on this screen
  // satisfies it for the rest of that page session (until reload), so this
  // just needs confirming once each time the tablet opens/reloads this page.
  const [printingActivated, setPrintingActivated] = useState(false)

  // Reuses the same login session as /admin — if someone's already logged
  // into the admin panel on this device, the nargile screen opens straight up
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
      setStaffName(savedName || 'Nargile')
    })()
  }, [])

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
    const { data, error } = await supabase.rpc('login_with_pin', { p_pin: pw }).maybeSingle() as { data: { role: string, token: string, staff_name: string } | null, error: any }
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

  async function loadStationMap() {
    const [{ data: menuItems }, { data: settingsRows }] = await Promise.all([
      supabase.from('menu_items').select('id,category_id'),
      supabase.from('settings').select('key,value').in('key', ['category_stations', 'auto_print_enabled']),
    ])
    const categoryStationsRow = settingsRows?.find((r: any) => r.key === 'category_stations')
    const autoPrintRow = settingsRows?.find((r: any) => r.key === 'auto_print_enabled')
    const categoryStations: Record<string, 'kitchen'|'nargile'> = categoryStationsRow?.value || {}
    setAutoPrintEnabled(autoPrintRow?.value === true)
    const map: Record<string, 'kitchen'|'nargile'> = {}
    ;(menuItems || []).forEach((mi: any) => {
      map[mi.id] = categoryStations[mi.category_id] || 'kitchen'
    })
    setItemStationMap(map)
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

  // Refs, not the state values directly - the INSERT subscription below is
  // set up once (effect only re-runs on [auth]) and its callback closure
  // would otherwise capture whatever itemStationMap/autoPrintEnabled were
  // AT SETUP TIME forever (React stale-closure trap), silently ignoring
  // every later update - including the toggle switching itself off.
  const autoPrintEnabledRef = useRef(false)
  const itemStationMapRef = useRef<Record<string, 'kitchen'|'nargile'>>({})
  const printingActivatedRef = useRef(false)
  useEffect(() => { autoPrintEnabledRef.current = autoPrintEnabled }, [autoPrintEnabled])
  useEffect(() => { itemStationMapRef.current = itemStationMap }, [itemStationMap])
  useEffect(() => { printingActivatedRef.current = printingActivated }, [printingActivated])

  useEffect(() => {
    if (!auth) return
    loadStationMap()
    loadOrders()
    const channel = supabase
      .channel('nargile-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload: any) => {
        if (payload.new.status === 'pending') {
          setOrders(prev => [...prev, payload.new])
          beep()
          // Auto-print straight to this device's RawBT-connected printer -
          // only the nargile-station items from this new order, and only
          // once per order (INSERT fires exactly once; the UPDATE handler
          // below never re-triggers a print, so marking Hazır/reconnecting
          // can't cause a reprint).
          if (autoPrintEnabledRef.current && printingActivatedRef.current) {
            const nargileItems = (payload.new.items || []).filter((it: any) => itemStationMapRef.current[it.id] === 'nargile')
            if (nargileItems.length > 0) {
              printViaRawBT(buildKitchenTicketEscPos(payload.new.table_name, [{ ...payload.new, items: nargileItems }]))
            }
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => loadOrders())
      .subscribe()
    const poll = setInterval(loadOrders, 20000)
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => { supabase.removeChannel(channel); clearInterval(poll); clearInterval(clock) }
  }, [auth])

  // Only orders that have at least one nargile-station item, showing only
  // those items (not the kitchen items that might be in the same order)
  const nargileOrders = orders
    .map(order => {
      const nargileItems = (order.items || []).filter((it: any) => itemStationMap[it.id] === 'nargile')
      return { ...order, _nargileItems: nargileItems, _isMixed: nargileItems.length > 0 && nargileItems.length < (order.items || []).length }
    })
    .filter(o => o._nargileItems.length > 0)

  if (!auth) return (
    <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <ConnectivityBanner />
      <div style={{ background: '#1A1A1A', padding: 32, width: '100%', maxWidth: 360, border: '1px solid #2A2A2A' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ color: '#C9A84C', fontSize: 10, letterSpacing: 4, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>NARGİLE EKRANI</div>
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

      {autoPrintEnabled && !printingActivated && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.94)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setPrintingActivated(true)}>
          <div style={{ textAlign: 'center', maxWidth: 340 }}>
            <div style={{ fontSize: 54, marginBottom: 18 }}>🖨️</div>
            <div style={{ color: '#F0EDE8', fontSize: 20, fontWeight: 700, fontFamily: "'Bricolage Grotesque', sans-serif", marginBottom: 10 }}>Otomatik Yazdırmayı Etkinleştir</div>
            <div style={{ color: '#8A8A8A', fontSize: 14, lineHeight: 1.6, marginBottom: 26 }}>Android'in güvenlik kuralları gereği, siparişler geldiğinde otomatik yazdırma yapabilmek için ekrana bir kez dokunmanız gerekiyor. Bu, cihaz yeniden başlatılana/sayfa yenilenene kadar geçerlidir.</div>
            <button onClick={() => setPrintingActivated(true)} style={{ width: '100%', height: 56, background: '#C9A84C', border: 'none', color: '#0A0A0A', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif" }}>Dokun ve Başlat</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ color: '#F0EDE8', fontSize: 30, fontWeight: 800, fontFamily: "'Bricolage Grotesque', sans-serif", letterSpacing: '-0.01em' }}>💨 Nargile Ekranı</div>
          <div title="Ayarlar > Otomatik Yazdırma'dan kontrol edilir" style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.05em', color: !autoPrintEnabled ? '#8A8A8A' : printingActivated ? '#5FD08C' : '#f39c12', background: !autoPrintEnabled ? 'transparent' : printingActivated ? 'rgba(39,174,96,.14)' : 'rgba(243,156,18,.14)', border: !autoPrintEnabled ? '1px solid #383838' : printingActivated ? '1px solid #27ae60' : '1px solid #f39c12' }}>
            {!autoPrintEnabled ? '🖨️ OTO YAZDIRMA KAPALI' : printingActivated ? '🖨️ OTO YAZDIRMA AKTİF' : '🖨️ DOKUNUŞ BEKLENİYOR'}
          </div>
        </div>
        <div style={{ color: '#8A8A8A', fontSize: 17, fontFamily: "'IBM Plex Mono', monospace" }}>{nargileOrders.length} bekleyen sipariş</div>
      </div>

      {nargileOrders.length === 0 && (
        <div style={{ textAlign: 'center', color: '#8A8A8A', padding: '100px 0', fontSize: 22 }}>Bekleyen sipariş yok ✓</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
        {nargileOrders.map(order => {
          const elapsedMin = Math.floor((now - new Date(order.created_at).getTime()) / 60000)
          const urgent = elapsedMin >= 10
          return (
            <div key={order.id} style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderTop: urgent ? '4px solid #C0392B' : '4px solid #9b59b6', padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                <div style={{ color: '#F0EDE8', fontSize: 30, fontWeight: 700, fontFamily: "'Bricolage Grotesque', sans-serif" }}>{order.table_name}</div>
                <div style={{ color: urgent ? '#e74c3c' : '#8A8A8A', fontSize: 17, fontFamily: "'IBM Plex Mono', monospace", fontWeight: urgent ? 700 : 500 }}>{elapsedMin} dk</div>
              </div>
              <div style={{ marginBottom: 18 }}>
                {order._nargileItems.map((item: any, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: 14, fontSize: 21, color: '#F0EDE8', padding: '7px 0', borderBottom: '1px solid rgba(240,237,232,.06)' }}>
                    <span style={{ color: '#9b59b6', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, minWidth: 36 }}>{item.quantity}×</span>
                    <span>{item.name}</span>
                  </div>
                ))}
              </div>
              {order.note && (
                <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(201,168,76,.08)', border: '1px solid rgba(201,168,76,.2)', fontSize: 16, color: '#F0EDE8' }}>📝 {order.note}</div>
              )}
              {order._isMixed && (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(243,156,18,.1)', border: '1px solid rgba(243,156,18,.3)', fontSize: 13, color: '#f39c12' }}>⚠️ Bu siparişte mutfak ürünleri de var — Hazır'a basmak tüm siparişi tamamlar.</div>
              )}
              <button onClick={() => markDone(order.id)} disabled={!isOnline} style={{ width: '100%', height: 60, background: isOnline ? '#9b59b6' : '#2A2A2A', border: 'none', color: isOnline ? '#fff' : '#666', fontSize: 18, fontWeight: 600, cursor: isOnline ? 'pointer' : 'not-allowed', fontFamily: "'IBM Plex Sans', sans-serif" }}>{isOnline ? '✓ Hazır' : '🔴 Bağlantı Yok'}</button>
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
