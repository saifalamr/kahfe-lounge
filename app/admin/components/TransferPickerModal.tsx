'use client'

export default function TransferPickerModal({ sourceTable, allTables, getTableInfo, onTransfer, onClose }: {
  sourceTable: string
  allTables: string[]
  getTableInfo: (tableName: string) => { status: 'empty'|'pending'|'bill'|'occupied', tabData: any, orders: any[] }
  onTransfer: (source: string, dest: string) => void
  onClose: () => void
}) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:225, background:'rgba(0,0,0,.92)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }} onClick={onClose}>
      <div className="kahfe-modal" onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:520, margin:'0 auto', background:'#141414', borderRadius:20, maxHeight:'80vh', overflowY:'auto', border:'1px solid rgba(201,168,76,.3)', boxShadow:'0 20px 60px rgba(0,0,0,.6)', animation:'modalPopIn .3s cubic-bezier(.18,.84,.26,1) both' }}>
        <div style={{ padding:'20px', borderBottom:'1px solid #2A2A2A', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ color:'#F0EDE8', fontWeight:700, fontSize:17, fontFamily:"'Bricolage Grotesque', sans-serif" }}>🔀 {sourceTable} — Nereye?</div>
          <button onClick={onClose} style={{ background:'#2A2A2A', border:'none', width:36, height:36, color:'#8A8A8A', cursor:'pointer', fontSize:16 }}>✕</button>
        </div>
        <div style={{ padding:20 }}>
          <div style={{ color:'#8A8A8A', fontSize:12, marginBottom:16 }}>Boş bir masaya taşınır. Dolu bir masa seçilirse, iki adisyon birleştirilir.</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(96px, 1fr))', gap:8 }}>
            {allTables.filter(t => t !== sourceTable).map(t => {
              const info = getTableInfo(t)
              const isEmpty = info.status === 'empty'
              return (
                <button key={t} onClick={() => onTransfer(sourceTable, t)}
                  style={{ background: isEmpty ? '#161616' : '#221E12', border: isEmpty ? '1px solid #2A2A2A' : '1px solid rgba(201,168,76,.5)', borderRadius: 0, padding:'10px 8px', cursor:'pointer', textAlign:'left' }}>
                  <div style={{ color:'#F0EDE8', fontWeight:700, fontSize:14, fontFamily:"'Bricolage Grotesque', sans-serif" }}>{t}</div>
                  <div style={{ color: isEmpty ? '#6E6E6E' : '#C9A84C', fontSize:10, fontFamily:"'IBM Plex Mono', monospace", textTransform:'uppercase', marginTop:4 }}>{isEmpty ? 'Boş' : 'Birleştir'}</div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
