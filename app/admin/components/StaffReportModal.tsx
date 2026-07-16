'use client'
import { formatTL } from '../lib/format'

export default function StaffReportModal({ staffReportRange, staffReportData, onRangeChange, onExportPDF, onClose }: {
  staffReportRange: 'today'|'week'|'month'
  staffReportData: any[]
  onRangeChange: (range: 'today'|'week'|'month') => void
  onExportPDF: () => void
  onClose: () => void
}) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,.9)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }} onClick={onClose}>
      <div className="kahfe-modal" onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:560, margin:'0 auto', background:'var(--a-bg2)', borderRadius:20, maxHeight:'85vh', overflowY:'auto', border:'1px solid rgba(201,168,76,.3)', boxShadow:'0 20px 60px rgba(0,0,0,.6)', animation:'modalPopIn .3s cubic-bezier(.18,.84,.26,1) both' }}>
        <div style={{ padding:'20px', borderBottom:'1px solid #2A2A2A', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
          <div style={{ color:'#C9A84C', fontWeight:700, fontSize:17, fontFamily:"'Bricolage Grotesque', sans-serif" }}>👤 Personel Performansı</div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onExportPDF} style={{ background:'transparent', border:'1px solid #383838', height:36, padding:'0 12px', color:'#C9A84C', fontSize:12, cursor:'pointer', fontFamily:"'IBM Plex Sans', sans-serif" }}>📄 PDF</button>
            <button onClick={onClose} style={{ background:'var(--a-border)', border:'none', width:36, height:36, color:'var(--a-text2)', cursor:'pointer', fontSize:16 }}>✕</button>
          </div>
        </div>
        <div style={{ padding:20 }}>
          <div style={{ display:'flex', gap:6, marginBottom:18 }}>
            {(['today','week','month'] as const).map(f => (
              <button key={f} onClick={() => onRangeChange(f)}
                style={{ flex:1, height:40, background: staffReportRange===f ? 'rgba(201,168,76,.14)' : 'transparent', border: staffReportRange===f ? '1px solid #C9A84C' : '1px solid #2A2A2A', color: staffReportRange===f ? '#C9A84C' : 'var(--a-text2)', fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:"'IBM Plex Sans', sans-serif" }}>
                {f==='today'?'Bugün':f==='week'?'Bu Hafta':'Bu Ay'}
              </button>
            ))}
          </div>

          {staffReportData.length === 0 && (
            <div style={{ textAlign:'center', color:'var(--a-text2)', padding:'30px 0' }}>Bu aralıkta veri yok.</div>
          )}

          {staffReportData.map((r: any) => (
            <div key={r.name} style={{ background:'var(--a-bg1)', border:'1px solid #2A2A2A', padding:'16px 18px', marginBottom:10 }}>
              <div style={{ color:'var(--a-text)', fontWeight:700, fontSize:17, fontFamily:"'Bricolage Grotesque', sans-serif", marginBottom:12 }}>{r.name}</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10 }}>
                <div>
                  <div style={{ color:'var(--a-text2)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>Girilen Sipariş</div>
                  <div style={{ color:'var(--a-text)', fontSize:18, fontWeight:700, fontFamily:"'IBM Plex Mono', monospace" }}>{r.ordersCreated}</div>
                </div>
                <div>
                  <div style={{ color:'var(--a-text2)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>Tamamlanan</div>
                  <div style={{ color:'var(--a-text)', fontSize:18, fontWeight:700, fontFamily:"'IBM Plex Mono', monospace" }}>{r.ordersHandled}</div>
                </div>
                <div>
                  <div style={{ color:'var(--a-text2)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>Kapatılan Masa</div>
                  <div style={{ color:'var(--a-text)', fontSize:18, fontWeight:700, fontFamily:"'IBM Plex Mono', monospace" }}>{r.tabsClosed}</div>
                </div>
                <div>
                  <div style={{ color:'var(--a-text2)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>Ciro</div>
                  <div style={{ color:'#C9A84C', fontSize:18, fontWeight:700, fontFamily:"'IBM Plex Mono', monospace" }}>₺ {formatTL(r.revenueClosed)}</div>
                </div>
                <div>
                  <div style={{ color:'var(--a-text2)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>İptal</div>
                  <div style={{ color: r.voidsCount > 0 ? '#e74c3c' : 'var(--a-text)', fontSize:18, fontWeight:700, fontFamily:"'IBM Plex Mono', monospace" }}>{r.voidsCount}</div>
                </div>
                {r.voidsCount > 0 && (
                  <div>
                    <div style={{ color:'var(--a-text2)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>İptal Tutarı</div>
                    <div style={{ color:'#e74c3c', fontSize:18, fontWeight:700, fontFamily:"'IBM Plex Mono', monospace" }}>₺ {formatTL(r.voidsAmount)}</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
