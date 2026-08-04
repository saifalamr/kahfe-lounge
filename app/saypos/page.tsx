'use client'
import { useState } from 'react'

// SayPOS public marketing site. Two doors: a visitor gets convinced and hits
// "Demo İste" (contact), an existing customer hits "Giriş Yap" -> /platform.
// Lives at /saypos now (free, path-based); becomes the saypos.com apex later.

const S = {
  bg: '#0D0D0D', bg1: '#141414', bg2: '#1b1b1b', border: 'rgba(201,168,76,.18)',
  gold: '#C9A84C', goldSoft: 'rgba(201,168,76,.10)', green: '#5FD08C',
  text: '#F0EDE8', text2: 'rgba(240,237,232,.62)', text3: 'rgba(240,237,232,.40)',
}
const mono = "'IBM Plex Mono', monospace"
const display = "'Bricolage Grotesque', sans-serif"

// TODO(saif): replace with your real WhatsApp number / email.
const WHATSAPP = 'https://wa.me/900000000000'
const EMAIL = 'mailto:info@saypos.com'

const FEATURES: { icon: string; title: string; body: string; star?: boolean }[] = [
  { icon: '⏱️', title: 'Nargile Zamanlayıcı', star: true,
    body: 'Her nargileyi ayrı ayrı takip edin. Köz değişim zamanı geldiğinde uyarı alın — hiçbir masa unutulmaz.' },
  { icon: '📱', title: 'QR Menü (TR / EN / AR)', 
    body: 'Müşteriler masadan telefonuyla menüyü açar ve sipariş verir. Üç dil, sıfır bekleme.' },
  { icon: '🍳', title: 'Mutfak Ekranı',
    body: 'Siparişler anında mutfağa düşer, sesli uyarıyla. Kağıt fiş koşturmaya son.' },
  { icon: '📊', title: 'Patron Paneli',
    body: 'Ciro, ödeme dağılımı, borçlu takibi ve günlük raporlar — telefonunuzdan, her an.' },
  { icon: '🧾', title: 'Termal Fiş & Fatura',
    body: '80mm termal yazıcı desteği. Hesap kapanınca fiş otomatik yazdırılır.' },
  { icon: '🪑', title: 'Masa & Hesap Yönetimi',
    body: 'Tablet üzerinden açık hesaplar, masa taşıma, hesap birleştirme — tek dokunuşla.' },
]

