'use client'
import { useEffect, useState } from 'react'

// SayPOS public site. Subject: a Turkish nargile lounge — warm dim light, the
// amber glow of a coal. Palette is warm near-black + gold + one ember accent
// (deliberately NOT the acid-green-on-black AI default). Display face is
// Fraunces (hospitality warmth); body Inter; labels IBM Plex Mono.
// Signature: a nargile-station card in the hero that actually ticks, so the
// page reads as a live product, not a brochure.

const C = {
  ink: '#0C0A07',        // warm near-black
  panel: '#151109',      // espresso panel
  panel2: '#1D1710',
  line: 'rgba(201,168,76,.16)',
  gold: '#C9A84C',
  ember: '#E8843C',      // coal glow — used only around nargile timing
  cream: '#F3EBD9',
  muted: '#A7997B',
  faint: 'rgba(243,235,217,.42)',
}
const serif = "'Fraunces', Georgia, serif"
const sans = "'Inter', system-ui, sans-serif"
const mono = "'IBM Plex Mono', monospace"

const WA = 'https://wa.me/905315822748'
const MAIL = 'mailto:saifalomari244@gmail.com'

// --- small custom line icons (stroke, currentColor) ----------------------
const Ic = {
  qr: (p: React.SVGProps<SVGSVGElement>) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M20 14v.01M14 20v.01M20 20v.01M17 20v.01M20 17v.01"/></svg>,
  kitchen: (p: React.SVGProps<SVGSVGElement>) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><path d="M4 8h16l-1.2 11a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8L4 8Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></svg>,
  timer: (p: React.SVGProps<SVGSVGElement>) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><circle cx="12" cy="13" r="8"/><path d="M12 13V9M9 2h6M12 5V2"/></svg>,
  chart: (p: React.SVGProps<SVGSVGElement>) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><path d="M4 20V4M4 20h16M8 20v-6M13 20V9M18 20v-9"/></svg>,
  receipt: (p: React.SVGProps<SVGSVGElement>) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><path d="M5 3v18l2-1.4L9 21l2-1.4L13 21l2-1.4L17 21l2-1.4V3l-2 1.4L15 3l-2 1.4L11 3 9 4.4 7 3 5 4.4Z"/><path d="M8 8h8M8 12h8"/></svg>,
  tables: (p: React.SVGProps<SVGSVGElement>) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/></svg>,
}

function pad(n: number) { return n.toString().padStart(2, '0') }

