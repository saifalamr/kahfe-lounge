'use client'

export default function NotificationPopup({ notifications, onClose, onDismiss, onAccept }: {
  notifications: any[]
  onClose: () => void
  onDismiss: (id: string) => void
  onAccept: (id: string) => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="kahfe-modal" onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 60, right: 0, left: 0, margin: '0 auto', background: '#1A1A1A', borderRadius: 0, maxHeight: '80vh', overflowY: 'auto', border: '2px solid #C0392B', borderTop: 'none', boxShadow: '0 12px 40px rgba(192,57,43,.35)', animation: notifications.length > 0 ? 'alertPopIn .35s cubic-bezier(.18,.84,.26,1) both, alertGlow 1.1s ease-in-out infinite' : 'alertPopIn .35s cubic-bezier(.18,.84,.26,1) both' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #2A2A2A', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: notifications.length > 0 ? 'rgba(192,57,43,.16)' : 'transparent' }}>
          <span style={{ color: notifications.length > 0 ? '#E8756A' : '#C9A84C', fontWeight: 800, fontSize: 14, letterSpacing: 1 }}>🔴 YENİ SİPARİŞLER ({notifications.length})</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8A8A8A', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        {notifications.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#8A8A8A' }}>Bekleyen sipariş yok</div>
        ) : notifications.map((order: any) => (
          <div key={order.id} style={{ padding: '16px 18px', borderBottom: '1px solid #2A2A2A' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ background: '#C0392B', color: '#fff', borderRadius: 0, padding: '4px 10px', fontSize: 11, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.05em' }}>YENİ</span>
                <span style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 17, fontFamily: "'Bricolage Grotesque', sans-serif" }}>🪑 {order.table_name}</span>
              </div>
              <span style={{ color: '#8A8A8A', fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}>{new Date(order.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div style={{ marginBottom: 10 }}>
              {order.items.map((item: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#F0EDE8', padding: '3px 0', borderBottom: '1px solid rgba(240,237,232,.05)' }}>
                  <span><span style={{ color: '#C9A84C', fontFamily: "'IBM Plex Mono', monospace" }}>{item.quantity}×</span> {item.name}</span>
                  <span style={{ color: '#B5B0A8', fontFamily: "'IBM Plex Mono', monospace" }}>{item.subtotal} ₺</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid rgba(201,168,76,.2)' }}>
              <span style={{ color: '#C9A84C', fontWeight: 700, fontSize: 17, fontFamily: "'IBM Plex Mono', monospace" }}>₺ {order.total}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => onDismiss(order.id)} style={{ background: 'transparent', border: '1px solid #383838', borderRadius: 0, height: 40, padding: '0 14px', color: '#8A8A8A', fontSize: 13, cursor: 'pointer', fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif" }}>Kapat</button>
                <button onClick={() => onAccept(order.id)} style={{ background: '#27ae60', border: 'none', borderRadius: 0, height: 40, padding: '0 16px', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif" }}>✓ Gördüm</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
