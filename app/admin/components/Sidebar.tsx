'use client'
import { formatTL } from '../lib/format'

export default function Sidebar({
  isManager, tab, setTab, reportsSubTab, setReportsSubTab,
  notifCount, todayRevenue, theme, setTheme, clearSession,
  activeShift, isLimitedStaff, openCashMovement, openShiftClose, startShift,
  loadOrders, dateFilter, loadDebtTransactions, loadSuppliers, searchReceipts, searchAccountability,
  showNotif, setShowNotif, newOrderAlert, setNewOrderAlert, queuedCount, realtimeUp,
}: any) {
  function go(t: string) {
    setTab(t)
    if (t === 'orders') loadOrders(dateFilter)
    if (t === 'debts') loadDebtTransactions()
    if (t === 'suppliers') loadSuppliers()
    if (t === 'reports' && reportsSubTab === 'receipts') searchReceipts()
    if (t === 'reports' && reportsSubTab === 'accountability') searchAccountability()
  }

  // Same three clusters as the mobile tab bar, just laid out vertically
  // with icon + label instead of squeezed into a horizontal strip.
  const groups = isManager
    ? [
        { label: 'OPERASYON', items: [['orders', '🍽️', 'Siparişler']] },
        { label: 'YÖNETİM', items: [['categories', '📋', 'Kategoriler'], ['items', '🍹', 'Ürünler'], ['staff', '👥', 'Personel'], ['suppliers', '🚚', 'Tedarikçiler'], ['settings', '⚙️', 'Ayarlar']] },
        { label: 'FİNANS', items: [['debts', '💳', 'Borç'], ['reports', '📊', 'Raporlar']] },
      ]
    : [{ label: '', items: [['orders', '🍽️', 'Siparişler']] }]

  const isActive = (t: string) => tab === t || (t === 'reports' && (tab === 'receipts' || tab === 'accountability'))

  return (
    <aside className="kahfe-sidebar" style={{ flexDirection: 'column', width: 232, minWidth: 232, background: 'var(--a-bg1)', borderRight: '1px solid var(--a-border)', padding: '20px 14px', position: 'sticky', top: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, padding: '0 6px' }}>
        <div>
          <div style={{ color: '#C9A84C', fontSize: 10, letterSpacing: 3, fontFamily: "'IBM Plex Mono', monospace" }}>YÖNETİM</div>
          <div style={{ color: 'var(--a-text)', fontSize: 18, fontWeight: 800, fontFamily: "'Bricolage Grotesque', sans-serif", letterSpacing: '-0.01em' }}>KAHFE LOUNGE</div>
          {todayRevenue !== null && (
            <div style={{ color: 'var(--a-text2)', fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", marginTop: 4 }}>
              Bugün: <span style={{ color: '#5FD08C', fontWeight: 700 }}>₺{formatTL(todayRevenue.revenue)}</span>
            </div>
          )}
          <div title={realtimeUp ? 'Canlı bağlantı aktif — siparişler anında geliyor' : 'Canlı bağlantı yok — siparişler ~15 sn gecikmeyle gelebilir'}
            style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: realtimeUp ? '#5FD08C' : '#f39c12' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: realtimeUp ? '#5FD08C' : '#f39c12', boxShadow: realtimeUp ? '0 0 5px #5FD08C' : 'none', animation: realtimeUp ? 'none' : 'bellShake 1s ease infinite' }} />
            {realtimeUp ? 'Canlı' : 'Bağlantı yok'}
          </div>
        </div>
        <button onClick={() => { setShowNotif(!showNotif); setNewOrderAlert(false) }}
          style={{ position: 'relative', background: newOrderAlert ? 'rgba(192,57,43,.2)' : 'var(--a-border)', border: newOrderAlert ? '1px solid #C0392B' : '1px solid var(--a-border2)', borderRadius: 8, width: 34, height: 34, minWidth: 34, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, animation: newOrderAlert ? 'bellShake .5s ease infinite' : 'none' }}>
          🔔
          {notifCount > 0 && (
            <span style={{ position: 'absolute', top: -4, right: -4, background: '#C0392B', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{notifCount}</span>
          )}
        </button>
      </div>

      {queuedCount > 0 && (
        <div title="Bağlantı bekleyen sipariş(ler)" style={{ background: 'rgba(243,156,18,.14)', border: '1px solid #f39c12', borderRadius: 8, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6, color: '#f39c12', fontSize: 11, fontWeight: 700, marginBottom: 14 }}>
          📥 {queuedCount} bekleyen sipariş
        </div>
      )}

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {groups.map((g, gi) => (
          <div key={gi} style={{ marginBottom: 14 }}>
            {g.label && <div style={{ color: 'var(--a-text3)', fontSize: 10, letterSpacing: '0.1em', fontFamily: "'IBM Plex Mono', monospace", padding: '0 10px', marginBottom: 6 }}>{g.label}</div>}
            {g.items.map(([t, icon, label]: any) => (
              <button key={t} onClick={() => go(t)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px', background: isActive(t) ? 'rgba(201,168,76,.14)' : 'transparent', border: isActive(t) ? '1px solid rgba(201,168,76,.4)' : '1px solid transparent', borderRadius: 8, color: isActive(t) ? '#C9A84C' : 'var(--a-text2)', fontWeight: isActive(t) ? 700 : 500, fontSize: 13, cursor: 'pointer', marginBottom: 3, position: 'relative' }}>
                <span style={{ fontSize: 16 }}>{icon}</span>
                <span style={{ flex: 1 }}>{label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div style={{ borderTop: '1px solid var(--a-border)', paddingTop: 14, marginTop: 'auto' }}>
        <div style={{ padding: '0 10px', marginBottom: 10 }}>
          {activeShift ? (
            <div style={{ color: 'var(--a-text2)', fontSize: 11, marginBottom: 6 }}>
              <span style={{ color: '#5FD08C', fontWeight: 700 }}>⏱ {activeShift.staff_name}</span>
            </div>
          ) : (
            <div style={{ color: 'var(--a-text2)', fontSize: 11, marginBottom: 6 }}>Aktif vardiya yok</div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {!isLimitedStaff && (
              <button onClick={openCashMovement} style={{ height: 30, padding: '0 8px', background: 'transparent', border: '1px solid var(--a-border2)', color: '#C9A84C', fontSize: 11, cursor: 'pointer', fontWeight: 600, borderRadius: 6 }}>💰 Kasa</button>
            )}
            {activeShift ? (
              <button onClick={openShiftClose} style={{ height: 30, padding: '0 8px', background: 'transparent', border: '1px solid var(--a-border2)', color: '#e74c3c', fontSize: 11, cursor: 'pointer', fontWeight: 600, borderRadius: 6 }}>⏹ Bitir</button>
            ) : (
              <button onClick={startShift} style={{ height: 30, padding: '0 8px', background: 'rgba(201,168,76,.14)', border: '1px solid #C9A84C', color: '#C9A84C', fontSize: 11, cursor: 'pointer', fontWeight: 600, borderRadius: 6 }}>▶ Başlat</button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '0 10px', marginBottom: 10 }}>
          <a href="/kitchen" target="_blank" rel="noopener noreferrer" title="Mutfak Ekranı" style={{ flex: 1, height: 34, background: 'var(--a-border)', border: '1px solid var(--a-border2)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, textDecoration: 'none' }}>🍳</a>
          <a href="/nargile" target="_blank" rel="noopener noreferrer" title="Nargile Ekranı" style={{ flex: 1, height: 34, background: 'var(--a-border)', border: '1px solid var(--a-border2)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, textDecoration: 'none' }}>💨</a>
          <button onClick={() => setTheme((t: string) => t === 'dark' ? 'light' : 'dark')} title="Görünümü Değiştir" style={{ flex: 1, height: 34, background: 'transparent', border: '1px solid var(--a-border)', borderRadius: 6, color: 'var(--a-text2)', fontSize: 14, cursor: 'pointer' }}>{theme === 'dark' ? '☀️' : '🌙'}</button>
        </div>

        <button onClick={clearSession} style={{ width: '100%', height: 36, background: 'transparent', border: '1px solid var(--a-border)', borderRadius: 8, color: 'var(--a-text2)', fontSize: 12, cursor: 'pointer' }}>Çıkış</button>
      </div>
    </aside>
  )
}
