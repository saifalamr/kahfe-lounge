'use client'
import { formatTL } from '../lib/format'

export default function DayCloseModal({ dayCloseData, countedCash, onCountedCashChange, onSave, onExportPDF, onClose }: {
  dayCloseData: any
  countedCash: string
  onCountedCashChange: (v: string) => void
  onSave: () => void
  onExportPDF: () => void
  onClose: () => void
}) {
  const counted = parseFloat(countedCash)
  const diff = isNaN(counted) ? null : (counted - dayCloseData.cashTotal)

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,.9)', backdropFilter:'blur(6px)', display:'flex', alignItems:'flex-end' }} onClick={onClose}>
      <div className="kahfe-modal" onClick={e=>e.stopPropagation()} style={{ width:'100%', margin:'0 auto', background:'#141414', borderRadius: 0, maxHeight:'85vh', overflowY:'auto', border:'1px solid rgba(52,152,219,.3)', borderBottom:'none' }}>
        <div style={{ padding:'18px 20px', borderBottom:'1px solid #2A2A2A', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
          <div style={{ color:'#3498db', fontWeight:800, fontSize:16 }}>🌙 Gün Sonu</div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onExportPDF} style={{ background:'rgba(201,168,76,.15)', border:'1px solid rgba(201,168,76,.3)', borderRadius: 0, padding:'6px 10px', color:'#C9A84C', fontSize:11, cursor:'pointer', fontWeight:700, whiteSpace:'nowrap' }}>📄 PDF İndir</button>
            <button onClick={onClose} style={{ background:'#2A2A2A', border:'none', borderRadius: 0, width:30, height:30, color:'#8A8A8A', cursor:'pointer', fontSize:16 }}>✕</button>
          </div>
        </div>
        <div style={{ padding:'20px' }}>
          <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
            <div style={{ flex:'1 1 45%', background:'#1A1A1A', border:'1px solid #2A2A2A', borderRadius: 0, padding:14, textAlign:'center' }}>
              <div style={{ color:'#8A8A8A', fontSize:11 }}>KAPANAN MASA</div>
              <div style={{ color:'#F0EDE8', fontWeight:800, fontSize:20 }}>{dayCloseData.tabCount}</div>
            </div>
            <div style={{ flex:'1 1 45%', background:'#1A1A1A', border:'1px solid #2A2A2A', borderRadius: 0, padding:14, textAlign:'center' }}>
              <div style={{ color:'#8A8A8A', fontSize:11 }}>TOPLAM CİRO</div>
              <div style={{ color:'#C9A84C', fontWeight:800, fontSize:20 }}>{formatTL(dayCloseData.totalRevenue)} ₺</div>
            </div>
            <div style={{ flex:'1 1 45%', background:'#1A1A1A', border:'1px solid #2A2A2A', borderRadius: 0, padding:14, textAlign:'center' }}>
              <div style={{ color:'#8A8A8A', fontSize:11 }}>💵 NAKİT</div>
              <div style={{ color:'#F0EDE8', fontWeight:800, fontSize:18 }}>{formatTL(dayCloseData.cashTotal)} ₺</div>
            </div>
            <div style={{ flex:'1 1 45%', background:'#1A1A1A', border:'1px solid #2A2A2A', borderRadius: 0, padding:14, textAlign:'center' }}>
              <div style={{ color:'#8A8A8A', fontSize:11 }}>💳 KART</div>
              <div style={{ color:'#F0EDE8', fontWeight:800, fontSize:18 }}>{formatTL(dayCloseData.cardTotal)} ₺</div>
            </div>
            <div style={{ flex:'1 1 45%', background:'#1A1A1A', border:'1px solid #2A2A2A', borderRadius: 0, padding:14, textAlign:'center' }}>
              <div style={{ color:'#8A8A8A', fontSize:11 }}>🏦 HAVALE</div>
              <div style={{ color:'#F0EDE8', fontWeight:800, fontSize:18 }}>{formatTL(dayCloseData.transferTotal || 0)} ₺</div>
            </div>
            <div style={{ flex:'1 1 45%', background:'#1A1A1A', border:'1px solid rgba(231,76,60,.25)', borderRadius: 0, padding:14, textAlign:'center' }}>
              <div style={{ color:'#8A8A8A', fontSize:11 }}>🧾 BORÇ</div>
              <div style={{ color:'#e74c3c', fontWeight:800, fontSize:18 }}>{formatTL(dayCloseData.debtTotal || 0)} ₺</div>
            </div>
            {dayCloseData.discountTotal > 0 && (
              <div style={{ flex:'1 1 45%', background:'#1A1A1A', border:'1px solid #2A2A2A', borderRadius: 0, padding:14, textAlign:'center' }}>
                <div style={{ color:'#8A8A8A', fontSize:11 }}>🏷️ İNDİRİM</div>
                <div style={{ color:'#e74c3c', fontWeight:800, fontSize:18 }}>{formatTL(dayCloseData.discountTotal)} ₺</div>
              </div>
            )}
          </div>

          <label style={{ color:'#8A8A8A', fontSize:11, display:'block', marginBottom:6 }}>KASADAKİ SAYILAN NAKİT (₺)</label>
          <input type="number" value={countedCash} onChange={e => onCountedCashChange(e.target.value)} placeholder="Örn. 3450"
            style={{ width:'100%', background:'#1A1A1A', border:'1px solid #2A2A2A', borderRadius: 0, padding:'12px', color:'#F0EDE8', fontSize:16, marginBottom:10 }} />

          {diff !== null && (
            <div style={{ textAlign:'center', padding:'10px', marginBottom:16, borderRadius: 0, background: diff===0 ? 'rgba(39,174,96,.1)' : diff>0 ? 'rgba(52,152,219,.1)' : 'rgba(192,57,43,.1)', border:`1px solid ${diff===0 ? 'rgba(39,174,96,.3)' : diff>0 ? 'rgba(52,152,219,.3)' : 'rgba(192,57,43,.3)'}` }}>
              <span style={{ color: diff===0 ? '#27ae60' : diff>0 ? '#3498db' : '#e74c3c', fontWeight:800, fontSize:14 }}>
                {diff===0 ? '✓ Kasa tam uyuyor' : diff>0 ? `Kasada ${formatTL(diff)} ₺ fazla var` : `Kasada ${formatTL(Math.abs(diff))} ₺ eksik var`}
              </span>
            </div>
          )}

          <button onClick={onSave} style={{ width:'100%', background:'#3498db', border:'none', borderRadius: 0, padding:14, color:'#fff', fontSize:14, cursor:'pointer', fontWeight:800 }}>✓ Gün Sonunu Kaydet</button>
          <div style={{ color:'#666', fontSize:10, marginTop:10, textAlign:'center' }}>Bu, bugün ödemesi alınıp kapatılmış masaları özetler. Henüz kapatılmamış açık masalar dahil değildir.</div>
        </div>
      </div>
    </div>
  )
}
