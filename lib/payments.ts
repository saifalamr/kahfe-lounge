import { supabase } from './supabase'

export function paymentSnapshot(orders: any[]) {
  return orders.filter(o => o.status !== 'dismissed').map(o => ({ id: o.id, items: o.items, total: Number(o.total), status: o.status }))
    .sort((a, b) => a.id.localeCompare(b.id))
}
export async function payTab(input: {
  requestId: string; tab: any; selection: { order_id: string; index: number }[] | null;
  method: string; cash: number; card: number; discount: number; reason: string;
  debtorId: string; debtorName: string; debtorPhone: string;
}) {
  const { data, error } = await supabase.rpc('pos_pay_tab', {
    p_request_id: input.requestId, p_tab_id: input.tab.id, p_expected: paymentSnapshot(input.tab.orders),
    p_selection: input.selection, p_method: input.method, p_cash: input.cash, p_card: input.card,
    p_discount: input.discount, p_reason: input.reason, p_debtor_id: input.debtorId || null,
    p_debtor_name: input.debtorName || null, p_debtor_phone: input.debtorPhone || null,
  })
  if (error) throw error
  if (!data?.faturaNo) throw new Error('Ödeme kaydı doğrulanamadı. Tekrar deneyin.')
  return data
}
