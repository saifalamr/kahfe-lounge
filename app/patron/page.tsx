'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useConnectivity } from '@/lib/useConnectivity'
import { ConnectivityBanner } from '@/lib/ConnectivityBanner'
import { formatTL } from '../admin/lib/format'

// Read-only owner dashboard. PIN-gated through the exact same
// login_with_pin RPC every other login on this app uses (rate limiting,
// server-side check, session token) — the only difference is this page
// rejects any role other than 'owner', so a manager/staff/touchscreen PIN
// simply won't work here (and this page can't do anything but read, so
// even a leaked owner PIN can't touch an order, a price, or a payment).
//
// The session token is stored under the SAME localStorage key the rest of
// the app uses ('kahfe_session_token') so lib/supabase's sessionAwareFetch
// picks it up and attaches x-session-token automatically — this page used
// to store it under a different key ('kahfe_patron_token'), which meant
// every query gated by has_valid_session() (shifts, debt data) silently
// read as an anonymous request and came back empty. tabs/orders happened
// to have public-read policies, which is why revenue numbers still worked
// and the bug went unnoticed.

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function mondayOf(d: Date) { const day = d.getDay() === 0 ? 7 : d.getDay(); const m = startOfDay(d); m.setDate(m.getDate() - day + 1); return m }
function startOfMonth(d: Date) { const x = startOfDay(d); x.setDate(1); return x }

async function periodRevenue(fromIso: string, toIso?: string) {
  let q = supabase.from('tabs').select('cash_amount,card_amount,transfer_amount,debt_amount').eq('status', 'closed').gte('closed_at', fromIso)
  if (toIso) q = q.lte('closed_at', toIso)
  const { data } = await q
  const rows = data || []
  // Same convention as the admin analytics tab: "revenue" is cash + card +
  // transfer only. debt_amount (veresiye left on a closed tab) is tracked
  // separately — it's money the café is owed, not money it has.
  let cash = 0, card = 0, transfer = 0, debt = 0
  rows.forEach((t: any) => { cash += Number(t.cash_amount || 0); card += Number(t.card_amount || 0); transfer += Number(t.transfer_amount || 0); debt += Number(t.debt_amount || 0) })
  return { revenue: cash + card + transfer, count: rows.length, cash, card, transfer, debt }
}

// Same definition of "occupied" as the admin Kat Planı: a tab can still be
// status='open' in the DB with nothing but dismissed/voided orders on it
// (e.g. everything got cancelled), which the floor plan correctly treats as
// empty. Matching that here so the two panels never show different counts.
async function occupiedTablesCount() {
  const { data: tabs } = await supabase.from('tabs').select('id').eq('status', 'open')
  if (!tabs || tabs.length === 0) return 0
  const ids = tabs.map((t: any) => t.id)
  const { data: orders } = await supabase.from('orders').select('tab_id').in('tab_id', ids).neq('status', 'dismissed')
  return new Set((orders || []).map((o: any) => o.tab_id)).size
}

// Last `days` days of closed-tab revenue, oldest first, zero-filled — same
// bucketing convention as the admin "Günlük Ciro Trendi" chart.
async function dailyTrend(days: number) {
  const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - (days - 1))
  const { data } = await supabase.from('tabs').select('cash_amount,card_amount,transfer_amount,closed_at').eq('status', 'closed').gte('closed_at', from.toISOString())
  const buckets: Record<string, number> = {}
  for (let i = 0; i < days; i++) { const d = new Date(from); d.setDate(d.getDate() + i); buckets[d.toISOString().slice(0, 10)] = 0 }
  ;(data || []).forEach((t: any) => {
    const d = new Date(t.closed_at)
    const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10)
    const rev = Number(t.cash_amount || 0) + Number(t.card_amount || 0) + Number(t.transfer_amount || 0)
    if (key in buckets) buckets[key] += rev
  })
  return Object.entries(buckets).map(([date, revenue]) => ({ date, revenue }))
}

// Total open balance across every debtor (sum of all "borç" entries minus
// all "ödeme" entries), the same arithmetic admin's Borçlular tab uses per
// debtor, just summed across all of them. Requires a valid session — see
// the note above about why the token key matters.
async function outstandingDebt() {
  const { data } = await supabase.from('debt_transactions').select('type,amount')
  const rows = data || []
  const borc = rows.filter((t: any) => t.type === 'borç').reduce((s: number, t: any) => s + Number(t.amount || 0), 0)
  const odenen = rows.filter((t: any) => t.type === 'ödeme').reduce((s: number, t: any) => s + Number(t.amount || 0), 0)
  return Math.max(0, borc - odenen)
}

