// Coalesces a burst of calls into a single trailing invocation.
//
// Why this exists: every live screen (kitchen, nargile, admin table-map, admin
// order-list, patron) refetches its dataset when a realtime `orders`/`tabs`
// event arrives. During a rush, one customer order fires an INSERT plus several
// status UPDATEs, and each of those previously triggered a full refetch — on
// every open screen at once. With N orders/min across M screens that's N×M full
// reloads per minute, which is the main source of lag under load.
//
// Wrapping the refetch handler in debounce() means a flurry of events within
// `wait` ms collapses into ONE refetch fired shortly after the last event, so
// the screen still updates promptly but the database sees a fraction of the
// traffic. The INSERT handlers that append a payload row directly (kitchen /
// nargile "new order" beep) are intentionally NOT debounced — those are cheap,
// carry their own data, and must feel instant.
//
// The returned function exposes `.cancel()` so React effects can clear any
// pending trailing call on unmount and avoid a setState-after-teardown.
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait = 350,
): ((...args: A) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastArgs: A

  const debounced = (...args: A) => {
    lastArgs = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...lastArgs)
    }, wait)
  }

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  return debounced
}