export default function Saypos() {
  // live nargile timers — this is the signature; it ticks so the page feels alive.
  const [t, setT] = useState(0)
  useEffect(() => { const i = setInterval(() => setT(x => x + 1), 1000); return () => clearInterval(i) }, [])
  const stations = [
    { table: 'MASA 7', base: 468, warn: true },   // ~7:48, coal soon
    { table: 'MASA 3', base: 132, warn: false },
    { table: 'VİP ODA', base: 1150, warn: false },
  ]

  const feats = [
    { i: Ic.qr, t: 'QR menü', d: 'Müşteri masadan telefonuyla açar ve sipariş verir. Türkçe, İngilizce, Arapça.' },
    { i: Ic.kitchen, t: 'Mutfak ekranı', d: 'Sipariş anında mutfağa düşer, sesli uyarıyla. Kağıt koşturmak yok.' },
    { i: Ic.chart, t: 'Patron paneli', d: 'Ciro, ödeme dağılımı, borçlu takibi ve günlük rapor — telefonunuzda.' },
    { i: Ic.receipt, t: 'Termal fiş', d: 'Hesap kapanınca fiş ve fatura otomatik yazdırılır. 80mm yazıcı.' },
    { i: Ic.tables, t: 'Masa & hesap', d: 'Açık hesaplar, masa taşıma, hesap birleştirme — tek dokunuşla.' },
    { i: Ic.timer, t: 'Nargile zamanlayıcı', d: 'Aşağıda anlattığımız fark. Her közü ayrı takip eder.' },
  ]

  const btnGold: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, height: 52, padding: '0 26px', background: C.gold, color: C.ink, borderRadius: 4, fontWeight: 600, fontSize: 15.5, textDecoration: 'none', fontFamily: sans, letterSpacing: .2 }
  const btnLine: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', height: 52, padding: '0 24px', background: 'transparent', color: C.cream, borderRadius: 4, fontWeight: 500, fontSize: 15.5, textDecoration: 'none', border: `1px solid ${C.line}`, fontFamily: sans }
  const eyebrow: React.CSSProperties = { color: C.gold, fontSize: 11.5, fontFamily: mono, letterSpacing: 3, textTransform: 'uppercase' }

  return (
    <div style={{ background: C.ink, color: C.cream, minHeight: '100vh', fontFamily: sans, overflowX: 'hidden' }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,900&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; }
        @keyframes coal { 0%,100%{ opacity:.55; } 50%{ opacity:1; } }
        .coal { animation: coal 1.6s ease-in-out infinite; }
        a { -webkit-tap-highlight-color: transparent; }
        a:focus-visible, button:focus-visible { outline: 2px solid ${C.gold}; outline-offset: 3px; }
        @media (prefers-reduced-motion: reduce){ .coal{ animation: none; } }
        .hero-grid { display:grid; grid-template-columns: 1.1fr .9fr; gap: 56px; align-items:center; }
        @media (max-width: 860px){ .hero-grid{ grid-template-columns:1fr; gap:40px; } .hero-card{ order:-1; } }
      `}</style>

      {/* ambient coal glow */}
      <div aria-hidden style={{ position: 'absolute', top: -160, right: -120, width: 620, height: 620, background: `radial-gradient(circle, rgba(232,132,60,.18), rgba(232,132,60,0) 62%)`, pointerEvents: 'none' }} />

      {/* nav */}
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(12,10,7,.82)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '15px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: serif, fontWeight: 600, fontSize: 23, color: C.cream, letterSpacing: .3 }}>
            Say<span style={{ color: C.gold }}>POS</span>
          </span>
          <a href="/platform" style={{ color: C.cream, fontFamily: mono, fontSize: 13, letterSpacing: 1, textDecoration: 'none', border: `1px solid ${C.line}`, padding: '9px 16px', borderRadius: 4 }}>GİRİŞ YAP</a>
        </div>
      </header>

      {/* hero */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '78px 24px 64px', position: 'relative' }}>
        <div className="hero-grid">
          <div>
            <div style={{ ...eyebrow, marginBottom: 22 }}>Nargile &amp; kafe için POS</div>
            <h1 style={{ fontFamily: serif, fontWeight: 500, fontSize: 'clamp(38px, 6.4vw, 66px)', lineHeight: 1.02, letterSpacing: -1, margin: '0 0 22px' }}>
              Nargileden mutfağa,<br /><span style={{ fontStyle: 'italic', color: C.gold }}>tek ekranda.</span>
            </h1>
            <p style={{ color: C.muted, fontSize: 'clamp(16px,2.2vw,19px)', lineHeight: 1.6, maxWidth: 460, margin: '0 0 34px' }}>
              QR menü, mutfak ekranı, patron paneli ve közü kaçırmayan nargile zamanlayıcısı. Hepsi hızlı, Türkçe ve tek sistemde.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <a href="#iletisim" style={btnGold}>Demo iste</a>
              <a href="/platform" style={btnLine}>Zaten müşteri misiniz?</a>
            </div>
            <div style={{ marginTop: 30, color: C.faint, fontSize: 13, fontFamily: mono }}>
              <span style={{ color: C.gold }}>—</span>&nbsp; Kahfe Lounge’da canlı çalışıyor
            </div>
          </div>

          {/* signature: live nargile station */}
          <div className="hero-card" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: 20, boxShadow: '0 30px 80px -40px rgba(0,0,0,.9)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: 2, color: C.muted }}>NARGİLE İSTASYONU</span>
              <span style={{ fontFamily: mono, fontSize: 11, color: C.gold }}>{stations.length} aktif</span>
            </div>
            {stations.map((s, idx) => {
              const secs = s.base + t
              const mm = Math.floor(secs / 60), ss = secs % 60
              const coalSoon = s.warn
              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px', marginBottom: 10, borderRadius: 8, background: coalSoon ? 'rgba(232,132,60,.09)' : C.panel2, border: `1px solid ${coalSoon ? 'rgba(232,132,60,.35)' : C.line}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className={coalSoon ? 'coal' : ''} style={{ width: 9, height: 9, borderRadius: 999, background: coalSoon ? C.ember : C.muted, boxShadow: coalSoon ? `0 0 10px ${C.ember}` : 'none' }} />
                    <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 15 }}>{s.table}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: mono, fontSize: 18, color: coalSoon ? C.ember : C.cream, letterSpacing: 1 }}>{pad(mm)}:{pad(ss)}</div>
                    <div style={{ fontFamily: mono, fontSize: 10.5, color: coalSoon ? C.ember : C.faint, letterSpacing: 1 }}>{coalSoon ? 'KÖZ DEĞİŞİMİ' : 'sürüyor'}</div>
                  </div>
                </div>
              )
            })}
            <div style={{ fontFamily: mono, fontSize: 10.5, color: C.faint, letterSpacing: 1, marginTop: 6, textAlign: 'center' }}>canlı — her masa ayrı sayılır</div>
          </div>
        </div>
      </section>

      {/* features */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ ...eyebrow, marginBottom: 26 }}>Sistemde neler var</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 1, background: C.line, border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
          {feats.map(f => (
            <div key={f.t} style={{ background: C.ink, padding: '26px 24px' }}>
              <div style={{ color: C.gold, marginBottom: 16 }}><f.i /></div>
              <div style={{ fontFamily: serif, fontWeight: 500, fontSize: 20, marginBottom: 8 }}>{f.t}</div>
              <div style={{ color: C.muted, fontSize: 14.5, lineHeight: 1.55 }}>{f.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* nargile spotlight — the differentiator */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '52px 24px' }}>
        <div style={{ background: `linear-gradient(150deg, ${C.panel2}, ${C.ink})`, border: `1px solid rgba(232,132,60,.28)`, borderRadius: 14, padding: 'clamp(28px,5vw,52px)', position: 'relative', overflow: 'hidden' }}>
          <div aria-hidden style={{ position: 'absolute', bottom: -80, left: -40, width: 300, height: 300, background: `radial-gradient(circle, rgba(232,132,60,.16), transparent 60%)` }} />
          <div style={{ position: 'relative', maxWidth: 620 }}>
            <div style={{ ...eyebrow, color: C.ember, marginBottom: 18 }}>Bizi ayıran şey</div>
            <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: 'clamp(26px,4vw,40px)', lineHeight: 1.1, margin: '0 0 18px' }}>
              Köz sönmeden haber verir.
            </h2>
            <p style={{ color: C.muted, fontSize: 17, lineHeight: 1.6, margin: 0 }}>
              Çoğu POS nargileyi bilmez. SayPOS her masanın nargilesini saniye saniye takip eder; köz değişim vakti gelince personeli uyarır. Ne müşteri bekler, ne masa unutulur — servis akışında kalır.
            </p>
          </div>
        </div>
      </section>

      {/* pricing */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 28, alignItems: 'center', borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`, padding: '40px 0' }}>
          <div>
            <div style={{ ...eyebrow, marginBottom: 14 }}>Fiyatlandırma</div>
            <div style={{ fontFamily: serif, fontWeight: 500, fontSize: 'clamp(24px,3.6vw,34px)', marginBottom: 10 }}>Tek seferlik kurulum, aylık abonelik.</div>
            <div style={{ color: C.muted, fontSize: 16, maxWidth: 520, lineHeight: 1.55 }}>Kafenizin büyüklüğüne göre net bir fiyat veriyoruz. Gizli ücret yok, sözleşme baskısı yok.</div>
          </div>
          <a href="#iletisim" style={{ ...btnGold, whiteSpace: 'nowrap' }}>Fiyat al</a>
        </div>
      </section>

      {/* contact */}
      <section id="iletisim" style={{ maxWidth: 1120, margin: '0 auto', padding: '64px 24px 30px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: 'clamp(28px,5vw,46px)', lineHeight: 1.08, margin: '0 0 16px' }}>
          Kafenizde <span style={{ fontStyle: 'italic', color: C.gold }}>canlı</span> görün.
        </h2>
        <p style={{ color: C.muted, fontSize: 17, maxWidth: 500, margin: '0 auto 32px', lineHeight: 1.55 }}>
          Kısa bir demo ayarlayalım. Yazın, kafenizi konuşalım — kurulumu biz hallederiz.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href={WA} target="_blank" rel="noopener noreferrer" style={btnGold}>WhatsApp’tan yaz</a>
          <a href={MAIL} style={btnLine}>E-posta gönder</a>
        </div>
      </section>

      <footer style={{ borderTop: `1px solid ${C.line}`, marginTop: 40, padding: '28px 24px', textAlign: 'center' }}>
        <div style={{ fontFamily: serif, fontSize: 19, fontWeight: 600 }}>Say<span style={{ color: C.gold }}>POS</span></div>
        <div style={{ color: C.faint, fontFamily: mono, fontSize: 12, letterSpacing: 1, marginTop: 6 }}>Kafeler için akıllı POS · {new Date().getFullYear()}</div>
      </footer>
    </div>
  )
}
