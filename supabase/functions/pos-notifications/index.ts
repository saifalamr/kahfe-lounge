import { createClient } from 'npm:@supabase/supabase-js@2.108.1'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const reply = (status: number) => new Response(JSON.stringify({ ok: status === 200 }), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply(405)
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!token) return reply(503) // No fallback to a compromised token.
  try {
    const body = await req.json()
    if (![body.order_id, body.request_id].every(x => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x))) return reply(400)
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data, error } = await db.rpc('pos_claim_notification', { p_order_id: body.order_id, p_request_id: body.request_id })
    if (error) return reply(500)
    if (!data) return reply(200)
    const { order, claim, settings } = data
    if (settings?.telegram_enabled !== false) {
      const recipients = settings?.telegram_recipients
      if (!Array.isArray(recipients) || !recipients.length) throw Error('recipients_missing')
      const lines = order.items.map((x: { quantity: number; name: string; subtotal: number }) => `${x.quantity}x ${x.name} - ${x.subtotal} TL`).join('\n')
      const text = `YENİ SİPARİŞ #${order.order_number}\nMasa: ${order.table_name}\n${lines}\nNot: ${order.note || '-'}\nTOPLAM: ${order.total} TL`
      for (const recipient of recipients) {
        if (!/^\d+$/.test(String(recipient.chat_id))) throw Error('recipient_invalid')
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: recipient.chat_id, text }), signal: AbortSignal.timeout(10000),
        })
        const result = await response.json()
        if (!response.ok || !result.ok) throw Error('telegram_delivery_failed')
      }
    }
    const { error: saveError } = await db.from('pos_notifications').update({ sent_at: new Date().toISOString() }).eq('order_id', order.id).eq('claim_token', claim)
    return reply(saveError ? 500 : 200)
  } catch { console.error('pos_notification_failed'); return reply(500) }
})
