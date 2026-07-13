import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