export default function SayposLanding() {
  const [busy] = useState(false)
  const btnGold: React.CSSProperties = { display: 'inline-block', height: 52, lineHeight: '52px', padding: '0 26px', background: S.gold, color: '#0D0D0D', borderRadius: 12, fontWeight: 800, fontSize: 16, textDecoration: 'none', border: 'none', cursor: 'pointer' }
  const btnGhost: React.CSSProperties = { display: 'inline-block', height: 52, lineHeight: '52px', padding: '0 24px', background: 'transparent', color: S.text, borderRadius: 12, fontWeight: 700, fontSize: 16, textDecoration: 'none', border: `1px solid ${S.border}`, cursor: 'pointer' }

  return (
    <div style={{ background: S.bg, color: S.text, minHeight: '100vh', fontFamily: display }}>
      {/* nav */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(13,13,13,.85)', backdropFilter: 'blur(10px)', borderBottom: `1px solid ${S.border}` }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ color: S.gold, fontSize: 24, fontWeight: 800, letterSpacing: 1 }}>SayPOS</span>
          </div>
          <a href="/platform" style={{ ...btnGhost, height: 42, lineHeight: '42px', fontSize: 14, padding: '0 18px' }}>Giriş Yap</a>
        </div>
      </div>

      {/* hero */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '72px 22px 56px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', color: S.gold, background: S.goldSoft, border: `1px solid ${S.border}`, borderRadius: 999, padding: '6px 16px', fontSize: 12, fontFamily: mono, letterSpacing: 2, marginBottom: 26 }}>
          NARGİLE & KAFE İÇİN POS
        </div>
        <h1 style={{ fontSize: 'clamp(34px, 6vw, 62px)', fontWeight: 800, lineHeight: 1.05, margin: '0 auto 22px', maxWidth: 820, letterSpacing: -1 }}>
          Kafenizi bir <span style={{ color: S.gold }}>ekrandan</span> yönetin.
        </h1>
        <p style={{ fontSize: 'clamp(16px, 2.4vw, 20px)', color: S.text2, maxWidth: 620, margin: '0 auto 38px', lineHeight: 1.55 }}>
          QR menü, mutfak ekranı, nargile zamanlayıcı ve patron paneli — hepsi tek, hızlı, Türkçe sistemde. Tablet ve termal yazıcıyla çalışır.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="#iletisim" style={btnGold}>Demo İste</a>
          <a href="/platform" style={btnGhost}>Zaten müşteri misiniz? Giriş →</a>
        </div>
        <div style={{ marginTop: 34, color: S.text3, fontSize: 13, fontFamily: mono }}>
          <span style={{ color: S.green }}>●</span> Kahfe Lounge'da canlı kullanılıyor
        </div>
      </section>

      {/* features */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 22px 40px' }}>
        <div style={{ textAlign: 'center', marginBottom: 34 }}>
          <div style={{ color: S.gold, fontSize: 12, fontFamily: mono, letterSpacing: 3, marginBottom: 10 }}>NELER VAR</div>
          <div style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800 }}>İşletmenizin ihtiyacı olan her şey</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{
              background: f.star ? S.goldSoft : S.bg1,
              border: `1px solid ${f.star ? 'rgba(201,168,76,.4)' : S.border}`,
              borderRadius: 18, padding: 22,
            }}>
              <div style={{ fontSize: 26, marginBottom: 12 }}>{f.icon}</div>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
                {f.title}{f.star && <span style={{ color: S.gold, fontSize: 11, fontFamily: mono, marginLeft: 8, verticalAlign: 'middle' }}>★ FARKIMIZ</span>}
              </div>
              <div style={{ color: S.text2, fontSize: 14.5, lineHeight: 1.55 }}>{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '46px 22px' }}>
        <div style={{ textAlign: 'center', marginBottom: 34 }}>
          <div style={{ color: S.gold, fontSize: 12, fontFamily: mono, letterSpacing: 3, marginBottom: 10 }}>NASIL BAŞLARIM</div>
          <div style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800 }}>3 adımda hazır</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {[
            { n: '1', t: 'İletişime geçin', d: 'Bize yazın, kafenizi tanıyalım ve ihtiyaçlarınızı konuşalım.' },
            { n: '2', t: 'Sistemi kuralım', d: 'Menünüzü, masalarınızı ve personelinizi biz hazırlayalım.' },
            { n: '3', t: 'Satışa başlayın', d: 'Tablet ve yazıcıyı bağlayın — QR menü ve mutfak ekranı hazır.' },
          ].map(s => (
            <div key={s.n} style={{ background: S.bg1, border: `1px solid ${S.border}`, borderRadius: 18, padding: 24 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: S.gold, color: '#0D0D0D', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>{s.n}</div>
              <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>{s.t}</div>
              <div style={{ color: S.text2, fontSize: 14.5, lineHeight: 1.55 }}>{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* pricing */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '46px 22px' }}>
        <div style={{ background: 'linear-gradient(160deg, #1b1b1b, #121212)', border: `1px solid ${S.border}`, borderRadius: 22, padding: '40px 28px', textAlign: 'center' }}>
          <div style={{ color: S.gold, fontSize: 12, fontFamily: mono, letterSpacing: 3, marginBottom: 12 }}>FİYATLANDIRMA</div>
          <div style={{ fontSize: 'clamp(24px,4vw,32px)', fontWeight: 800, marginBottom: 12 }}>Basit ve şeffaf</div>
          <p style={{ color: S.text2, fontSize: 16, maxWidth: 520, margin: '0 auto 26px', lineHeight: 1.55 }}>
            Tek seferlik kurulum + aylık abonelik. İşletmenizin büyüklüğüne göre net bir fiyat veriyoruz — gizli ücret yok.
          </p>
          <a href="#iletisim" style={btnGold}>Fiyat teklifi al</a>
        </div>
      </section>

      {/* contact / CTA */}
      <section id="iletisim" style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 22px 80px', textAlign: 'center' }}>
        <div style={{ fontSize: 'clamp(26px,4.5vw,40px)', fontWeight: 800, marginBottom: 14 }}>Kafenizi büyütmeye hazır mısınız?</div>
        <p style={{ color: S.text2, fontSize: 17, maxWidth: 520, margin: '0 auto 30px', lineHeight: 1.55 }}>
          Kısa bir demo ayarlayalım. Sistemi kafenizde canlı görün, sorularınızı yanıtlayalım.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" style={{ ...btnGold, background: '#25D366', color: '#0b3d1f' }}>WhatsApp'tan yazın</a>
          <a href={EMAIL} style={btnGhost}>E-posta gönderin</a>
        </div>
      </section>

      {/* footer */}
      <footer style={{ borderTop: `1px solid ${S.border}`, padding: '26px 22px', textAlign: 'center' }}>
        <div style={{ color: S.gold, fontSize: 18, fontWeight: 800, marginBottom: 4 }}>SayPOS</div>
        <div style={{ color: S.text3, fontSize: 13, fontFamily: mono }}>Kafeler için akıllı POS · {new Date().getFullYear()}</div>
        <a href="/platform" style={{ color: S.text2, fontSize: 13, fontFamily: mono, textDecoration: 'none', display: 'inline-block', marginTop: 10 }}>Giriş Yap →</a>
      </footer>
    </div>
  )
}
