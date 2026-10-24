'use client'
import { useEffect, useState } from 'react'
import { getQueuedOrders, retryQueuedOrder, type QueuedOrder } from './offlineQueue'
export function QueueStatus() {
  const [orders, setOrders] = useState<QueuedOrder[]>([])
  useEffect(() => {
    const refresh = () => setOrders(getQueuedOrders())
    refresh(); const timer = setInterval(refresh, 3000)
    window.addEventListener('storage', refresh)
    return () => { clearInterval(timer); window.removeEventListener('storage', refresh) }
  }, [])
  if (!orders.length) return null
  return <aside aria-label="Bekleyen siparişler" style={{ padding: 12, background: '#fff0cb', color: '#3b2a08', fontSize: 13 }}>
    <strong>{orders.length} sipariş henüz doğrulanmadı</strong>
    {orders.map(order => <div key={order.client_order_id} style={{ marginTop: 6 }}>
      {order.table_name} ({order.items.map(item => `${item.quantity}x ${item.name || item.id}`).join(', ')}): {order.last_error || 'Bağlantı ve sunucu onayı bekleniyor.'}
      {order.last_error && <button style={{ marginLeft: 8 }} onClick={async () => {
        await retryQueuedOrder(order.client_order_id); setOrders(getQueuedOrders())
      }}>Tekrar dene</button>}
    </div>)}
  </aside>
}
