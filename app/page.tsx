'use client'
import { useEffect, useState, useMemo, useRef, useLayoutEffect } from 'react'
import { supabase, Category, MenuItem } from '@/lib/supabase'

type CartMap = Record<string, number>
type Line = MenuItem & { qty: number }

const fmt = (p: number) => `${p} ₺`

const Icon = ({ size = 22, stroke = 1.6, children }: { size?: number; stroke?: number; children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
const IconPlus      = (p: any) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
const IconMinus     = (p: any) => <Icon {...p}><path d="M5 12h14" /></Icon>
const IconClose     = (p: any) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>
const IconPhone     = (p: any) => <Icon {...p}><path d="M5 4h3l1.5 4-2 1.4a11 11 0 0 0 5.1 5.1l1.4-2 4 1.5V18a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4 6.2 2 2 0 0 1 5 4Z" /></Icon>
const IconPin       = (p: any) => <Icon {...p}><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" /><circle cx="12" cy="10" r="2.6" /></Icon>
const IconClock     = (p: any) => <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></Icon>
const IconInstagram = (p: any) => <Icon {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" /></Icon>
const IconWhatsapp  = (p: any) => <Icon {...p}><path d="M4 20l1.3-3.9A7.5 7.5 0 1 1 8 19l-4 1Z" /><path d="M9 9c.2 2.6 3.4 5.8 6 6 .9.1 1.4-.6 1.7-1.2.1-.3 0-.5-.2-.6l-1.7-.8c-.2-.1-.5 0-.6.2l-.4.6c-1.2-.4-2.2-1.4-2.6-2.6l.6-.4c.2-.1.3-.4.2-.6L11.4 7c-.1-.2-.3-.3-.6-.2C10.1 7.1 8.9 7.7 9 9Z" fill="currentColor" stroke="none" /></Icon>
const IconMap       = (p: any) => <Icon {...p}><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" /></Icon>

function KImg({ label, src, h = 160, rounded = 0 }: { label: string; src?: string; h?: number; rounded?: number }) {
  if (src) return <img src={src} alt={label} style={{ width: '100%', height: h, objectFit: 'cover', borderRadius: rounded, display: 'block' }} />
  return (
    <div style={{ position: 'relative', overflow: 'hidden', width: '100%', height: h, borderRadius: rounded, background: '#161310' }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundImage: 'repeating-linear-gradient(135deg,rgba(192,57,43,.045) 0 1px,transparent 1px 12px),radial-gradient(120% 90% at 50% 0%,rgba(192,57,43,.07),rgba(23,19,15,0) 62%)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '0 14px' }}>
          <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(240,237,232,.34)', textAlign: 'center' }}>{label}</span>
          <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 7.5, letterSpacing: '.22em', textTransform: 'uppercase', color: 'rgba(192,57,43,.42)' }}>menü görseli</span>
        </div>
      </div>
    </div>
  )
}

function Hero({ lang, onLangChange }: { lang: string; onLangChange: (l: 'tr'|'en'|'ar') => void }) {
  return (
    <header style={{ position: 'relative', overflow: 'hidden', textAlign: 'center', padding: '52px 24px 36px' }}>

      {/* layered background glows */}
      <div style={{ position:'absolute', inset:0, pointerEvents:'none',
        background:'radial-gradient(ellipse 80% 55% at 50% 0%, rgba(201,168,76,.13) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 50% 100%, rgba(192,57,43,.07) 0%, transparent 70%)',
        animation:'heroGlow 16s ease-in-out infinite alternate' }} />

      {/* top corner ornaments */}
      <div style={{ position:'absolute', top:14, left:14, width:28, height:28, pointerEvents:'none' }}>
        <span style={{ position:'absolute', top:0, left:0, width:14, height:1.5, background:'#C9A84C', display:'block', opacity:.5 }}/>
        <span style={{ position:'absolute', top:0, left:0, width:1.5, height:14, background:'#C9A84C', display:'block', opacity:.5 }}/>
      </div>
      <div style={{ position:'absolute', top:14, right:14, width:28, height:28, pointerEvents:'none' }}>
        <span style={{ position:'absolute', top:0, right:0, width:14, height:1.5, background:'#C9A84C', display:'block', opacity:.5 }}/>
        <span style={{ position:'absolute', top:0, right:0, width:1.5, height:14, background:'#C9A84C', display:'block', opacity:.5 }}/>
      </div>
      <div style={{ position:'absolute', bottom:14, left:14, width:28, height:28, pointerEvents:'none' }}>
        <span style={{ position:'absolute', bottom:0, left:0, width:14, height:1.5, background:'#C9A84C', display:'block', opacity:.5 }}/>
        <span style={{ position:'absolute', bottom:0, left:0, width:1.5, height:14, background:'#C9A84C', display:'block', opacity:.5 }}/>
      </div>
      <div style={{ position:'absolute', bottom:14, right:14, width:28, height:28, pointerEvents:'none' }}>
        <span style={{ position:'absolute', bottom:0, right:0, width:14, height:1.5, background:'#C9A84C', display:'block', opacity:.5 }}/>
        <span style={{ position:'absolute', bottom:0, right:0, width:1.5, height:14, background:'#C9A84C', display:'block', opacity:.5 }}/>
      </div>

      <div style={{ position:'relative', zIndex:1 }}>

        {/* logo with gold glow ring */}
        <div style={{ position:'relative', display:'inline-block', animation:'logoIn .9s .1s both' }}>
          <div style={{ position:'absolute', inset:-12, borderRadius:'50%', background:'radial-gradient(circle, rgba(201,168,76,.12) 0%, transparent 70%)', pointerEvents:'none' }}/>
          <img src="/kahfe-logo.png" alt="Kahfe Lounge"
            style={{ width:'82%', maxWidth:300, height:'auto', display:'block', margin:'0 auto', filter:'drop-shadow(0 4px 24px rgba(201,168,76,.18))' }} />
        </div>

        {/* elegant wide divider */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, margin:'20px auto 14px', animation:'logoIn .9s .2s both' }}>
          <span style={{ flex:1, maxWidth:60, height:1, background:'linear-gradient(90deg,transparent,rgba(201,168,76,.4))' }}/>
          <span style={{ display:'flex', gap:5, alignItems:'center' }}>
            <span style={{ width:3, height:3, background:'rgba(201,168,76,.4)', borderRadius:'50%', display:'block' }}/>
            <span style={{ width:5, height:5, background:'#C0392B', transform:'rotate(45deg)', display:'block' }}/>
            <span style={{ width:3, height:3, background:'rgba(201,168,76,.4)', borderRadius:'50%', display:'block' }}/>
          </span>
          <span style={{ flex:1, maxWidth:60, height:1, background:'linear-gradient(90deg,rgba(201,168,76,.4),transparent)' }}/>
        </div>

        {/* tagline */}
        <p style={{ fontFamily:'var(--serif)', fontStyle:'italic', fontWeight:500, fontSize:14, color:'rgba(240,237,232,.55)', margin:'0 0 20px', letterSpacing:'.04em', animation:'logoIn .9s .28s both' }}>
          {lang==='en'?'The Address of Taste & Peace':lang==='ar'?'عنوان الذوق والراحة':'Lezzetin ve Huzurun Adresi'}
        </p>

        {/* lang switcher - pill style */}
        <div style={{ display:'inline-flex', background:'rgba(240,237,232,.06)', border:'1px solid rgba(240,237,232,.1)', borderRadius:30, padding:3, gap:2, animation:'logoIn .9s .35s both' }}>
          {(['tr','en','ar'] as const).map(l => (
            <button key={l} onClick={() => onLangChange(l)}
              style={{ background: lang===l ? '#C9A84C' : 'transparent', border:'none', borderRadius:24, padding:'6px 18px', color: lang===l ? '#1A0E06' : 'rgba(240,237,232,.45)', fontSize:11, fontWeight:800, cursor:'pointer', letterSpacing:1.5, transition:'all .25s' }}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>

      </div>

      {/* bottom border with center gem */}
      <div style={{ position:'absolute', bottom:0, left:24, right:24, height:1, background:'linear-gradient(90deg,transparent,rgba(201,168,76,.2),rgba(192,57,43,.15),rgba(201,168,76,.2),transparent)' }}/>

    </header>
  )
}

function TabBar({ cats, active, onChange, lang }: { cats: Category[]; active: string; onChange: (id: string) => void; lang: string }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<number>(0)
  const posRef = useRef(0)
  const pausedRef = useRef(false)
  const totalWRef = useRef(0)
  const dragRef = useRef({ dragging: false, startX: 0, startPos: 0 })
  const SPEED = 0.4

  useEffect(() => {
    const track = trackRef.current
    if (!track || cats.length === 0) return

    posRef.current = 0
    track.style.transform = `translateX(0px)`

    // measure the single-set width after render settles
    const measure = () => { totalWRef.current = track.scrollWidth / 2 }
    measure()
    const measureTimer = setTimeout(measure, 100)
    const measureTimer2 = setTimeout(measure, 400)

    const tick = () => {
      const totalW = totalWRef.current
      if (!pausedRef.current && totalW > 0) {
        const dir = lang === 'ar' ? -1 : 1
        posRef.current += SPEED * dir
        if (posRef.current >= totalW) posRef.current -= totalW
        if (posRef.current < 0) posRef.current += totalW
        track.style.transform = `translateX(-${posRef.current}px)`
      }
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(animRef.current); clearTimeout(measureTimer); clearTimeout(measureTimer2) }
  }, [cats, lang])

  function handleClick(id: string) {
    if (dragRef.current.dragging) return
    pausedRef.current = true
    onChange(id)
    setTimeout(() => { pausedRef.current = false }, 2500)
  }

  function applyDrag(dx: number) {
    const track = trackRef.current
    const totalW = totalWRef.current
    if (!track || totalW <= 0) return
    let newPos = dragRef.current.startPos + dx
    newPos = ((newPos % totalW) + totalW) % totalW
    posRef.current = newPos
    track.style.transform = `translateX(-${newPos}px)`
  }

  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { dragging: false, startX: e.clientX, startPos: posRef.current }
    pausedRef.current = true
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!pausedRef.current) return
    const dx = dragRef.current.startX - e.clientX
    if (Math.abs(dx) > 3) dragRef.current.dragging = true
    applyDrag(dx)
  }
  function onMouseUp() {
    setTimeout(() => { dragRef.current.dragging = false; pausedRef.current = false }, 300)
  }
  function onTouchStart(e: React.TouchEvent) {
    dragRef.current = { dragging: false, startX: e.touches[0].clientX, startPos: posRef.current }
    pausedRef.current = true
  }
  function onTouchMove(e: React.TouchEvent) {
    const dx = dragRef.current.startX - e.touches[0].clientX
    if (Math.abs(dx) > 3) dragRef.current.dragging = true
    applyDrag(dx)
  }
  function onTouchEnd() {
    setTimeout(() => { dragRef.current.dragging = false; pausedRef.current = false }, 300)
  }

  const doubled = [...cats, ...cats]

  return (
    <div dir="ltr" style={{ position: 'sticky', top: 0, zIndex: 5, background: 'rgba(13,13,13,.95)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(240,237,232,.06)', overflow: 'hidden', cursor: 'grab', userSelect: 'none' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}>
      <div dir="ltr" style={{ position: 'relative', padding: '11px 0 13px', display: 'flex', width: 'max-content' }} ref={trackRef}>
        {doubled.map((c, i) => {
          const displayName = lang==='en' ? (c.name_en||c.name) : lang==='ar' ? (c.name_ar||c.name) : c.name
          return (
          <button key={`${c.id}-${i}`} data-cat={c.id} onClick={() => handleClick(c.id)}
            style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 600, letterSpacing: '.02em', color: active === c.id ? '#C9A84C' : 'rgba(240,237,232,.42)', padding: '6px 14px', transition: 'color .25s', position: 'relative' }}>
            {c.icon && <span style={{ marginRight: 4 }}>{c.icon}</span>}{displayName || c.name}
            {active === c.id && <span style={{ position: 'absolute', bottom: -4, left: '14px', right: '14px', height: 2, borderRadius: 2, background: '#C9A84C', boxShadow: '0 0 8px rgba(201,168,76,.45)', display: 'block' }} />}
          </button>
        )})}
      </div>
    </div>
  )
}

function QtyPill({ qty, onDec, onInc, size = 'md' }: { qty: number; onDec: () => void; onInc: () => void; size?: 'sm'|'md'|'lg' }) {
  const dim = { sm:{h:34,btn:30,num:13}, md:{h:40,btn:36,num:15}, lg:{h:50,btn:46,num:17} }[size]
  return (
    <div onClick={e=>e.stopPropagation()} style={{ display:'inline-flex', alignItems:'center', background:'#0e0e0e', border:'1px solid rgba(240,237,232,.09)', borderRadius:999, height:dim.h }}>
      <button onClick={onDec} style={{ appearance:'none', border:'none', background:'transparent', color:'#d8b25a', display:'grid', placeItems:'center', cursor:'pointer', borderRadius:'50%', width:dim.btn, height:dim.btn }}><IconMinus size={16} stroke={2}/></button>
      <span style={{ fontFamily:'var(--sans)', fontWeight:600, color:'#F0EDE8', textAlign:'center', minWidth:dim.num+5, fontSize:dim.num }}>{qty}</span>
      <button onClick={onInc} style={{ appearance:'none', border:'none', background:'transparent', color:'#d8b25a', display:'grid', placeItems:'center', cursor:'pointer', borderRadius:'50%', width:dim.btn, height:dim.btn }}><IconPlus size={16} stroke={2}/></button>
    </div>
  )
}

function MenuCard({ item, qty, index, onOpen, onAdd, onInc, onDec, lang }: { item:MenuItem; qty:number; index:number; onOpen:()=>void; onAdd:()=>void; onInc:()=>void; onDec:()=>void; lang:string }) {
  return (
    <article onClick={onOpen} className='corner-card' style={{ position:'relative', background:'#1A1A1A', borderRadius:18, overflow:'hidden', cursor:'pointer', border:'1px solid rgba(240,237,232,.05)', animation:'fadeUp .55s both', animationDelay:`${Math.min(index,8)*55}ms`, transition:'transform .28s ease,box-shadow .35s ease,border-color .35s ease' }}
      onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(-3px)';el.style.borderColor='rgba(192,57,43,.45)';el.style.boxShadow='0 0 0 1px rgba(192,57,43,.25),0 14px 30px rgba(0,0,0,.45)'}}
      onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(0)';el.style.borderColor='rgba(240,237,232,.05)';el.style.boxShadow='none'}}>
      <div style={{ overflow:'hidden' }}><KImg label={item.name} src={item.image_url||''} h={160}/></div>
      <div style={{ padding:'12px 13px 13px' }}>
        <h3 style={{ fontFamily:'var(--sans)', fontWeight:600, fontSize:14.5, lineHeight:1.28, margin:0, color:'#F0EDE8', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden', minHeight:'2.56em' }}>{lang==='en'?(item.name_en||item.name):lang==='ar'?(item.name_ar||item.name):item.name}</h3>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginTop:11 }}>
          <span style={{ fontFamily:'var(--sans)', fontWeight:700, fontSize:16, color:'#C9A84C', letterSpacing:'.01em' }}>{fmt(item.price)}</span>
          {qty>0
            ? <QtyPill qty={qty} onDec={onDec} onInc={onInc} size="sm"/>
            : <button onClick={e=>{e.stopPropagation();onAdd()}} style={{ appearance:'none', border:'1px solid #C9A84C', background:'#C9A84C', color:'#1A0E06', fontFamily:'var(--sans)', fontWeight:700, fontSize:12.5, padding:'8px 17px', borderRadius:999, cursor:'pointer', minHeight:34 }}>{lang==='en'?'Add':lang==='ar'?'أضف':'Ekle'}</button>
          }
        </div>
      </div>
    </article>
  )
}

function Contact({ lang }: { lang: string }) {
  const HOURS = lang==='en'?[['Monday – Sunday','10:00 – 02:00']]:lang==='ar'?[['الاثنين – الأحد','10:00 – 02:00']]:[['Pazartesi – Pazar','10:00 – 02:00']]
  return (
    <section style={{ padding:'40px 18px 8px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
        <span style={{ fontFamily:'var(--sans)', fontSize:11, fontWeight:600, letterSpacing:'.1em', color:'#C9A84C', whiteSpace:'nowrap' }}>{lang==='en'?'CONTACT US':lang==='ar'?'تواصل معنا':'B İ Z E   U L A Ş I N'}</span>
        <span style={{ flex:1, height:1, background:'linear-gradient(90deg,rgba(201,168,76,.4),transparent)' }}/>
      </div>

      {[
        { href:'tel:+902126262424', icon:<IconPhone size={20}/>, main:'+90 212 626 2424', sub:lang==='en'?'Reservation & takeaway':lang==='ar'?'حجز وطلبات خارجية':'Rezervasyon & paket sipariş' },
        { href:'https://maps.app.goo.gl/XhAE7ymB1VZaadKo8', icon:<IconMap size={20}/>, main:lang==='en'?'Our Location':lang==='ar'?'موقعنا':'Konumumuz', sub:'Google Maps\'te görüntüle' },
      ].map(({href,icon,main,sub})=>(
        <a key={href} href={href} target="_blank" rel="noreferrer" style={{ display:'flex', alignItems:'center', gap:14, padding:'13px 2px', textDecoration:'none', color:'#F0EDE8', borderBottom:'1px solid rgba(240,237,232,.05)', transition:'opacity .2s' }}>
          <span style={{ width:42, height:42, flexShrink:0, display:'grid', placeItems:'center', borderRadius:12, border:'1px solid rgba(201,168,76,.3)', color:'#C9A84C' }}>{icon}</span>
          <span style={{ display:'flex', flexDirection:'column', minWidth:0 }}>
            <span style={{ fontWeight:600, fontSize:14.5, color:'#F0EDE8' }}>{main}</span>
            <span style={{ fontSize:12, color:'rgba(240,237,232,.5)', marginTop:2 }}>{sub}</span>
          </span>
        </a>
      ))}

      <a href="https://maps.app.goo.gl/XhAE7ymB1VZaadKo8" target="_blank" rel="noreferrer" style={{ display:'block', margin:'18px 0', border:'1px solid rgba(240,237,232,.07)', borderRadius:16, overflow:'hidden', position:'relative', textDecoration:'none' }}>
        <div style={{ width:'100%', height:150, background:'#161310', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8 }}>
          <span style={{ color:'#C9A84C', fontSize:28 }}><IconPin size={32}/></span>
          <span style={{ color:'rgba(240,237,232,.5)', fontSize:12, letterSpacing:'.1em' }}>{lang==='en'?'VIEW ON MAP':lang==='ar'?'عرض على الخريطة':'HARİTADA GÖR'}</span>
        </div>
      </a>

      <div style={{ marginTop:16, background:'#141414', border:'1px solid rgba(240,237,232,.05)', borderRadius:14, padding:'14px 16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:9, color:'#C9A84C', fontWeight:600, fontSize:12.5, letterSpacing:'.03em', paddingBottom:11, marginBottom:6, borderBottom:'1px solid rgba(201,168,76,.16)' }}>
          <IconClock size={18}/> {lang==='en'?'Opening Hours':lang==='ar'?'ساعات العمل':'Çalışma Saatleri'}
        </div>
        {HOURS.map(([d,t],i)=>(
          <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', fontSize:13.5, color:'rgba(240,237,232,.78)' }}>
            <span>{d}</span><span style={{ color:'#F0EDE8', fontWeight:600 }}>{t}</span>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:13, justifyContent:'center', margin:'24px 0 8px' }}>
        <a href="https://www.instagram.com/kahfe_lounge?igsh=MTVnOW1haHc2YmwxMQ==" target="_blank" rel="noreferrer" aria-label="Instagram"
          style={{ width:46, height:46, borderRadius:'50%', display:'grid', placeItems:'center', border:'1px solid rgba(240,237,232,.12)', color:'rgba(240,237,232,.6)', textDecoration:'none', transition:'color .2s,border-color .2s,transform .2s' }}
          onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.color='#C9A84C';el.style.borderColor='rgba(201,168,76,.6)';el.style.transform='translateY(-2px)'}}
          onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.color='rgba(240,237,232,.6)';el.style.borderColor='rgba(240,237,232,.12)';el.style.transform='translateY(0)'}}>
          <IconInstagram size={22}/>
        </a>
        <a href="https://wa.me/902126262424" target="_blank" rel="noreferrer" aria-label="WhatsApp"
          style={{ width:46, height:46, borderRadius:'50%', display:'grid', placeItems:'center', border:'1px solid rgba(240,237,232,.12)', color:'rgba(240,237,232,.6)', textDecoration:'none', transition:'color .2s,border-color .2s,transform .2s' }}
          onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.color='#C9A84C';el.style.borderColor='rgba(201,168,76,.6)';el.style.transform='translateY(-2px)'}}
          onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.color='rgba(240,237,232,.6)';el.style.borderColor='rgba(240,237,232,.12)';el.style.transform='translateY(0)'}}>
          <IconWhatsapp size={22}/>
        </a>
      </div>
    </section>
  )
}

