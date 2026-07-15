'use client'
import { formatTL } from '../lib/format'

export default function MonthlyReportModal({ report, onExportPDF, onClose }: {
  report: any
  onExportPDF: () => void
  onClose: () => void
}) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,.9)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }} onClick={onClose}>
      <div className="kahfe-modal" onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:560, margin:'0 auto', background:'#141414', borderRadius:20, maxHeight:'85vh', overflowY:'auto', border:'1px solid rgba(201,168,76,.3)', boxShadow:'0 20px 60px rgba(0,0,0,.6)', animation:'modalPopIn .3s cubic-bezier(.18,.84,.26,1) both' }}>
        <div style={{ padding:'18px 20px', borderBottom:'1px solid #2A2A2A', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
          <div style={{ color:'#C9A84C', fontWeight:800, fontSize:16 }}>📊 {report.title || `${report.month} ${report.year} Raporu`}</div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onExportPDF} style={{ background:'rgba(201,168,76,.15)', border:'1px solid rgba(201,168,76,.3)', borderRadius: 0, padding:'6px 10px', color:'#C9A84C', fontSize:11, cursor:'pointer', fontWeight:700, whiteSpace:'nowrap' }}>📄 PDF İndir</button>
            <button onClick={onClose} style={{ background:'#2A2A2A', border:'none', borderRadius: 0, width:30, height:30, color:'#8A8A8A', cursor:'pointer', fontSize:16 }}>✕</button>
          </div>
        </div>
        <div style={{ padding:'16px 20px' }}>
          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            <div style={{ flex:1, background:'#1A1A1A', borderRadius: 0, padding:'12px', textAlign:'center', border:'1px solid rgba(201,168,76,.2)' }}>
              <div style={{ color:'#C9A84C', fontWeight:800, fontSize:22 }}>{report.totalOrders}</div>
              <div style={{ color:'#8A8A8A', fontSize:11 }}>Sipariş</div>
            </div>
            <div style={{ flex:1, background:'#1A1A1A', borderRadius: 0, padding:'12px', textAlign:'center', border:'1px solid rgba(201,168,76,.2)' }}>
              <div style={{ color:'#C9A84C', fontWeight:800, fontSize:22 }}>{formatTL(Number(report.totalRevenue))} ₺</div>
              <div style={{ color:'#8A8A8A', fontSize:11 }}>Ciro</div>
            </div>
            <div style={{ flex:1, background:'#1A1A1A', borderRadius: 0, padding:'12px', textAlign:'center', border:'1px solid rgba(231,76,60,.25)' }}>
              <div style={{ color:'#e74c3c', fontWeight:800, fontSize:22 }}>{formatTL(Number(report.totalDebt || 0))} ₺</div>
              <div style={{ color:'#8A8A8A', fontSize:11 }}>Borç</div>
            </div>
          </div>
          <div style={{ color:'#8A8A8A', fontSize:11, letterSpacing:1, marginBottom:10 }}>EN ÇOK SATILAN ÜRÜNLER</div>
          {report.topItems?.slice(0,5).map((item:any, i:number) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #2A2A2A', fontSize:13 }}>
              <span style={{ color:'#F0EDE8' }}>#{i+1} {item.name}</span>
              <span style={{ color:'#C9A84C' }}>{item.count} adet · {item.revenue} ₺</span>
            </div>
          ))}
          {report.categoryStats?.length > 0 && (
            <>
              <div style={{ color:'#8A8A8A', fontSize:11, letterSpacing:1, margin:'16px 0 10px' }}>KATEGORİ BAZINDA CİRO</div>
              {report.categoryStats.map((c:any, i:number) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #2A2A2A', fontSize:13 }}>
                  <span style={{ color:'#F0EDE8' }}>{c.icon} {c.categoryName}</span>
                  <span style={{ color:'#C9A84C' }}>{c.qty} adet · {c.revenue} ₺</span>
                </div>
              ))}
            </>
          )}
          <div style={{ color:'#8A8A8A', fontSize:11, letterSpacing:1, margin:'16px 0 10px' }}>EN YÜKSEK CİROLU MASALAR</div>
          {report.topTables?.slice(0,5).map((t:any, i:number) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #2A2A2A', fontSize:13 }}>
              <span style={{ color:'#F0EDE8' }}>#{i+1} {t.name}</span>
              <span style={{ color:'#C9A84C' }}>{t.revenue} ₺</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
