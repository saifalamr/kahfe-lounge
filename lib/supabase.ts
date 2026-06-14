import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Category = {
  id: string
  name: string
  icon: string
  order_index: number
  created_at: string
}

export type MenuItem = {
  id: string
  category_id: string
  name: string
  description: string
  price: number
  image_url: string
  available: boolean
  order_index: number
  created_at: string
}
