'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// SayPOS home. One email/password account (Supabase Auth, separate from the
// in-café PINs). After login you see the cafés your account can open and tap
// "Aç" to go straight into that café's POS — on plain *.vercel.app this uses
// the ?r=<slug> café override, so it works with no custom domain yet.
// A platform super-admin additionally gets the "create café" tool; a café
// owner just sees their own café(s).

const S = {
  bg: '#0D0D0D', bg1: '#161616', bg2: '#1e1e1e', border: 'rgba(201,168,76,.18)',
  gold: '#C9A84C', green: '#5FD08C', red: '#e76f5f', text: '#F0EDE8', text2: 'rgba(240,237,232,.55)',
}
const mono = "'IBM Plex Mono', monospace"
const display = "'Bricolage Grotesque', sans-serif"

function slugify(s: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u' }
  return s.replace(/[çğıİöşü]/g, c => map[c] || c).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

type Cafe = {
  id: string; slug: string; name: string; active: boolean
  last_invoice_no: number; staff_count: number; menu_count: number
}

export default function PlatformPage() {
  const [checking, setChecking] = useState(true)
  const [signedIn, setSignedIn] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [cafes, setCafes] = useState<Cafe[]>([])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [authMsg, setAuthMsg] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [managerPin, setManagerPin] = useState('1234')
  const [touchscreenPin, setTouchscreenPin] = useState('9000')
  const [ownerPin, setOwnerPin] = useState('7777')
  const [tables, setTables] = useState('MASA-1, MASA-2, MASA-3')
  const [createMsg, setCreateMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [creating, setCreating] = useState(false)

  const loadCafes = useCallback(async () => {
    const { data } = await supabase.rpc('my_cafes')
    if (data) setCafes(data as Cafe[])
  }, [])

  const evaluateSession = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSignedIn(false); setChecking(false); return }
    setSignedIn(true)
    const { data: admin } = await supabase.rpc('am_i_super_admin')
    setIsAdmin(admin === true)
    await loadCafes()
    setChecking(false)
  }, [loadCafes])

  useEffect(() => { void evaluateSession() }, [evaluateSession])

  async function submitAuth() {
    setAuthMsg(null); setAuthBusy(true)
    try {
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password })
        if (error) { setAuthMsg(error.message); return }
        setAuthMsg('Hesap oluşturuldu. Şimdi giriş yapın.'); setAuthMode('signin')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) { setAuthMsg('Giriş başarısız: ' + error.message); return }
        setChecking(true); await evaluateSession()
      }
    } finally { setAuthBusy(false) }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSignedIn(false); setIsAdmin(false); setCafes([]); setShowCreate(false)
  }

  async function createCafe() {
    setCreateMsg(null)
    const finalSlug = (slugTouched ? slug : slugify(name)).trim()
    const tableList = tables.split(/[,\n]/).map(t => t.trim()).filter(Boolean)
    if (!name.trim()) { setCreateMsg({ ok: false, text: 'Kafe adı gerekli.' }); return }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(finalSlug)) {
      setCreateMsg({ ok: false, text: 'Geçersiz slug (yalnızca a-z, 0-9, tire).' }); return
    }
    setCreating(true)
    try {
      const { error } = await supabase.rpc('provision_restaurant', {
        p_slug: finalSlug, p_name: name.trim(),
        p_manager_pin: managerPin, p_touchscreen_pin: touchscreenPin, p_owner_pin: ownerPin, p_tables: tableList,
      })
      if (error) { setCreateMsg({ ok: false, text: error.message }); return }
      setCreateMsg({ ok: true, text: `"${name.trim()}" oluşturuldu.` })
      setName(''); setSlug(''); setSlugTouched(false); setTables('MASA-1, MASA-2, MASA-3')
      setManagerPin('1234'); setTouchscreenPin('9000'); setOwnerPin('7777')
      await loadCafes()
    } finally { setCreating(false) }
  }

  const input: React.CSSProperties = {
    width: '100%', height: 46, background: S.bg2, border: `1px solid ${S.border}`, borderRadius: 12,
    color: S.text, fontSize: 15, padding: '0 14px', outline: 'none', fontFamily: mono, boxSizing: 'border-box',
  }
  const label: React.CSSProperties = { color: S.text2, fontSize: 11, letterSpacing: 2, fontFamily: mono, marginBottom: 6, display: 'block' }
  const brand = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ color: S.gold, fontSize: 22, fontWeight: 800, fontFamily: display, letterSpacing: 1 }}>SayPOS</span>
      <span style={{ color: S.text2, fontSize: 10, letterSpacing: 3, fontFamily: mono }}>PLATFORM</span>
    </div>
  )

  if (checking) return <div style={{ background: S.bg, minHeight: '100vh' }} />

  // --- login --------------------------------------------------------------
  if (!signedIn) {
    return (
      <div style={{ background: S.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ textAlign: 'center', marginBottom: 34 }}>
            <div style={{ color: S.gold, fontSize: 34, fontWeight: 800, fontFamily: display, letterSpacing: 1 }}>SayPOS</div>
            <div style={{ color: S.text2, fontSize: 12, letterSpacing: 3, fontFamily: mono, marginTop: 4 }}>KAFE YÖNETİM PLATFORMU</div>
          </div>
          <label style={label}>E-POSTA</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="siz@ornek.com" style={{ ...input, marginBottom: 14 }} />
          <label style={label}>ŞİFRE</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitAuth()} placeholder="••••••••" style={{ ...input, marginBottom: 18 }} />
          {authMsg && <div style={{ color: authMsg.startsWith('Hesap') ? S.green : S.red, fontSize: 13, marginBottom: 14 }}>{authMsg}</div>}
          <button onClick={submitAuth} disabled={authBusy} style={{ width: '100%', height: 50, background: S.gold, border: 'none', borderRadius: 12, color: '#0D0D0D', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: authBusy ? 0.6 : 1 }}>
            {authBusy ? '...' : authMode === 'signin' ? 'Giriş Yap' : 'Hesap Oluştur'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button onClick={() => { setAuthMode(m => m === 'signin' ? 'signup' : 'signin'); setAuthMsg(null) }} style={{ background: 'none', border: 'none', color: S.text2, fontSize: 13, cursor: 'pointer', fontFamily: mono }}>
              {authMode === 'signin' ? 'Hesabın yok mu? Oluştur' : 'Giriş yap'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- home ---------------------------------------------------------------
  return (
    <div style={{ background: S.bg, minHeight: '100vh', color: S.text, padding: '22px 20px 60px', fontFamily: display }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
          {brand}
          <button onClick={signOut} style={{ height: 38, padding: '0 14px', background: S.bg1, border: `1px solid ${S.border}`, borderRadius: 10, color: S.text2, cursor: 'pointer', fontSize: 13 }}>Çıkış</button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Kafelerim</div>
          {isAdmin && (
            <button onClick={() => setShowCreate(v => !v)} style={{ height: 40, padding: '0 16px', background: showCreate ? S.bg1 : S.gold, border: showCreate ? `1px solid ${S.border}` : 'none', borderRadius: 10, color: showCreate ? S.text : '#0D0D0D', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
              {showCreate ? 'Kapat' : '+ Yeni Kafe'}
            </button>
          )}
        </div>

        {isAdmin && showCreate && (
          <div style={{ background: S.bg1, border: `1px solid ${S.border}`, borderRadius: 16, padding: 20, marginBottom: 26 }}>
            <label style={label}>KAFE ADI</label>
            <input value={name} onChange={e => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)) }} placeholder="Örn. Deniz Cafe" style={{ ...input, marginBottom: 14 }} />
            <label style={label}>ADRES — {slug || 'otomatik'}.saypos.com</label>
            <input value={slug} onChange={e => { setSlug(e.target.value); setSlugTouched(true) }} placeholder="deniz-cafe" style={{ ...input, marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}><label style={label}>MÜDÜR PIN</label><input value={managerPin} onChange={e => setManagerPin(e.target.value.replace(/\D/g, ''))} style={input} /></div>
              <div style={{ flex: 1 }}><label style={label}>EKRAN PIN</label><input value={touchscreenPin} onChange={e => setTouchscreenPin(e.target.value.replace(/\D/g, ''))} style={input} /></div>
              <div style={{ flex: 1 }}><label style={label}>PATRON PIN</label><input value={ownerPin} onChange={e => setOwnerPin(e.target.value.replace(/\D/g, ''))} style={input} /></div>
            </div>
            <label style={label}>MASALAR (virgülle)</label>
            <input value={tables} onChange={e => setTables(e.target.value)} style={{ ...input, marginBottom: 16 }} />
            {createMsg && <div style={{ color: createMsg.ok ? S.green : S.red, fontSize: 13, marginBottom: 12 }}>{createMsg.text}</div>}
            <button onClick={createCafe} disabled={creating} style={{ width: '100%', height: 48, background: S.gold, border: 'none', borderRadius: 12, color: '#0D0D0D', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: creating ? 0.6 : 1 }}>
              {creating ? 'Oluşturuluyor...' : 'Kafe Oluştur'}
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {cafes.map(c => (
            <div key={c.id} style={{ background: S.bg1, border: `1px solid ${S.border}`, borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 2 }}>{c.name}{!c.active && <span style={{ color: S.red, fontSize: 12, marginLeft: 8 }}>pasif</span>}</div>
              <div style={{ color: S.text2, fontSize: 12, fontFamily: mono, marginBottom: 14 }}>{c.slug}.saypos.com</div>
              <div style={{ color: S.text2, fontSize: 12, fontFamily: mono, marginBottom: 16, lineHeight: 1.6 }}>
                {c.staff_count} personel · {c.menu_count} ürün<br />son fatura #{c.last_invoice_no}
              </div>
              <a href={`/?r=${encodeURIComponent(c.slug)}`}
                style={{ marginTop: 'auto', display: 'block', textAlign: 'center', height: 46, lineHeight: '46px', background: S.gold, borderRadius: 12, color: '#0D0D0D', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
                Aç →
              </a>
            </div>
          ))}
        </div>
        {cafes.length === 0 && (
          <div style={{ color: S.text2, fontSize: 14, marginTop: 8 }}>
            {isAdmin ? 'Henüz kafe yok. "+ Yeni Kafe" ile oluşturun.' : 'Hesabınıza atanmış kafe yok.'}
          </div>
        )}
      </div>
    </div>
  )
}