function ItemSheet({ item, qty, onClose, onAdd, onInc, onDec, lang }: { item:MenuItem; qty:number; onClose:()=>void; onAdd:()=>void; onInc:()=>void; onDec:()=>void; lang:string }) {
  const [closing, setClosing] = useState(false)
  const close = () => { setClosing(true); setTimeout(onClose, 280) }
  return (
    <div onClick={close} style={{ position:'fixed', inset:0, zIndex:40, background:'rgba(5,5,5,.7)', backdropFilter:'blur(6px)', display:'flex', alignItems:'flex-end', maxWidth:480, margin:'0 auto', animation: closing?'overlayOut .28s ease both':'overlayIn .28s ease both' }}>
      <div onClick={e=>e.stopPropagation()} style={{ position:'relative', width:'100%', maxHeight:'90%', overflowY:'auto', background:'#0D0D0D', borderTopLeftRadius:26, borderTopRightRadius:26, paddingBottom:30, borderTop:'1px solid rgba(201,168,76,.2)', boxShadow:'0 -20px 60px rgba(0,0,0,.7)', animation: closing?'sheetDown .3s ease-in both':'sheetUp .36s cubic-bezier(.18,.84,.26,1) both' }}>
        <div style={{ width:38, height:4, borderRadius:4, background:'rgba(240,237,232,.18)', margin:'10px auto 2px' }}/>
        <button onClick={close} style={{ position:'absolute', top:14, right:14, width:34, height:34, borderRadius:'50%', background:'rgba(240,237,232,.07)', border:'none', color:'rgba(240,237,232,.7)', display:'grid', placeItems:'center', cursor:'pointer', zIndex:2 }}><IconClose size={18}/></button>
        <div style={{ padding:'8px 14px 0' }}><KImg label={item.name} src={item.image_url||''} h={260} rounded={20}/></div>
        <div style={{ padding:'18px 22px 0' }}>
          <h2 style={{ fontFamily:'var(--serif)', fontWeight:700, fontSize:25, lineHeight:1.18, margin:0, color:'#F0EDE8', direction:lang==='ar'?'rtl':'ltr' }}>{lang==='en'?(item.name_en||item.name):lang==='ar'?(item.name_ar||item.name):item.name}</h2>
          {item.description && <p style={{ margin:'11px 0 0', color:'rgba(240,237,232,.62)', fontSize:14, lineHeight:1.6, direction:lang==='ar'?'rtl':'ltr' }}>{lang==='en'?(item.description_en||item.description):lang==='ar'?(item.description_ar||item.description):item.description}</p>}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:14, marginTop:22, paddingTop:18, borderTop:'1px solid rgba(240,237,232,.07)' }}>
            <div>
              <span style={{ display:'block', fontSize:10, textTransform:'uppercase', letterSpacing:'.18em', color:'rgba(201,168,76,.7)', marginBottom:4 }}>{lang==='en'?'Price':lang==='ar'?'السعر':'Fiyat'}</span>
              <span style={{ fontFamily:'var(--sans)', fontWeight:700, fontSize:26, color:'#C9A84C' }}>{fmt(item.price)}</span>
            </div>
            {qty>0
              ? <QtyPill qty={qty} onDec={onDec} onInc={onInc} size="lg"/>
              : <button onClick={onAdd} style={{ appearance:'none', border:'none', background:'#C9A84C', color:'#1A0E06', fontFamily:'var(--sans)', fontWeight:700, fontSize:14.5, padding:'0 26px', minHeight:50, borderRadius:13, cursor:'pointer', flexShrink:0, boxShadow:'0 8px 22px rgba(201,168,76,.3)' }}>{lang==='en'?'Add to Order':lang==='ar'?'أضف للطلب':'Sepete Ekle'}</button>
            }
          </div>
        </div>
      </div>
    </div>
  )
}

