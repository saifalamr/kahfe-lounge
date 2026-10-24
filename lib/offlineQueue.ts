'use client'
import { getRestaurantSlug } from './supabase'
import { createOrder, isRetryable, orderLines } from './orders'

export type QueuedOrder = {
  client_order_id: string; table_name: string; items: any[]; total: number;
  note: string | null; created_by: string; handled_by?: string | null;
  queued_at: string; last_error?: string;
}
const prefix = () => `kahfe_order:${getRestaurantSlug()}:`
const key = (id: string) => prefix() + id
export function getQueuedOrders(): QueuedOrder[] {
  const orders: QueuedOrder[] = []
  const old = localStorage.getItem('kahfe_queued_orders')
  if (old) {
    try {
      for (const entry of JSON.parse(old)) {
        const id = entry.client_order_id || crypto.randomUUID()
        if (!localStorage.getItem(key(id))) localStorage.setItem(key(id), JSON.stringify({ ...entry, client_order_id: id, last_error: entry.last_error || 'Önceki sürümden kalan sipariş. İşletme, masa ve ürünleri kontrol ederek tekrar deneyin.' }))
      }
      localStorage.removeItem('kahfe_queued_orders')
    } catch { /* Keep the original on quota/corruption failure. */ }
  }
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k?.startsWith(prefix())) continue
    try { orders.push(JSON.parse(localStorage.getItem(k)!)) } catch { /* Preserve for recovery. */ }
  }
  return orders.sort((a, b) => a.queued_at.localeCompare(b.queued_at))
}
export function queueOrder(order: Omit<QueuedOrder, 'client_order_id' | 'queued_at'>, requestId = crypto.randomUUID()): string {
  // Throw on quota failure; never claim an order was queued unless persisted.
  localStorage.setItem(key(requestId), JSON.stringify({ ...order, client_order_id: requestId, queued_at: new Date().toISOString() }))
  return requestId
}
export function queuedOrderCount(): number { return getQueuedOrders().length }
export function removeQueuedOrder(id: string) { localStorage.removeItem(key(id)) }
export function retryQueuedOrder(id: string) {
  const order = getQueuedOrders().find(o => o.client_order_id === id)
  if (!order) return
  delete order.last_error
  localStorage.setItem(key(id), JSON.stringify(order))
  return flushQueuedOrders()
}
let flushing: Promise<void> | null = null
export function flushQueuedOrders(onOrderSynced?: (order: QueuedOrder, tabId: string) => Promise<void>): Promise<void> {
  if (flushing) return flushing
  flushing = (async () => {
    for (const order of getQueuedOrders()) {
      if (order.last_error) continue
      try {
        const result = await createOrder(order.client_order_id, order.table_name, orderLines(order.items), order.note)
        removeQueuedOrder(order.client_order_id)
        try { await onOrderSynced?.(order, result.tab_id) } catch { /* Already committed. */ }
      } catch (error: any) {
        if (!isRetryable(error)) localStorage.setItem(key(order.client_order_id), JSON.stringify({ ...order, last_error: error.message || 'Sipariş doğrulanamadı' }))
      }
    }
  })().finally(() => { flushing = null })
  return flushing
}
