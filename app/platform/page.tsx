'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// SayPOS platform panel. This is the ONLY screen that spans cafés — it's for
// the platform owner (super-admin), not a café's staff. Auth here is a real
// email/password account (Supabase Auth), separate from the in-café PINs:
// creating any café is too powerful to gate with a browser-typed PIN, so the
// database checks a super-admin membership on the signed-in account instead
// (is_super_admin() -> provision_restaurant / list_restaurants_admin).

const S = {
  bg: '#0D0D0D', bg1: '#161616', border: 'rgba(201,168,76,.18)', gold: '#C9A84C',
  green: '#5FD08C', red: '#e76f5f', text: '#F0EDE8', text2: 'rgba(240,237,232,.55)',
}
const mono = "'IBM Plex Mono', monospace"
const display = "'Bricolage Grotesque', sans-serif"

// Turkish-aware, ASCII-only slug that satisfies restaurants.slug CHECK.
function slugify(s: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u' }
  return s
    .replace(/[çğıİöşü]/g, c => map[c] || c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

type Cafe = {
  id: string; slug: string; name: string; active: boolean
  created_at: string; last_invoice_no: number; staff_count: number; menu_count: number
}

export default function PlatformPage() {
  const [checking, setChecking] = useState(true)
  const [signedIn, setSignedIn] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  // auth form
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [authMsg, setAuthMsg] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)

  // café list + create form
  const [cafes, setCafes] = useState<Cafe[]>([])
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
    const { data, error } = await supabase.rpc('list_restaurants_admin')
    if (!error && data) setCafes(data as Cafe[])
  }, [])

  const evaluateSession = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSignedIn(false); setIsAdmin(false); setChecking(false); return }
    setSignedIn(true)
    const { data: admin } = await supabase.rpc('am_i_super_admin')
    setIsAdmin(admin === true)
    if (admin === true) await loadCafes()
    setChecking(false)
  }, [loadCafes])

  useEffect(() => { void evaluateSession() }, [evaluateSession])

  async function submitAuth() {
    setAuthMsg(null); setAuthBusy(true)
    try {
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password })
        if (error) { setAuthMsg(error.message); return }
        setAuthMsg('Hesap oluşturuldu. Giriş yapabilirsiniz.')
        setAuthMode('signin')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) { setAuthMsg('Giriş başarısız: ' + error.message); return }
        setChecking(true)
        await evaluateSession()
      }
    } finally { setAuthBusy(false) }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSignedIn(false); setIsAdmin(false); setCafes([])
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
        p_manager_pin: managerPin, p_touchscreen_pin: touchscreenPin, p_owner_pin: ownerPin,
        p_tables: tableList,
      })
      if (error) { setCreateMsg({ ok: false, text: error.message }); return }
      setCreateMsg({ ok: true, text: `"${name.trim()}" oluşturuldu (${finalSlug}).` })
      setName(''); setSlug(''); setSlugTouched(false); setTables('MASA-1, MASA-2, MASA-3')
      setManagerPin('1234'); setTouchscreenPin('9000'); setOwnerPin('7777')
      await loadCafes()
    } finally { setCreating(false) }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 46, background: S.bg1, border: `1px solid ${S.border}`,
    borderRadius: 12, color: S.text, fontSize: 15, padding: '0 14px', outline: 'none',
    fontFamily: mono, boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    color: S.text2, fontSize: 11, letterSpacing: 2, fontFamily: mono, marginBottom: 6, display: 'block',
  }

  if (checking) return <div style={{ background: S.bg, minHeight: '100vh' }} />

  // --- not signed in: auth screen -----------------------------------------
  if (!signedIn) {
    return (
      <div style={{ background: S.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ color: S.gold, fontSize: 11, letterSpacing: 4, fontFamily: mono, marginBottom: 6 }}>SAYPOS · PLATFORM</div>
            <div style={{ color: S.text, fontSize: 28, fontWeight: 800, fontFamily: display }}>Yönetim Paneli</div>
          </div>
          <label style={labelStyle}>E-POSTA</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="siz@ornek.com"
            style={{ ...inputStyle, marginBottom: 14 }} />
          <label style={labelStyle}>ŞİFRE</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitAuth()} placeholder="••••••••"
            style={{ ...inputStyle, marginBottom: 18 }} />
          {authMsg && <div style={{ color: authMsg.startsWith('Hesap') ? S.green : S.red, fontSize: 13, marginBottom: 14 }}>{authMsg}</div>}
          <button onClick={submitAuth} disabled={authBusy}
            style={{ width: '100%', height: 50, background: S.gold, border: 'none', borderRadius: 12, color: '#0D0D0D', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: authBusy ? 0.6 : 1 }}>
            {authBusy ? '...' : authMode === 'signin' ? 'Giriş Yap' : 'Hesap Oluştur'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button onClick={() => { setAuthMode(m => m === 'signin' ? 'signup' : 'signin'); setAuthMsg(null) }}
              style={{ background: 'none', border: 'none', color: S.text2, fontSize: 13, cursor: 'pointer', fontFamily: mono }}>
              {authMode === 'signin' ? 'Hesabın yok mu? Oluştur' : 'Zaten hesabın var mı? Giriş yap'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- signed in but not a platform admin ---------------------------------
  if (!isAdmin) {
    return (
      <div style={{ background: S.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <div style={{ color: S.red, fontSize: 15, marginBottom: 8 }}>Bu hesap platform yöneticisi değil.</div>
          <div style={{ color: S.text2, fontSize: 13, marginBottom: 20 }}>Erişim için platform sahibine başvurun.</div>
          <button onClick={signOut} style={{ height: 44, padding: '0 20px', background: S.bg1, border: `1px solid ${S.border}`, borderRadius: 12, color: S.text, cursor: 'pointer' }}>Çıkış Yap</button>
        </div>
      </div>
    )
  }

  // --- platform admin dashboard -------------------------------------------
  return (
    <div style={{ background: S.bg, minHeight: '100vh', color: S.text, padding: '24px 20px 60px', fontFamily: display }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <div style={{ color: S.gold, fontSize: 11, letterSpacing: 4, fontFamily: mono }}>SAYPOS · PLATFORM</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>Kafeler</div>
          </div>
          <button onClick={signOut} style={{ height: 40, padding: '0 16px', background: S.bg1, border: `1px solid ${S.border}`, borderRadius: 10, color: S.text2, cursor: 'pointer', fontSize: 13 }}>Çıkış</button>
        </div>

        {/* create café */}
        <div style={{ background: S.bg1, border: `1px solid ${S.border}`, borderRadius: 16, padding: 20, marginBottom: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Yeni Kafe Oluştur</div>
          <label style={labelStyle}>KAFE ADI</label>
          <input value={name} onChange={e => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)) }}
            placeholder="Örn. Deniz Cafe" style={{ ...inputStyle, marginBottom: 14 }} />
          <label style={labelStyle}>SLUG (ADRES) — {slug || 'otomatik'}.saypos.com</label>
          <input value={slug} onChange={e => { setSlug(e.target.value); setSlugTouched(true) }}
            placeholder="deniz-cafe" style={{ ...inputStyle, marginBottom: 14, fontFamily: mono }} />
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>MÜDÜR PIN</label>
              <input value={managerPin} onChange={e => setManagerPin(e.target.value.replace(/\D/g, ''))} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>EKRAN PIN</label>
              <input value={touchscreenPin} onChange={e => setTouchscreenPin(e.target.value.replace(/\D/g, ''))} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>PATRON PIN</label>
              <input value={ownerPin} onChange={e => setOwnerPin(e.target.value.replace(/\D/g, ''))} style={inputStyle} />
            </div>
          </div>
          <label style={labelStyle}>MASALAR (virgülle ayırın)</label>
          <input value={tables} onChange={e => setTables(e.target.value)} placeholder="MASA-1, MASA-2" style={{ ...inputStyle, marginBottom: 18 }} />
          {createMsg && <div style={{ color: createMsg.ok ? S.green : S.red, fontSize: 13, marginBottom: 14 }}>{createMsg.text}</div>}
          <button onClick={createCafe} disabled={creating}
            style={{ width: '100%', height: 50, background: S.gold, border: 'none', borderRadius: 12, color: '#0D0D0D', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: creating ? 0.6 : 1 }}>
            {creating ? 'Oluşturuluyor...' : 'Kafe Oluştur'}
          </button>
        </div>

        {/* café list */}
        <div style={{ color: S.text2, fontSize: 11, letterSpacing: 2, fontFamily: mono, marginBottom: 12 }}>MEVCUT KAFELER ({cafes.length})</div>
        {cafes.map(c => (
          <div key={c.id} style={{ background: S.bg1, border: `1px solid ${S.border}`, borderRadius: 14, padding: 16, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{c.name}
                {!c.active && <span style={{ color: S.red, fontSize: 12, marginLeft: 8 }}>pasif</span>}
              </div>
              <div style={{ color: S.text2, fontSize: 12, fontFamily: mono, marginTop: 2 }}>{c.slug}.saypos.com</div>
            </div>
            <div style={{ textAlign: 'right', color: S.text2, fontSize: 12, fontFamily: mono }}>
              <div>{c.staff_count} personel · {c.menu_count} ürün</div>
              <div>son fatura #{c.last_invoice_no}</div>
            </div>
          </div>
        ))}
        {cafes.length === 0 && <div style={{ color: S.text2, fontSize: 14 }}>Henüz kafe yok.</div>}
      </div>
    </div>
  )
}
