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
const sessionAwareFetch: typeof fetch = (input, init) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kahfe_session_token') : null
  const headers = new Headers(init?.headers)
  if (token) headers.set('x-session-token', token)
  return fetch(input, { ...init, headers })
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: sessionAwareFetch },
})

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
