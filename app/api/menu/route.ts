import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: cats } = await sb.from('categories').select('id,name').order('order_index')
  const { data: items } = await sb.from('menu_items').select('name,category_id').eq('available', true).order('order_index')
  return NextResponse.json({ cats, items })
}
