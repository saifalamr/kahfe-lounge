'use client'

export default function CancelOrderModal({ order, cancelReason, onReasonChange, onCancel, onConfirm }: {
  order: any
  cancelReason: string
  onReasonChange: (v: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const itemCount = (order.items || []).reduce((s: number, it: any) => s + Number(it.quantity), 0)
  return (
    <div style={{ position:'fixed', inset:0, zIndex:230, background:'rgba(0,0,0,.92)', backdropFilter:'blur(6px)', display:'flex', alignItems:'flex-end' }} onClick={onCancel}>
      <div className="kahfe-modal" onClick={e=>e.stopPropagation()} style={{ width:'100%', margin:'0 auto', background:'#141414', border:'1px solid rgba(192,57,43,.4)', borderBottom:'none' }}>
        <div style={{ padding:'20px', borderBottom:'1px solid #2A2A2A' }}>
          <div style={{ color:'#e74c3c', fontWeight:700, fontSize:17, fontFamily:"'Bricolage Grotesque', sans-serif" }}>🚫 Siparişi İptal Et</div>
          <div style={{ color:'#8A8A8A', fontSize:13, marginTop:4, fontFamily:"'IBM Plex Mono', monospace" }}>{itemCount} ürün — {order.table_name} — ₺{order.total}</div>
        </div>
        <div style={{ padding:20 }}>
          <div style={{ color:'#8A8A8A', fontSize:12, marginBottom:16 }}>Bu, siparişteki tüm ürünleri tek seferde iptal eder (tek tek silmek yerine). İşlem geri alınamaz.</div>
          <label style={{ color:'#8A8A8A', fontSize:12, display:'block', marginBottom:8, fontFamily:"'IBM Plex Mono', monospace", letterSpacing:'0.08em' }}>İPTAL NEDENİ</label>
          <input value={cancelReason} onChange={e => onReasonChange(e.target.value)} placeholder="Örn. Müşteri vazgeçti, yanlış masa..."
            onKeyDown={e => e.key === 'Enter' && onConfirm()}
            autoFocus
            style={{ width:'100%', height:52, background:'#0A0A0A', border:'1px solid #383838', color:'#F0EDE8', padding:'0 14px', fontSize:15, marginBottom:16, outline:'none', fontFamily:"'IBM Plex Sans', sans-serif" }} />
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onCancel} style={{ flex:1, height:48, background:'transparent', border:'1px solid #383838', color:'#8A8A8A', fontSize:14, cursor:'pointer', fontFamily:"'IBM Plex Sans', sans-serif" }}>Vazgeç</button>
            <button onClick={onConfirm} style={{ flex:1, height:48, background:'#C0392B', border:'none', color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:"'IBM Plex Sans', sans-serif" }}>Siparişi İptal Et</button>
          </div>
        </div>
      </div>
    </div>
  )
}