async function todayLoss(fromIso: string) {
  const [{ data: v }, { data: d }] = await Promise.all([
    supabase.from('voids').select('amount').gte('created_at', fromIso),
    supabase.from('discounts').select('discount_amount').gte('created_at', fromIso),
  ])
  const voidTotal = (v || []).reduce((s: number, x: any) => s + Number(x.amount || 0), 0)
  const discountTotal = (d || []).reduce((s: number, x: any) => s + Number(x.discount_amount || 0), 0)
  return { voidTotal, discountTotal }
}

export default function PatronPage() {
  const [auth, setAuth] = useState(false)
  const [checking, setChecking] = useState(true)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const isOnline = useConnectivity()

  const [today, setToday] = useState<{ revenue: number, count: number, cash: number, card: number, transfer: number, debt: number } | null>(null)
  const [yesterday, setYesterday] = useState<{ revenue: number, count: number } | null>(null)
  const [thisWeek, setThisWeek] = useState<{ revenue: number, count: number } | null>(null)
  const [lastWeek, setLastWeek] = useState<{ revenue: number, count: number } | null>(null)
  const [thisMonth, setThisMonth] = useState<{ revenue: number, count: number } | null>(null)
  const [trend, setTrend] = useState<{ date: string, revenue: number }[]>([])
  const [debtOutstanding, setDebtOutstanding] = useState<number | null>(null)
  const [loss, setLoss] = useState<{ voidTotal: number, discountTotal: number } | null>(null)
  const [topItem, setTopItem] = useState<{ name: string, qty: number } | null>(null)
  const [openTables, setOpenTables] = useState<number | null>(null)
  const [pendingOrders, setPendingOrders] = useState<number | null>(null)
  const [shift, setShift] = useState<{ staff_name: string, started_at: string } | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const refreshAll = useCallback(async () => {
    const now = new Date()
    const todayStart = startOfDay(now)
    const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1)
    const weekStart = mondayOf(now)
    const lastWeekStart = new Date(weekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7)
    const monthStart = startOfMonth(now)

    const [t, y, w, lw, m, tr, debt, ls, tables, pending, shifts, weekOrders] = await Promise.all([
      periodRevenue(todayStart.toISOString()),
      periodRevenue(yesterdayStart.toISOString(), todayStart.toISOString()),
      periodRevenue(weekStart.toISOString()),
      periodRevenue(lastWeekStart.toISOString(), weekStart.toISOString()),
      periodRevenue(monthStart.toISOString()),
      dailyTrend(7),
      outstandingDebt(),
      todayLoss(todayStart.toISOString()),
      occupiedTablesCount(),
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('shifts').select('staff_name,started_at').is('ended_at', null).order('started_at', { ascending: false }).limit(1),
      supabase.from('orders').select('items').gte('created_at', weekStart.toISOString()),
    ])
    setToday(t); setYesterday(y); setThisWeek(w); setLastWeek(lw); setThisMonth(m)
    setTrend(tr); setDebtOutstanding(debt); setLoss(ls)
    setOpenTables(tables ?? 0)
    setPendingOrders(pending.count ?? 0)
    setShift(shifts.data?.[0] || null)

    const itemMap: Record<string, number> = {}
    ;(weekOrders.data || []).forEach((o: any) => {
      (o.items || []).forEach((it: any) => { itemMap[it.name] = (itemMap[it.name] || 0) + Number(it.quantity || 0) })
    })
    const top = Object.entries(itemMap).sort((a, b) => b[1] - a[1])[0]
    setTopItem(top ? { name: top[0], qty: top[1] } : null)
    setLastUpdated(new Date())
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('kahfe_session_token')
    if (token) setAuth(true)
    setChecking(false)
  }, [])

  useEffect(() => {
    if (!auth) return
    refreshAll()
    const channel = supabase
      .channel('patron-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tabs' }, refreshAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refreshAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debt_transactions' }, refreshAll)
      .subscribe()
    const poll = setInterval(refreshAll, 30000)
    return () => { supabase.removeChannel(channel); clearInterval(poll) }
  }, [auth, refreshAll])

  async function login() {
    const { data, error } = await supabase.rpc('login_with_pin', { p_pin: pin, p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null }).maybeSingle() as { data: { role: string, token: string } | null, error: any }
    if (error || !data || data.role !== 'owner') { setPinError(true); return }
    localStorage.setItem('kahfe_session_token', data.token)
    setAuth(true)
  }

  function logout() {
    localStorage.removeItem('kahfe_session_token')
    setAuth(false)
    setPin('')
  }

  const S = {
    bg: '#0D0D0D', bg1: '#161616', border: 'rgba(201,168,76,.18)', gold: '#C9A84C', green: '#5FD08C', red: '#e76f5f',
    blue: '#6FA8DC', purple: '#B39DDB', orange: '#e67e22', text2: 'rgba(240,237,232,.55)',
  }

  if (checking) return <div style={{ background: S.bg, minHeight: '100vh' }} />

  if (!auth) {
    return (
      <div style={{ background: S.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, paddingTop: 'max(24px, env(safe-area-inset-top))', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
        <div style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
          <div style={{ color: S.gold, fontSize: 11, letterSpacing: 4, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 6 }}>PATRON GÖRÜNÜMÜ</div>
          <div style={{ color: '#F0EDE8', fontSize: 28, fontWeight: 800, fontFamily: "'Bricolage Grotesque', sans-serif", marginBottom: 36 }}>KAHFE LOUNGE</div>
          <input type="password" inputMode="numeric" value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setPinError(false) }}
            onKeyDown={e => e.key === 'Enter' && login()}
            placeholder="••••" maxLength={6}
            style={{ width: '100%', height: 60, background: S.bg1, border: `1px solid ${pinError ? S.red : S.border}`, borderRadius: 16, color: '#F0EDE8', fontSize: 26, textAlign: 'center', letterSpacing: '0.3em', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 14, outline: 'none' }} />
          {pinError && <div style={{ color: S.red, fontSize: 13, marginBottom: 14 }}>Hatalı şifre</div>}
          <button onClick={login} style={{ width: '100%', height: 54, background: S.gold, border: 'none', borderRadius: 16, color: '#0D0D0D', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Giriş Yap</button>
        </div>
      </div>
    )
  }

  const weekDelta = lastWeek && lastWeek.revenue > 0 ? ((thisWeek!.revenue - lastWeek.revenue) / lastWeek.revenue) * 100 : null
  const yestDelta = yesterday && yesterday.revenue > 0 && today ? ((today.revenue - yesterday.revenue) / yesterday.revenue) * 100 : null
  const avgTicket = today && today.count > 0 ? today.revenue / today.count : 0

  const maxTrend = Math.max(1, ...trend.map(d => d.revenue))
  const paymentTotal = today ? Math.max(1, today.cash + today.card + today.transfer + today.debt) : 1
  const mix: { key: 'cash' | 'card' | 'transfer' | 'debt', label: string, color: string }[] = [
    { key: 'cash', label: 'Nakit', color: S.gold },
    { key: 'card', label: 'Kart', color: S.blue },
    { key: 'transfer', label: 'Havale', color: S.purple },
    { key: 'debt', label: 'Veresiye', color: S.orange },
  ]

  return (
    <div style={{ background: S.bg, minHeight: '100vh', paddingTop: 'max(20px, env(safe-area-inset-top))', paddingBottom: 'max(30px, env(safe-area-inset-bottom))', fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <style>{`
        @keyframes patronPulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes patronIn { from{opacity:0; transform:translateY(8px)} to{opacity:1; transform:translateY(0)} }
        .patron-card { animation: patronIn .4s ease both; }
      `}</style>
      <ConnectivityBanner />
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <div style={{ color: S.gold, fontSize: 10, letterSpacing: 3, fontFamily: "'IBM Plex Mono', monospace" }}>PATRON GÖRÜNÜMÜ</div>
            <div style={{ color: '#F0EDE8', fontSize: 22, fontWeight: 800, fontFamily: "'Bricolage Grotesque', sans-serif" }}>KAHFE LOUNGE</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? S.green : S.red, animation: 'patronPulse 1.6s ease infinite' }} />
            <span style={{ color: S.text2, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}>CANLI</span>
          </div>
        </div>

        {/* Today — the big number */}
        <div className="patron-card" style={{ background: `linear-gradient(155deg, rgba(201,168,76,.12), rgba(201,168,76,.02))`, border: `1px solid ${S.border}`, borderRadius: 24, padding: '28px 24px', marginBottom: 14 }}>
          <div style={{ color: S.text2, fontSize: 12, letterSpacing: '0.08em', marginBottom: 6 }}>BUGÜN</div>
          <div style={{ color: '#F0EDE8', fontSize: 44, fontWeight: 800, fontFamily: "'Bricolage Grotesque', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
            {today ? `₺${formatTL(today.revenue)}` : '—'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ color: S.text2, fontSize: 13 }}>{today?.count ?? 0} fiş</span>
            <span style={{ color: S.text2, fontSize: 13 }}>· Ort. ₺{formatTL(avgTicket)}</span>
            {yestDelta !== null && (
              <span style={{ color: yestDelta >= 0 ? S.green : S.red, fontSize: 13, fontWeight: 700 }}>
                {yestDelta >= 0 ? '▲' : '▼'} %{Math.abs(yestDelta).toFixed(0)} dün'e göre
              </span>
            )}
          </div>
        </div>

        {/* 7-day trend */}
        <div className="patron-card" style={{ background: S.bg1, border: `1px solid ${S.border}`, borderRadius: 18, padding: '16px 18px 10px', marginBottom: 14 }}>
          <div style={{ color: S.text2, fontSize: 12, letterSpacing: '0.08em', marginBottom: 10 }}>7 GÜNLÜK CİRO TRENDİ</div>
          <svg viewBox={`0 0 ${Math.max(1, trend.length - 1) * 10} 60`} preserveAspectRatio="none" style={{ width: '100%', height: 60, display: 'block' }}>
            <polyline
              points={trend.map((d, i) => `${i * 10},${56 - (d.revenue / maxTrend) * 52}`).join(' ')}
              fill="none" stroke={S.gold} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            {trend.map((d, i) => (
              <circle key={i} cx={i * 10} cy={56 - (d.revenue / maxTrend) * 52} r="1.8" fill={S.gold} />
            ))}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: S.text2, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", marginTop: 4 }}>
            <span>{trend[0]?.date.slice(5)}</span>
            <span>{trend[trend.length - 1]?.date.slice(5)}</span>
          </div>
        </div>

        {/* Live pulse row */}
        <div className="patron-card" style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1, background: S.bg1, border: `1px solid ${S.border}`, borderRadius: 18, padding: '16px 14px' }}>
            <div style={{ color: '#F0EDE8', fontSize: 26, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace" }}>{openTables ?? '—'}</div>
            <div style={{ color: S.text2, fontSize: 11, marginTop: 2 }}>Dolu Masa</div>
          </div>
          <div style={{ flex: 1, background: S.bg1, border: `1px solid ${S.border}`, borderRadius: 18, padding: '16px 14px' }}>
            <div style={{ color: (pendingOrders ?? 0) > 0 ? S.orange : '#F0EDE8', fontSize: 26, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace" }}>{pendingOrders ?? '—'}</div>
            <div style={{ color: S.text2, fontSize: 11, marginTop: 2 }}>Bekleyen Sipariş</div>
          </div>
        </div>

        {/* Today's payment mix + loss (voids/discounts) */}
        <div className="patron-card" style={{ background: S.bg1, border: `1px solid ${S.border}`, borderRadius: 18, padding: '18px 18px', marginBottom: 14 }}>
          <div style={{ color: S.text2, fontSize: 12, letterSpacing: '0.08em', marginBottom: 12 }}>BUGÜNKÜ ÖDEME DAĞILIMI</div>
          <div style={{ display: 'flex', width: '100%', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
            {mix.map(m => {
              const val = today?.[m.key] ?? 0
              return val > 0 ? <div key={m.key} style={{ width: `${(val / paymentTotal) * 100}%`, background: m.color }} /> : null
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {mix.map(m => (
              <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                <span style={{ color: S.text2, fontSize: 11 }}>{m.label}</span>
                <span style={{ color: '#F0EDE8', fontSize: 12, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", marginLeft: 'auto' }}>₺{today ? formatTL(today[m.key]) : 0}</span>
              </div>
            ))}
          </div>
          {loss && (loss.voidTotal > 0 || loss.discountTotal > 0) && (
            <div style={{ color: S.text2, fontSize: 11, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${S.border}` }}>
              İptal ₺{formatTL(loss.voidTotal)} · İndirim ₺{formatTL(loss.discountTotal)}
            </div>
          )}
        </div>

        {/* This week vs last week */}
        <div className="patron-card" style={{ background: S.bg1, border: `1px solid ${S.border}`, borderRadius: 18, padding: '18px 18px', marginBottom: 14 }}>
          <div style={{ color: S.text2, fontSize: 12, letterSpacing: '0.08em', marginBottom: 10 }}>BU HAFTA</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ color: '#F0EDE8', fontSize: 26, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace" }}>{thisWeek ? `₺${formatTL(thisWeek.revenue)}` : '—'}</div>
            {weekDelta !== null && (
              <span style={{ color: weekDelta >= 0 ? S.green : S.red, fontSize: 13, fontWeight: 700 }}>{weekDelta >= 0 ? '▲' : '▼'} %{Math.abs(weekDelta).toFixed(0)}</span>
            )}
          </div>
          {lastWeek && <div style={{ color: S.text2, fontSize: 12, marginTop: 4 }}>Geçen hafta: ₺{formatTL(lastWeek.revenue)}</div>}
        </div>

        {/* This month */}
        <div className="patron-card" style={{ background: S.bg1, border: `1px solid ${S.border}`, borderRadius: 18, padding: '18px 18px', marginBottom: 14 }}>
          <div style={{ color: S.text2, fontSize: 12, letterSpacing: '0.08em', marginBottom: 10 }}>BU AY</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ color: '#F0EDE8', fontSize: 26, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace" }}>{thisMonth ? `₺${formatTL(thisMonth.revenue)}` : '—'}</div>
            <span style={{ color: S.text2, fontSize: 13 }}>{thisMonth?.count ?? 0} fiş</span>
          </div>
        </div>

        {/* Outstanding debt across all debtors */}
        <div className="patron-card" style={{ background: S.bg1, border: `1px solid ${S.border}`, borderRadius: 18, padding: '16px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>📒</span>
          <div>
            <div style={{ color: (debtOutstanding ?? 0) > 0 ? S.orange : '#F0EDE8', fontSize: 20, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace" }}>
              {debtOutstanding !== null ? `₺${formatTL(debtOutstanding)}` : '—'}
            </div>
            <div style={{ color: S.text2, fontSize: 12 }}>Açık veresiye</div>
          </div>
        </div>

        {/* Who's working */}
        <div className="patron-card" style={{ background: S.bg1, border: `1px solid ${S.border}`, borderRadius: 18, padding: '16px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>{shift ? '🟢' : '⚪'}</span>
          <div>
            {shift ? (
              <>
                <div style={{ color: '#F0EDE8', fontSize: 14, fontWeight: 700 }}>{shift.staff_name} vardiyada</div>
                <div style={{ color: S.text2, fontSize: 12 }}>{new Date(shift.started_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}'den beri</div>
              </>
            ) : (
              <div style={{ color: S.text2, fontSize: 13 }}>Aktif vardiya yok</div>
            )}
          </div>
        </div>

        {/* Top item */}
        {topItem && (
          <div className="patron-card" style={{ background: S.bg1, border: `1px solid ${S.border}`, borderRadius: 18, padding: '16px 18px', marginBottom: 30, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 22 }}>🏆</span>
            <div>
              <div style={{ color: '#F0EDE8', fontSize: 14, fontWeight: 700 }}>{topItem.name}</div>
              <div style={{ color: S.text2, fontSize: 12 }}>Bu haftanın en çok satanı · {topItem.qty} adet</div>
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center' }}>
          {lastUpdated && <div style={{ color: S.text2, fontSize: 11, marginBottom: 14 }}>Son güncelleme: {lastUpdated.toLocaleTimeString('tr-TR')}</div>}
          <button onClick={logout} style={{ background: 'transparent', border: `1px solid ${S.border}`, borderRadius: 10, padding: '8px 16px', color: S.text2, fontSize: 12, cursor: 'pointer' }}>Çıkış</button>
        </div>
      </div>
    </div>
  )
}
