import { supabase } from './supabase'

export type OrderLine = { id: string; quantity: number; option_choice_ids?: string[] }
export type OrderResult = { id: string; tab_id: string; order_number: number; total: number; items: unknown[] }
export function orderLines(items: any[]): OrderLine[] {
  return items.map(item => ({ id: item._baseId || item.id, quantity: item.quantity ?? item.qty,
    option_choice_ids: item.option_choice_ids || item._optionChoiceIds || [] }))
}
export async function createOrder(requestId: string, table: string, items: OrderLine[], note: string | null): Promise<OrderResult> {
  const { data, error } = await supabase.rpc('pos_create_order', {
    p_request_id: requestId, p_table_name: table, p_items: items, p_note: note,
  })
  if (error) throw error
  if (!data?.id) throw new Error('Sipariş kaydı doğrulanamadı. Lütfen tekrar deneyin.')
  void supabase.functions.invoke('pos-notifications', { body: { order_id: data.id, request_id: requestId } })
    .then(({ error }) => { if (error) console.warn('Bildirim teslimi bekliyor') }).catch(() => {})
  return data as OrderResult
}
export function isRetryable(error: any): boolean {
  return !error?.code || ['40001', '40P01', '57014', '08000', '08003', '08006'].includes(error.code)
}