function OrderSummary({ lines, total, count, onClose, onInc, onDec, lang }: { lines:Line[]; total:number; count:number; onClose:()=>void; onInc:(i:MenuItem)=>void; onDec:(i:MenuItem)=>void; lang:string }) {
  const [closing, setClosing] = useState(false)
  const close = () => { setClosing(true); setTimeout(onClose, 280) }
  return (
    <div onClick={close} style={{ position:'fixed', inset:0, zIndex:40, background:'rgba(5,5,5,.7)', backdropFilter:'blur(6px)', display:'flex', alignItems:'flex-end', maxWidth:480, margin:'0 auto', animation: closing?'overlayOut .28s ease both':'overlayIn .28s ease both' }}>
      <div onClick={e=>e.stopPropagation()} style={{ position:'relative', width:'100%', maxHeight:'90%', overflowY:'auto', background:'#0D0D0D', borderTopLeftRadius:26, borderTopRightRadius:26, paddingBottom:30, borderTop:'1px solid rgba(201,168,76,.2)', boxShadow:'0 -20px 60px rgba(0,0,0,.7)', animation: closing?'sheetDown .3s ease-in both':'sheetUp .36s cubic-bezier(.18,.84,.26,1) both' }}>
        <div style={{ width:38, height:4, borderRadius:4, background:'rgba(240,237,232,.18)', margin:'10px auto 2px' }}/>
        <button onClick={close} style={{ position:'absolute', top:14, right:14, width:34, height:34, borderRadius:'50%', background:'rgba(240,237,232,.07)', border:'none', color:'rgba(240,237,232,.7)', display:'grid', placeItems:'center', cursor:'pointer', zIndex:2 }}><IconClose size={18}/></button>
        <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', padding:'18px 22px 0' }}>
          <span style={{ fontFamily:'var(--sans)', fontSize:11, fontWeight:600, letterSpacing:'.08em', color:'#C9A84C' }}>{lang==='en'?'ORDER SUMMARY':lang==='ar'?'ملخص الطلب':'S İ P A R İ Ş   Ö Z E T İ'}</span>
          <span style={{ fontSize:12, color:'rgba(240,237,232,.5)' }}>{count} {lang==='en'?'items':lang==='ar'?'عناصر':'ürün'}</span>
        </div>
        <div style={{ display:'flex', flexDirection:'column', padding:'16px 22px 2px' }}>
          {lines.map(l=>(
            <div key={l.id} style={{ display:'grid', gridTemplateColumns:'48px 1fr auto auto', alignItems:'center', gap:11, padding:'13px 0', borderBottom:'1px dashed rgba(201,168,76,.18)' }}>
              <div style={{ width:48, height:48, borderRadius:10, overflow:'hidden' }}><KImg label={l.name} src={l.image_url||''} h={48}/></div>
              <div style={{ display:'flex', flexDirection:'column', minWidth:0 }}>
                <span style={{ fontWeight:600, fontSize:13.5, color:'#F0EDE8', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{lang==='en'?(l.name_en||l.name):lang==='ar'?(l.name_ar||l.name):l.name}</span>
                <span style={{ fontSize:11, color:'rgba(240,237,232,.5)', marginTop:2 }}>{fmt(l.price)} · adet</span>
              </div>
              <QtyPill qty={l.qty} onDec={()=>onDec(l)} onInc={()=>onInc(l)} size="sm"/>
              <span style={{ fontFamily:'var(--sans)', fontWeight:700, fontSize:14, color:'#C9A84C', textAlign:'right', minWidth:54 }}>{fmt(l.price*l.qty)}</span>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'4px 22px 0', padding:'16px 0', borderTop:'1px solid rgba(201,168,76,.3)' }}>
          <span style={{ fontSize:13, textTransform:'uppercase', letterSpacing:'.1em', color:'rgba(240,237,232,.5)' }}>{lang==='en'?'TOTAL':lang==='ar'?'المجموع':'Toplam'}</span>
          <span style={{ fontFamily:'var(--sans)', fontWeight:700, fontSize:25, color:'#C9A84C' }}>{fmt(total)}</span>
        </div>
        <div style={{ margin:'14px 22px 0', border:'1px solid rgba(201,168,76,.3)', borderRadius:14, padding:'14px 16px', background:'rgba(201,168,76,.04)', display:'flex', flexDirection:'column', gap:5 }}>
          <span style={{ color:'#C9A84C', fontWeight:700, fontSize:12.5, textTransform:'uppercase', letterSpacing:'.08em' }}>{lang==='en'?'Show Waiter':lang==='ar'?'أرِ النادل':'Garsona Göster'}</span>
          <span style={{ fontSize:12.5, color:'rgba(240,237,232,.62)', lineHeight:1.5 }}>{lang==='en'?'Show this screen to the waiter. Your order will be brought to your table.':lang==='ar'?'أرِ هذه الشاشة للنادل. سيُحضر طلبك إلى طاولتك.':'Bu ekranı görevliye gösterin. Siparişiniz masanıza getirilecektir.'}</span>
        </div>
      </div>
    </div>
  )
}

export default function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [allItems, setAllItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCat, setActiveCat] = useState('')
  const [cart, setCart] = useState<CartMap>({})
  const [openItemId, setOpenItemId] = useState<string|null>(null)
  const [showOrder, setShowOrder] = useState(false)
  const [pulseKey, setPulseKey] = useState(0)
  const [lang, setLang] = useState<'tr'|'en'|'ar'>('tr')
  const [showWelcome, setShowWelcome] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('kahfe_lang') as 'tr'|'en'|'ar'
    if (saved) {
      setLang(saved)
      setShowWelcome(false)
    } else {
      setShowWelcome(true)
    }
  }, [])

  function selectLang(l: 'tr'|'en'|'ar') {
    setLang(l)
    localStorage.setItem('kahfe_lang', l)
    setShowWelcome(false)
  }

  function changeLang(l: 'tr'|'en'|'ar') {
    setLang(l)
    localStorage.setItem('kahfe_lang', l)
  }

  function t(item: any, field: string) {
    if (lang === 'en') return item[field+'_en'] || item[field] || ''
    if (lang === 'ar') return item[field+'_ar'] || item[field] || ''
    return item[field] || ''
  }

  function catName(cat: any) {
    if (lang === 'en') return cat.name_en || cat.name
    if (lang === 'ar') return cat.name_ar || cat.name
    return cat.name
  }

  useEffect(()=>{
    async function load() {
      const [{data:cats},{data:its}] = await Promise.all([
        supabase.from('categories').select('*').order('order_index'),
        supabase.from('menu_items').select('*').eq('available',true).order('order_index'),
      ])
      const c=cats||[]; const i=its||[]
      setCategories(c); setAllItems(i)
      const hasRecommended = i.some(x => x.recommended)
      if (hasRecommended) setActiveCat('__recommended__')
      else if(c.length) setActiveCat(c[0].id)
      setLoading(false)
    }
    load()
  },[])

  const recommendedItems = useMemo(()=>allItems.filter(i=>i.recommended),[allItems])
  const items  = useMemo(()=> activeCat==='__recommended__' ? recommendedItems : allItems.filter(i=>i.category_id===activeCat),[activeCat,allItems,recommendedItems])
  const byId   = useMemo(()=>{ const m:Record<string,MenuItem>={};allItems.forEach(i=>m[i.id]=i);return m },[allItems])
  const setQty = (id:string,next:number)=>setCart(c=>{const n={...c};if(next<=0)delete n[id];else n[id]=next;return n})
  const add    = (item:MenuItem)=>{setQty(item.id,(cart[item.id]||0)+1);setPulseKey(k=>k+1)}
  const inc    = (item:MenuItem)=>{setQty(item.id,(cart[item.id]||0)+1);setPulseKey(k=>k+1)}
  const dec    = (item:MenuItem)=>setQty(item.id,(cart[item.id]||0)-1)
  const count  = useMemo(()=>Object.values(cart).reduce((a,b)=>a+b,0),[cart])
  const total  = useMemo(()=>Object.entries(cart).reduce((a,[id,q])=>a+(byId[id]?.price||0)*q,0),[cart,byId])
  const lines  = useMemo(()=>Object.entries(cart).map(([id,qty])=>({...byId[id],qty})).filter(l=>l.id),[cart,byId])
  const openItem = openItemId?byId[openItemId]:null

  if(loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0D0D0D' }}>
      <div style={{ textAlign:'center' }}>
        <img src="/kahfe-logo.png" alt="Kahfe Lounge" style={{ width:200, height:'auto', marginBottom:16, opacity:.9 }}/>
        <div style={{ color:'#888', fontSize:13 }}>{lang==='en'?'Loading menu...':lang==='ar'?'جارٍ تحميل القائمة...':'Menü yükleniyor...'}</div>
      </div>
    </div>
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,500&family=Inter:wght@400;600;700&display=swap');
        :root{ --serif:'Playfair Display',Georgia,serif; --sans:'Inter',system-ui,sans-serif; }
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0D0D0D;color:#F0EDE8;font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        @keyframes logoIn{from{opacity:0;transform:translateY(10px) scale(.985);}to{opacity:1;transform:translateY(0) scale(1);}}
        @keyframes overlayIn{from{opacity:0;}to{opacity:1;}}
        @keyframes overlayOut{from{opacity:1;}to{opacity:0;}}
        @keyframes sheetUp{from{transform:translateY(100%);}to{transform:translateY(0);}}
        @keyframes sheetDown{from{transform:translateY(0);}to{transform:translateY(100%);}}
        @keyframes pulseScale{0%{transform:scale(1);}28%{transform:scale(1.035);}60%{transform:scale(.992);}100%{transform:scale(1);}}
        @keyframes heroGlow{0%{opacity:.55;transform:translate(-2%,-2%);}100%{opacity:.9;transform:translate(2%,2%);}}
        @keyframes shimmer{0%{background-position:200% center;}100%{background-position:-200% center;}}
        @keyframes welcomeIn{from{opacity:0;transform:scale(.92);}to{opacity:1;transform:scale(1);}}
        ::-webkit-scrollbar{display:none;}*{scrollbar-width:none;}
        .kahfe-bg{background-color:#0D0D0D;background-image:radial-gradient(circle,rgba(201,168,76,.055) 1px,transparent 1px);background-size:28px 28px;}
        .corner-card{position:relative;}
        .corner-card::before,.corner-card::after{content:'';position:absolute;width:10px;height:10px;opacity:0;transition:opacity .3s;z-index:2;}
        .corner-card::before{top:7px;left:7px;border-top:1.5px solid #C9A84C;border-left:1.5px solid #C9A84C;border-radius:3px 0 0 0;}
        .corner-card::after{bottom:7px;right:7px;border-bottom:1.5px solid #C9A84C;border-right:1.5px solid #C9A84C;border-radius:0 0 3px 0;}
        .corner-card:hover::before,.corner-card:hover::after{opacity:1;}
        .gold-divider{height:1px;background:linear-gradient(90deg,transparent,rgba(201,168,76,.25),rgba(192,57,43,.15),transparent);margin:0;}
        .lang-pick-btn:active{transform:scale(.97);}
      `}</style>

      {/* WELCOME POPUP */}
      {showWelcome && (
        <div style={{ position:'fixed', inset:0, zIndex:100, background:'rgba(0,0,0,.92)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, maxWidth:480, margin:'0 auto' }}>
          <div style={{ width:'100%', background:'#141414', borderRadius:24, overflow:'hidden', border:'1px solid rgba(201,168,76,.2)', boxShadow:'0 0 60px rgba(0,0,0,.8)', animation:'welcomeIn .5s cubic-bezier(.18,.84,.26,1) both' }}>

            {/* top gold bar */}
            <div style={{ height:3, background:'linear-gradient(90deg,transparent,#C9A84C,#C0392B,#C9A84C,transparent)' }}/>

            <div style={{ padding:'32px 28px 28px', textAlign:'center' }}>

              {/* logo */}
              <img src="/kahfe-logo.png" alt="Kahfe Lounge" style={{ width:180, height:'auto', margin:'0 auto 20px', display:'block', filter:'drop-shadow(0 4px 16px rgba(201,168,76,.2))' }}/>

              {/* divider */}
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
                <span style={{ flex:1, height:1, background:'linear-gradient(90deg,transparent,rgba(201,168,76,.3))' }}/>
                <span style={{ width:5, height:5, background:'#C0392B', transform:'rotate(45deg)', display:'block', flexShrink:0 }}/>
                <span style={{ flex:1, height:1, background:'linear-gradient(90deg,rgba(201,168,76,.3),transparent)' }}/>
              </div>

              {/* welcome text - all 3 languages */}
              <div style={{ marginBottom:28 }}>
                <p style={{ color:'#F0EDE8', fontFamily:'var(--serif)', fontSize:18, fontWeight:700, marginBottom:4 }}>Hoş Geldiniz</p>
                <p style={{ color:'rgba(240,237,232,.5)', fontSize:12, letterSpacing:1 }}>Welcome &nbsp;|&nbsp; أهلاً وسهلاً</p>
              </div>

              {/* language buttons */}
              <p style={{ color:'rgba(240,237,232,.4)', fontSize:11, letterSpacing:2, marginBottom:14, textTransform:'uppercase' }}>Choose your language</p>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>

                <button className="lang-pick-btn" onClick={() => selectLang('tr')}
                  style={{ width:'100%', background:'linear-gradient(135deg,rgba(201,168,76,.12),rgba(201,168,76,.06))', border:'1px solid rgba(201,168,76,.3)', borderRadius:14, padding:'16px 20px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', transition:'all .2s' }}>
                  <span style={{ fontSize:22 }}>🇹🇷</span>
                  <div style={{ textAlign:'center', flex:1 }}>
                    <div style={{ color:'#F0EDE8', fontWeight:700, fontSize:15 }}>Türkçe</div>
                    <div style={{ color:'rgba(240,237,232,.4)', fontSize:11, marginTop:2 }}>Turkish</div>
                  </div>
                  <span style={{ color:'#C9A84C', fontSize:16 }}>›</span>
                </button>

                <button className="lang-pick-btn" onClick={() => selectLang('en')}
                  style={{ width:'100%', background:'linear-gradient(135deg,rgba(201,168,76,.08),rgba(201,168,76,.03))', border:'1px solid rgba(240,237,232,.1)', borderRadius:14, padding:'16px 20px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', transition:'all .2s' }}>
                  <span style={{ fontSize:22 }}>🇬🇧</span>
                  <div style={{ textAlign:'center', flex:1 }}>
                    <div style={{ color:'#F0EDE8', fontWeight:700, fontSize:15 }}>English</div>
                    <div style={{ color:'rgba(240,237,232,.4)', fontSize:11, marginTop:2 }}>English</div>
                  </div>
                  <span style={{ color:'#888', fontSize:16 }}>›</span>
                </button>

                <button className="lang-pick-btn" onClick={() => selectLang('ar')}
                  style={{ width:'100%', background:'linear-gradient(135deg,rgba(201,168,76,.08),rgba(201,168,76,.03))', border:'1px solid rgba(240,237,232,.1)', borderRadius:14, padding:'16px 20px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', transition:'all .2s' }}>
                  <span style={{ fontSize:22 }}>🇸🇦</span>
                  <div style={{ textAlign:'center', flex:1 }}>
                    <div style={{ color:'#F0EDE8', fontWeight:700, fontSize:15 }}>العربية</div>
                    <div style={{ color:'rgba(240,237,232,.4)', fontSize:11, marginTop:2 }}>Arabic</div>
                  </div>
                  <span style={{ color:'#888', fontSize:16 }}>›</span>
                </button>

              </div>
            </div>

            {/* bottom gold bar */}
            <div style={{ height:3, background:'linear-gradient(90deg,transparent,#C0392B,#C9A84C,transparent)' }}/>
          </div>
        </div>
      )}

      <div style={{ minHeight:'100vh', maxWidth:480, margin:'0 auto', position:'relative', backgroundColor:'#0D0D0D', backgroundImage:'radial-gradient(circle, rgba(201,168,76,.06) 1px, transparent 1px)', backgroundSize:'26px 26px', direction: lang==='ar'?'rtl':'ltr' }}>
        <Hero lang={lang} onLangChange={changeLang}/>
        <div className='gold-divider'/><TabBar cats={recommendedItems.length>0 ? [{id:'__recommended__', name:'Öne Çıkanlar', name_en:'Recommended', name_ar:'موصى به', icon:'⭐', order_index:-1, created_at:''} as Category, ...categories] : categories} active={activeCat} onChange={setActiveCat} lang={lang}/>

        <div key={activeCat} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, padding:'18px 16px 4px' }}>
          {items.length===0 && <div style={{ gridColumn:'1/-1', textAlign:'center', color:'#888', padding:40 }}>{lang==='en'?'No items in this category yet.':lang==='ar'?'لا توجد عناصر في هذه الفئة بعد.':'Bu kategoride henüz ürün yok.'}</div>}
          {items.map((it,i)=>(
            <MenuCard key={it.id} item={it} qty={cart[it.id]||0} index={i} lang={lang}
              onOpen={()=>setOpenItemId(it.id)}
              onAdd={()=>add(it)} onInc={()=>inc(it)} onDec={()=>dec(it)}/>
          ))}
        </div>

        <Contact lang={lang}/>

        <footer style={{ textAlign:'center', padding:'28px 16px 120px', marginTop:14, borderTop:'1px solid rgba(240,237,232,.05)' }}>
          <img src="/kahfe-logo.png" alt="Kahfe Lounge" style={{ width:120, height:'auto', opacity:.6, marginBottom:12 }}/>
          <div style={{ fontSize:11, color:'rgba(240,237,232,.35)', letterSpacing:'.01em' }}>{lang==='en'?'© 2024 Kahfe Lounge — All rights reserved':lang==='ar'?'© 2024 كهفة لاونج — جميع الحقوق محفوظة':'© 2024 Kahfe Lounge — Tüm hakları saklıdır'}</div>
        </footer>

        {count>0 && (
          <div style={{ position:'fixed', left:0, right:0, bottom:0, padding:'0 16px 24px', zIndex:30, maxWidth:480, margin:'0 auto', pointerEvents:'none' }}>
            <button key={pulseKey} onClick={()=>setShowOrder(true)}
              style={{ pointerEvents:'auto', width:'100%', minHeight:56, border:'none', cursor:'pointer', background:'#C9A84C', borderRadius:16, display:'flex', alignItems:'center', gap:12, padding:'0 16px 0 12px', color:'#1A0E06', boxShadow:'0 12px 34px rgba(201,168,76,.34),0 4px 14px rgba(0,0,0,.5)', animation:'pulseScale .45s ease' }}>
              <span style={{ width:30, height:30, flexShrink:0, background:'rgba(0,0,0,.2)', borderRadius:9, display:'grid', placeItems:'center', fontWeight:700, fontSize:13.5, color:'#1A0E06' }}>{count}</span>
              <span style={{ flex:1, textAlign:'left', fontWeight:600, fontSize:14.5, letterSpacing:'.01em' }}>{lang==='en'?'View Order':lang==='ar'?'عرض الطلب':'Sipariş Özeti'}</span>
              <span style={{ fontWeight:700, fontSize:16.5 }}>{fmt(total)}</span>
            </button>
          </div>
        )}

        {openItem && (
          <ItemSheet item={openItem} qty={cart[openItem.id]||0} lang={lang}
            onClose={()=>setOpenItemId(null)}
            onAdd={()=>{add(openItem);setOpenItemId(null)}}
            onInc={()=>inc(openItem)} onDec={()=>dec(openItem)}/>
        )}
        {showOrder && count>0 && (
          <OrderSummary lines={lines as Line[]} total={total} count={count} lang={lang}
            onClose={()=>setShowOrder(false)} onInc={inc} onDec={dec}/>
        )}
      </div>
    </>
  )
}
