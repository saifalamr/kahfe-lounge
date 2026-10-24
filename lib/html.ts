export function escapeHTML(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}
// Print data is JSON-like. Escape at the boundary before any HTML interpolation.
export function escapePrintData<T>(value: T): T {
  if (typeof value === 'string') return escapeHTML(value) as T
  if (Array.isArray(value)) return value.map(escapePrintData) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, escapePrintData(v)])) as T
  return value
}
