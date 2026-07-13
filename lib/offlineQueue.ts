'use client'
import { supabase } from './supabase'

// Offline order queueing — the part of "what happens when wifi drops"
// that's actually safe to automate. Every queued order gets a client-
// generated ID at creation time; the database has a unique constraint on
// it (see client_order_id in schema.sql), so even if a retry fires twice
// (e.g. the original request actually went through right before the
// connection visibly dropped), the duplicate insert is rejected instead
// of creating a second order. That's what makes automatic retry safe here
// — payment/tab-closing doesn't get the same treatment since it has more
// side effects (invoice numbers, stock, debt records) to make safely
// idempotent, so that one still blocks instead of queues.

const QUEUE_KEY = 'kahfe_queued_orders'

export type QueuedOrder = {
  client_order_id: string
  table_name: string
  items: any[]
  total: number
  note: string | null
  created_by: string
  handled_by?: string | null
  queued_at: string
}

export function getQueuedOrders(): QueuedOrder[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveQueue(queue: QueuedOrder[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)) } catch {}
}

export function queueOrder(order: Omit<QueuedOrder, 'client_order_id' | 'queued_at'>): string {
  const client_order_id = (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const queue = getQueuedOrders()
  queue.push({ ...order, client_order_id, queued_at: new Date().toISOString() })
  saveQueue(queue)
  return client_order_id
}

export function queuedOrderCount(): number {
  return getQueuedOrders().length
}

// Attempts to actually submit every queued order. Resolves the table's tab
// (get_or_create_open_tab), inserts with its client_order_id, decrements
// stock the same as a live order would. Anything that still fails (still
// offline, or some other error) stays queued for the next attempt.
// onOrderSynced (optional) runs after each successful sync — e.g. to send
// the Telegram notification, which also needs network and couldn't fire at
// queue time.
export async function flushQueuedOrders(onOrderSynced?: (order: QueuedOrder, tabId: string) => Promise<void>) {
  const queue = getQueuedOrders()
  if (queue.length === 0) return
  const remaining: QueuedOrder[] = []
  for (const order of queue) {
    try {
      const { data: tabId, error: tabError } = await supabase.rpc('get_or_create_open_tab', { p_table_name: order.table_name })
      if (tabError || !tabId) { remaining.push(order); continue }
      const { error: insertError } = await supabase.from('orders').insert({
        table_name: order.table_name,
        items: order.items,
        total: order.total,
        status: 'pending',
        note: order.note,
        tab_id: tabId,
        created_by: order.created_by,
        handled_by: order.handled_by || null,
        client_order_id: order.client_order_id,
      })
      // 23505 = unique_violation. If this exact client_order_id already
      // exists, it succeeded on a previous attempt — treat as done, not
      // an error, rather than queueing it forever.
      if (insertError && (insertError as any).code !== '23505') { remaining.push(order); continue }
      await supabase.rpc('decrement_stock_for_order', { p_items: order.items })
      if (onOrderSynced) { try { await onOrderSynced(order, tabId) } catch {} }
    } catch {
      remaining.push(order)
    }
  }
  saveQueue(remaining)
}
