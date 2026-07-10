'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

// Detects real connectivity to the backend, not just "is the wifi radio on".
// Combines the browser's online/offline events (instant, for the common case
// of wifi actually dropping) with a periodic lightweight Supabase ping
// (catches the rarer case of being on wifi with no real internet, or
// Supabase being unreachable for some other reason). Requires two
// consecutive failed pings before flagging offline, so a single flaky
// request doesn't cause a false alarm mid-service.
export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(true)
  const failures = useRef(0)

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const { error } = await supabase.from('settings').select('key').limit(1)
        if (error) throw error
        if (cancelled) return
        failures.current = 0
        setIsOnline(true)
      } catch (e) {
        if (cancelled) return
        failures.current += 1
        if (failures.current >= 2) setIsOnline(false)
      }
    }

    function handleOnline() { check() }
    function handleOffline() { setIsOnline(false) }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    check()
    const interval = setInterval(check, 15000)

    return () => {
      cancelled = true
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [])

  return isOnline
}
