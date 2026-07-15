'use client'
import { formatTL } from '../lib/format'

export default function DebtorDetailModal({ debtor, stats, debtPaymentAmount, onDebtPaymentAmountChange, manualDebtAmount, onManualDebtAmountChange, manualDebtNote, onManualDebtNoteChange, onRecordPayment, onAddManualDebt, onClose }: {
  debtor: { name: string, phone?: string }
  stats: { borc: number, odenen: number, kalan: number, txs: any[] }
  debtPaymentAmount: string
  onDebtPaymentAmountChange: (v: string) => void
  manualDebtAmount: string
  onManualDebtAmountChange: (v: string) => void
  manualDebtNote: string
  onManualDebtNoteChange: (v: string) => void
  onRecordPayment: () => void
  onAddManualDebt: () => void
  onClose: () => void
}) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,.9)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }} onClick={onClose}>
      <div className="kahfe-modal" onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:520, margin:'0 auto', background:'#141414', borderRadius:20, maxHeight:'85vh', overflowY:'auto', border:'1px solid rgba(201,168,76,.3)', boxShadow:'0 20px 60px rgba(0,0,0,.6)', animation:'modalPopIn .3s cubic-bezier(.18,.84,.26,1) both' }}>
        <div style={{ padding:'20px', borderBottom:'1px solid #2A2A2A', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ color:'#F0EDE8', fontWeight:700, fontSize:18, fontFamily:"'Bricolage Grotesque', sans-serif" }}>{debtor.name}</div>
            {debtor.phone && <div style={{ color:'#8A8A8A', fontSize:12, fontFamily:"'IBM Plex Mono', monospace" }}>{debtor.phone}</div>}
          </div>
          <button onClick={onClose} style={{ background:'#2A2A2A', border:'none', width:36, height:36, color:'#8A8A8A', cursor:'pointer', fontSize:16 }}>✕</button>
        </div>
        <div style={{ padding:20 }}>
          <div style={{ display:'flex', gap:10, marginBottom:20 }}>
            <div style={{ flex:1, background:'#1A1A1A', border:'1px solid #2A2A2A', padding:14, textAlign:'center' }}>
              <div style={{ color:'#8A8A8A', fontSize:11 }}>TOPLAM BORÇ</div>
              <div style={{ color:'#F0EDE8', fontWeight:800, fontSize:18, fontFamily:"'IBM Plex Mono', monospace" }}>₺{formatTL(stats.borc)}</div>
            </div>
            <div style={{ flex:1, background:'#1A1A1A', border:'1px solid #2A2A2A', padding:14, textAlign:'center' }}>
              <div style={{ color:'#8A8A8A', fontSize:11 }}>ÖDENEN</div>
              <div style={{ color:'#27ae60', fontWeight:800, fontSize:18, fontFamily:"'IBM Plex Mono', monospace" }}>₺{formatTL(stats.odenen)}</div>
            </div>
            <div style={{ flex:1, background:'#1A1A1A', border:'1px solid #2A2A2A', padding:14, textAlign:'center' }}>
              <div style={{ color:'#8A8A8A', fontSize:11 }}>KALAN</div>
              <div style={{ color: stats.kalan > 0 ? '#e74c3c' : '#8A8A8A', fontWeight:800, fontSize:18, fontFamily:"'IBM Plex Mono', monospace" }}>₺{formatTL(stats.kalan)}</div>
            </div>
          </div>

          <div style={{ display:'flex', gap:8, marginBottom:16 }}>
            <input type="number" value={debtPaymentAmount} onChange={e => onDebtPaymentAmountChange(e.target.value)} placeholder="Ödeme tutarı (₺)"
              style={{ flex:1, height:48, background:'#0A0A0A', border:'1px solid #383838', color:'#F0EDE8', padding:'0 14px', fontSize:15, fontFamily:"'IBM Plex Mono', monospace" }} />
            <button onClick={onRecordPayment} style={{ height:48, padding:'0 20px', background:'#27ae60', border:'none', color:'#fff', fontWeight:600, fontSize:14, cursor:'pointer', fontFamily:"'IBM Plex Sans', sans-serif" }}>✓ Ödeme Al</button>
          </div>

          <div style={{ display:'flex', gap:8, marginBottom:20 }}>
            <input type="number" value={manualDebtAmount} onChange={e => onManualDebtAmountChange(e.target.value)} placeholder="Manuel borç tutarı (₺)"
              style={{ flex:1, height:48, background:'#0A0A0A', border:'1px solid #383838', color:'#F0EDE8', padding:'0 14px', fontSize:15, fontFamily:"'IBM Plex Mono', monospace" }} />
            <input value={manualDebtNote} onChange={e => onManualDebtNoteChange(e.target.value)} placeholder="Not (opsiyonel)"
              style={{ flex:1, height:48, background:'#0A0A0A', border:'1px solid #383838', color:'#F0EDE8', padding:'0 14px', fontSize:14, fontFamily:"'IBM Plex Sans', sans-serif" }} />
            <button onClick={onAddManualDebt} style={{ height:48, padding:'0 16px', background:'transparent', border:'1px solid #C0392B', color:'#e74c3c', fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:"'IBM Plex Sans', sans-serif" }}>+ Borç Ekle</button>
          </div>

          <div style={{ color:'#8A8A8A', fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Hareketler</div>
          {stats.txs.length === 0 && <div style={{ color:'#8A8A8A', fontSize:13, textAlign:'center', padding:'10px 0' }}>Henüz hareket yok.</div>}
          {stats.txs.map((t: any) => (
            <div key={t.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderTop:'1px solid #2A2A2A' }}>
              <div>
                <div style={{ color: t.type === 'borç' ? '#e74c3c' : '#27ae60', fontSize:13, fontWeight:600 }}>{t.type === 'borç' ? 'Borç' : 'Ödeme'}{t.fatura_no ? ` · Fiş #${t.fatura_no}` : ''}</div>
                <div style={{ color:'#8A8A8A', fontSize:11 }}>{new Date(t.created_at).toLocaleString('tr-TR')} {t.note ? `· ${t.note}` : ''}</div>
              </div>
              <div style={{ color:'#F0EDE8', fontWeight:700, fontSize:15, fontFamily:"'IBM Plex Mono', monospace" }}>₺{formatTL(Number(t.amount))}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
