// Shared formatting helpers for the admin panel and its print templates.

export function formatTL(amount: number): string {
  return amount.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
