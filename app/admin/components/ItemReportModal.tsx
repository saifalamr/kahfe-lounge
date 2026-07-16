'use client'
import { formatTL } from '../lib/format'

export default function ItemReportModal({ itemReportRange, itemReportData, onRangeChange, customFrom, customTo, onCustomFromChange, onCustomToChange, onExportPDF, onClose }: {
  itemReportRange: 'today'|'month'|'year'|'custom'
  itemReportData: any[]
  onRangeChange: (range: 'today'|'month'|'year'|'custom') => void
  customFrom: string
  customTo: string
  onCustomFromChange: (v: string) => void
  onCustomToChange: (v: string) => void
  onExportPDF: () => void
  onClose: () => void
}) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,.9)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }} onClick={onClose}>
      <div className="kahfe-modal" onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:560, margin:'0 auto', background:'var(--a-bg2)', borderRadius:20, maxHeight:'85vh', overflowY:'auto', border:'1px solid rgba(201,168,76,.3)', boxShadow:'0 20px 60px rgba(0,0,0,.6)', animation:'modalPopIn .3s cubic-bezier(.18,.84,.26,1) both' }}>
        <div style={{ padding:'20px', borderBottom:'1px solid #2A2A2A', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
          <div style={{ color:'#C9A84C', fontWeight:700, fontSize:17, fontFamily:"'Bricolage Grotesque', sans-serif" }}>📦 Ürün Raporu</div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onExportPDF} style={{ background:'transparent', border:'1px solid #383838', height:36, padding:'0 12px', color:'#C9A84C', fontSize:12, cursor:'pointer', fontFamily:"'IBM Plex Sans', sans-serif" }}>📄 PDF</button>
            <button onClick={onClose} style={{ background:'var(--a-border)', border:'none', width:36, height:36, color:'var(--a-text2)', cursor:'pointer', fontSize:16 }}>✕</button>
          </div>
        </div>
        <div style={{ padding:20 }}>
          <div style={{ display:'flex', gap:6, marginBottom: itemReportRange === 'custom' ? 10 : 16 }}>
            {(['today','month','year','custom'] as const).map(f => (
              <button key={f} onClick={() => onRangeChange(f)}
                style={{ flex:1, height:40, background: itemReportRange===f ? 'rgba(201,168,76,.14)' : 'transparent', border: itemReportRange===f ? '1px solid #C9A84C' : '1px solid #2A2A2A', color: itemReportRange===f ? '#C9A84C' : 'var(--a-text2)', fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:"'IBM Plex Sans', sans-serif" }}>
                {f==='today'?'Bugün':f==='month'?'Bu Ay':f==='year'?'Bu Yıl':'Özel'}
              </button>
            ))}
          </div>
          {itemReportRange === 'custom' && (
            <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:16 }}>
              <input type="date" value={customFrom} onChange={e => onCustomFromChange(e.target.value)}
                style={{ flex:1, height:44, background:'var(--a-bg1)', border:'1px solid #2A2A2A', color:'var(--a-text)', padding:'0 10px', fontSize:13, fontFamily:"'IBM Plex Mono', monospace" }} />
              <span style={{ color:'var(--a-text2)', fontSize:12 }}>—</span>
              <input type="date" value={customTo} onChange={e => onCustomToChange(e.target.value)}
                style={{ flex:1, height:44, background:'var(--a-bg1)', border:'1px solid #2A2A2A', color:'var(--a-text)', padding:'0 10px', fontSize:13, fontFamily:"'IBM Plex Mono', monospace" }} />
              <button onClick={() => onRangeChange('custom')} disabled={!customFrom}
                style={{ height:44, padding:'0 16px', background: customFrom ? '#C9A84C' : 'var(--a-border)', border:'none', color: customFrom ? 'var(--a-bg0)' : '#666', fontWeight:600, fontSize:13, cursor: customFrom ? 'pointer' : 'not-allowed', fontFamily:"'IBM Plex Sans', sans-serif" }}>Uygula</button>
            </div>
          )}

          {itemReportData.length === 0 && (
            <div style={{ textAlign:'center', color:'var(--a-text2)', padding:'30px 0' }}>Bu aralıkta veri yok.</div>
          )}

          {itemReportData.map((cat: any) => (
            <div key={cat.categoryId} style={{ marginBottom: 18 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', background:'rgba(201,168,76,.08)', border:'1px solid rgba(201,168,76,.2)' }}>
                <div style={{ color:'#C9A84C', fontWeight:700, fontSize:14, fontFamily:"'Bricolage Grotesque', sans-serif" }}>{cat.icon} {cat.categoryName}</div>
                <div style={{ display:'flex', gap:14, alignItems:'center' }}>
                  <div style={{ color:'var(--a-text2)', fontSize:12, fontFamily:"'IBM Plex Mono', monospace" }}>{cat.qty} adet</div>
                  <div style={{ color:'#C9A84C', fontWeight:700, fontSize:15, fontFamily:"'IBM Plex Mono', monospace", minWidth:80, textAlign:'right' }}>₺{formatTL(cat.revenue)}</div>
                </div>
              </div>
              {cat.items.map((r: any) => (
                <div key={r.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px 10px 24px', borderBottom:'1px solid #2A2A2A' }}>
                  <div style={{ color:'var(--a-text)', fontSize:13 }}>{r.name}</div>
                  <div style={{ display:'flex', gap:16, alignItems:'center' }}>
                    <div style={{ color:'var(--a-text2)', fontSize:12, fontFamily:"'IBM Plex Mono', monospace" }}>{r.qty} adet</div>
                    <div style={{ color:'#B5B0A8', fontWeight:600, fontSize:13, fontFamily:"'IBM Plex Mono', monospace", minWidth:80, textAlign:'right' }}>₺{formatTL(r.revenue)}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
