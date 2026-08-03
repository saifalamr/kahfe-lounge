import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Every write in this app already goes through a PIN-authenticated staff
// session (device_sessions), but RLS previously had no way to see that —
// policies were `using (true)` everywhere, so the anon key alone (visible
// in any browser's network tab) was enough to write directly to the
// database via the REST API, bypassing the app entirely. This attaches
// the current staff session token as a header on every request; RLS
// policies check it via current_setting('request.headers') the same way
// get_client_ip() already reads x-forwarded-for for login rate-limiting.
// Pages with no logged-in session (the customer QR menu) simply send no
// token, which is correct — customers placing orders is meant to stay
// open, and their orders.insert policy doesn't require one.
// SayPOS (multi-tenant): the café ("tenant") this device serves, taken from
// the subdomain — kahfe.saypos.com -> "kahfe". Falls back to
// NEXT_PUBLIC_DEFAULT_SLUG (then "kahfe") for hosts with no usable subdomain:
// localhost, IPs, *.vercel.app previews, and bare apex domains. Kept
// ASCII-lowercase to match the DB's slug rule (restaurants.slug CHECK).
export function getRestaurantSlug(): string {
  const fallback = process.env.NEXT_PUBLIC_DEFAULT_SLUG || 'kahfe'
  if (typeof window === 'undefined') return fallback
  const host = window.location.hostname
  if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.endsWith('vercel.app')) return fallback
  const parts = host.split('.')
  if (parts.length < 3) return fallback // apex like saypos.com
  const sub = parts[0].toLowerCase()
  if (!sub || sub === 'www') return fallback
  return sub
}

const RESTAURANT_SLUG = getRestaurantSlug()

// REST/RPC requests carry BOTH the staff session token (x-session-token, as
// before) and the café slug (x-restaurant-slug). The slug is what lets a
// not-logged-in QR customer resolve their café for the menu + order path;
// request_restaurant_id() reads it via current_setting('request.headers').
const sessionAwareFetch: typeof fetch = (input, init) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kahfe_session_token') : null
  const headers = new Headers(init?.headers)
  if (token) headers.set('x-session-token', token)
  headers.set('x-restaurant-slug', RESTAURANT_SLUG)
  return fetch(input, { ...init, headers })
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: sessionAwareFetch },
})

// --- Realtime tenant auth --------------------------------------------------
// Realtime runs over a websocket, which can't carry our custom headers, so the
// café must ride inside a signed token instead. login_with_pin and
// refresh_session_jwt return one (access_token); we hand it to the realtime
// socket so RLS scopes live order/tab events to this café. REST is unaffected
// and keeps using the x-session-token header above.
const ACCESS_TOKEN_KEY = 'kahfe_access_token'
let realtimeRefreshTimer: ReturnType<typeof setInterval> | null = null

function startRealtimeRefreshTimer() {
  if (typeof window === 'undefined' || realtimeRefreshTimer) return
  // Signed token lasts 1h; the underlying session lasts 24h/30d. Renew well
  // inside the hour so the live screens never drop to an expired token.
  realtimeRefreshTimer = setInterval(() => { void refreshRealtimeToken() }, 45 * 60 * 1000)
}

// Store a freshly-minted token and point the realtime socket at it. Call this
// on login with the access_token that login_with_pin returned.
export function setRealtimeToken(accessToken: string | null) {
  if (typeof window === 'undefined' || !accessToken) return
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  supabase.realtime.setAuth(accessToken)
  startRealtimeRefreshTimer()
}

// Mint a fresh signed token from the stored session token and apply it.
// Returns false if there's no valid session to refresh from.
export async function refreshRealtimeToken(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const sessionToken = localStorage.getItem('kahfe_session_token')
  if (!sessionToken) return false
  const { data, error } = await supabase.rpc('refresh_session_jwt', { p_session_token: sessionToken })
  if (error || !data) return false
  setRealtimeToken(data as string)
  return true
}

// Ensure the realtime socket is authed for this café and stays authed. Safe to
// call on every authed page mount — the refresh timer is a module-level
// singleton, so repeated calls don't stack intervals. Handles reloads (where
// the short token isn't persisted) by minting a fresh one before subscribing.
export async function ensureRealtimeAuth(): Promise<void> {
  if (typeof window === 'undefined') return
  const existing = localStorage.getItem(ACCESS_TOKEN_KEY)
  if (existing) supabase.realtime.setAuth(existing)
  await refreshRealtimeToken()
  startRealtimeRefreshTimer()
}

// On logout: drop the token and return the socket to the plain anon key.
export function clearRealtimeToken() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  supabase.realtime.setAuth(supabaseAnonKey)
}

export type MenuItem = {
  id: string
  category_id: string
  name: string
  name_en: string
  name_ar: string
  description: string
  description_en: string
  description_ar: string
  price: number
  image_url: string
  available: boolean
  staff_only: boolean
  track_stock: boolean
  stock_quantity: number
  low_stock_threshold: number
  recommended: boolean
  order_index: number
  created_at: string
}

export type Category = {
  id: string
  name: string
  name_en: string
  name_ar: string
  icon: string
  order_index: number
  created_at: string
}
