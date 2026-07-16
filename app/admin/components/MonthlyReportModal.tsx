'use client'
import { formatTL } from '../lib/format'

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null
  const up = pct >= 0
  return (
    <span style={{ fontSize:11, fontWeight:700, color: up ? '#5FD08C' : '#e74c3c', marginLeft:6 }}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%
    </span>
  )
}

export default function MonthlyReportModal({ report, onExportPDF, onClose }: {
  report: any
  onExportPDF: () => void
  onClose: () => void
}) {
  const paymentTotal = (report.cash || 0) + (report.card || 0) + (report.transfer || 0)
  const paymentRows = [
    { label: 'Nakit', value: report.cash || 0, color: '#27ae60' },
    { label: 'Kart', value: report.card || 0, color: '#3498db' },
    { label: 'Havale', value: report.transfer || 0, color: '#9b59b6' },
  ].filter(r => r.value > 0)
  const maxHourOrders = Math.max(1, ...(report.hourlyPattern || []).map((h: any) => h.orders))
  // Only show hours that actually had any traffic across the period, not
  // all 24 — a café isn't open at 4am, no point showing an empty row for it
  const activeHours = (report.hourlyPattern || []).filter((h: any) => h.orders > 0)

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,.9)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }} onClick={onClose}>
      <div className="kahfe-modal" onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:560, margin:'0 auto', background:'var(--a-bg2)', borderRadius:20, maxHeight:'85vh', overflowY:'auto', border:'1px solid rgba(201,168,76,.3)', boxShadow:'0 20px 60px rgba(0,0,0,.6)', animation:'modalPopIn .3s cubic-bezier(.18,.84,.26,1) both' }}>
        <div style={{ padding:'18px 20px', borderBottom:'1px solid #2A2A2A', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
          <div style={{ color:'#C9A84C', fontWeight:800, fontSize:16 }}>📊 {report.title || `${report.month} ${report.year} Raporu`}</div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onExportPDF} style={{ background:'rgba(201,168,76,.15)', border:'1px solid rgba(201,168,76,.3)', borderRadius: 8, padding:'6px 10px', color:'#C9A84C', fontSize:11, cursor:'pointer', fontWeight:700, whiteSpace:'nowrap' }}>📄 PDF İndir</button>
            <button onClick={onClose} style={{ background:'var(--a-border)', border:'none', borderRadius: 8, width:30, height:30, color:'var(--a-text2)', cursor:'pointer', fontSize:16 }}>✕</button>
          </div>
        </div>
        <div style={{ padding:'16px 20px' }}>
          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            <div style={{ flex:1, background:'var(--a-bg1)', borderRadius: 8, padding:'12px', textAlign:'center', border:'1px solid rgba(201,168,76,.2)' }}>
              <div style={{ color:'#C9A84C', fontWeight:800, fontSize:22 }}>{report.totalOrders}<DeltaBadge pct={report.ordersDeltaPct} /></div>
              <div style={{ color:'var(--a-text2)', fontSize:11 }}>Sipariş</div>
            </div>
            <div style={{ flex:1, background:'var(--a-bg1)', borderRadius: 8, padding:'12px', textAlign:'center', border:'1px solid rgba(201,168,76,.2)' }}>
              <div style={{ color:'#C9A84C', fontWeight:800, fontSize:22 }}>{formatTL(Number(report.totalRevenue))} ₺<DeltaBadge pct={report.revenueDeltaPct} /></div>
              <div style={{ color:'var(--a-text2)', fontSize:11 }}>Ciro</div>
            </div>
            <div style={{ flex:1, background:'var(--a-bg1)', borderRadius: 8, padding:'12px', textAlign:'center', border:'1px solid rgba(231,76,60,.25)' }}>
              <div style={{ color:'#e74c3c', fontWeight:800, fontSize:22 }}>{formatTL(Number(report.totalDebt || 0))} ₺</div>
              <div style={{ color:'var(--a-text2)', fontSize:11 }}>Borç</div>
            </div>
          </div>

          {report.prevLabel && (report.revenueDeltaPct !== null || report.ordersDeltaPct !== null) && (
            <div style={{ color:'var(--a-text2)', fontSize:12, marginBottom:16, textAlign:'center' }}>
              {report.prevLabel} ile karşılaştırıldığında: {formatTL(Number(report.previousRevenue))} ₺ ciro, {report.previousOrders} sipariş
            </div>
          )}

          {paymentRows.length > 0 && (
            <>
              <div style={{ color:'var(--a-text2)', fontSize:11, letterSpacing:1, marginBottom:10 }}>ÖDEME YÖNTEMİ DAĞILIMI</div>
              {paymentRows.map((r, i) => {
                const pct = paymentTotal > 0 ? (r.value / paymentTotal) * 100 : 0
                return (
                  <div key={i} style={{ marginBottom:8 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4 }}>
                      <span style={{ color:'var(--a-text)' }}>{r.label}</span>
                      <span style={{ color:r.color, fontWeight:700 }}>{formatTL(r.value)} ₺ · %{pct.toFixed(0)}</span>
                    </div>
                    <div style={{ background:'var(--a-border)', height:6, borderRadius:3, overflow:'hidden' }}>
                      <div style={{ width:`${pct}%`, height:'100%', background:r.color, borderRadius:3 }} />
                    </div>
                  </div>
                )
              })}
              <div style={{ marginBottom:16 }} />
            </>
          )}

          {activeHours.length > 0 && (
            <>
              <div style={{ color:'var(--a-text2)', fontSize:11, letterSpacing:1, marginBottom:10 }}>
                SAATLİK YOĞUNLUK {report.peakHour?.orders > 0 && <span style={{ color:'#C9A84C' }}>· En yoğun saat: {String(report.peakHour.hour).padStart(2,'0')}:00</span>}
              </div>
              <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:64, marginBottom:16 }}>
                {activeHours.map((h: any, i: number) => (
                  <div key={i} title={`${String(h.hour).padStart(2,'0')}:00 — ${h.orders} sipariş`} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end', height:'100%' }}>
                    <div style={{ width:'100%', maxWidth:14, height:`${Math.max(4, (h.orders / maxHourOrders) * 48)}px`, background: h.hour === report.peakHour?.hour ? '#C9A84C' : 'rgba(201,168,76,.35)', borderRadius:'3px 3px 0 0' }} />
                    <div style={{ color:'var(--a-text2)', fontSize:8, marginTop:3 }}>{h.hour}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ color:'var(--a-text2)', fontSize:11, letterSpacing:1, marginBottom:10 }}>EN ÇOK SATILAN ÜRÜNLER</div>
          {report.topItems?.slice(0,5).map((item:any, i:number) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #2A2A2A', fontSize:13 }}>
              <span style={{ color:'var(--a-text)' }}>#{i+1} {item.name}</span>
              <span style={{ color:'#C9A84C' }}>{item.count} adet · {item.revenue} ₺</span>
            </div>
          ))}
          {report.categoryStats?.length > 0 && (
            <>
              <div style={{ color:'var(--a-text2)', fontSize:11, letterSpacing:1, margin:'16px 0 10px' }}>KATEGORİ BAZINDA CİRO</div>
              {report.categoryStats.map((c:any, i:number) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #2A2A2A', fontSize:13 }}>
                  <span style={{ color:'var(--a-text)' }}>{c.icon} {c.categoryName}</span>
                  <span style={{ color:'#C9A84C' }}>{c.qty} adet · {c.revenue} ₺</span>
                </div>
              ))}
            </>
          )}
          <div style={{ color:'var(--a-text2)', fontSize:11, letterSpacing:1, margin:'16px 0 10px' }}>EN YÜKSEK CİROLU MASALAR</div>
          {report.topTables?.slice(0,5).map((t:any, i:number) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #2A2A2A', fontSize:13 }}>
              <span style={{ color:'var(--a-text)' }}>#{i+1} {t.name}</span>
              <span style={{ color:'#C9A84C' }}>{t.revenue} ₺</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
