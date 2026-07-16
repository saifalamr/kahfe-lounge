// Daily database backup — run by .github/workflows/backup.yml on a
// schedule. Exports every business table to a single dated JSON file
// committed to the `backups` branch (never `main`, so this never
// triggers a Vercel deploy).
//
// Uses the SERVICE ROLE key, not the anon key: most tables now require a
// valid staff session to read (see the 2026-07-16 RLS hardening), and the
// service role bypasses RLS entirely, which is exactly what a complete
// backup needs. This key must never be used anywhere in the app itself —
// it only ever runs here, server-side, in GitHub Actions.
//
// Retention: keeps the last 30 daily snapshots. Before deleting a daily
// snapshot that's about to age out, if it's the oldest one for its
// calendar month, it's copied into backups/monthly/ first and kept
// forever. This keeps the repo small (well under GitHub's free-tier
// limits) indefinitely instead of accumulating 365+ files a year.

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync, readdirSync, unlinkSync, copyFileSync, existsSync } from 'fs'
import path from 'path'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// Every business table. Deliberately excludes device_sessions and
// login_attempts — transient security state, not business data; restoring
// old session tokens or stale rate-limit logs wouldn't mean anything.
const TABLES = [
  'access_pins', 'cash_movements', 'categories', 'day_close_reports',
  'debt_transactions', 'debtors', 'discounts', 'item_option_choices',
  'item_option_groups', 'menu_items', 'monthly_reports', 'nargile_timers',
  'orders', 'price_edits', 'refunds', 'settings', 'shifts', 'staff',
  'tabs', 'voids',
]

const PAGE_SIZE = 1000

async function fetchAllRows(table) {
  const rows = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
}

async function main() {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10) // YYYY-MM-DD
  const monthStr = now.toISOString().slice(0, 7) // YYYY-MM

  console.log(`Backing up ${TABLES.length} tables...`)
  const snapshot = { generated_at: now.toISOString(), tables: {} }
  for (const table of TABLES) {
    const rows = await fetchAllRows(table)
    snapshot.tables[table] = rows
    console.log(`  ${table}: ${rows.length} rows`)
  }

  const dailyDir = path.join(process.env.BACKUP_OUT_DIR || 'backups', 'daily')
  const monthlyDir = path.join(process.env.BACKUP_OUT_DIR || 'backups', 'monthly')
  mkdirSync(dailyDir, { recursive: true })
  mkdirSync(monthlyDir, { recursive: true })

  const todayFile = path.join(dailyDir, `${dateStr}.json`)
  writeFileSync(todayFile, JSON.stringify(snapshot, null, 2))
  console.log(`Wrote ${todayFile}`)

  // Retention: prune dailies older than 30 days, preserving one monthly
  // archive per calendar month before deleting it.
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - 30)

  const existingDaily = readdirSync(dailyDir).filter(f => f.endsWith('.json')).sort()
  const monthlyAlreadyArchived = new Set(readdirSync(monthlyDir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')))

  for (const file of existingDaily) {
    const fileDateStr = file.replace('.json', '')
    const fileDate = new Date(fileDateStr + 'T00:00:00Z')
    if (isNaN(fileDate.getTime())) continue
    if (fileDate >= cutoff) continue // still within the 30-day window, keep as-is

    const fileMonth = fileDateStr.slice(0, 7)
    if (!monthlyAlreadyArchived.has(fileMonth)) {
      copyFileSync(path.join(dailyDir, file), path.join(monthlyDir, `${fileMonth}.json`))
      monthlyAlreadyArchived.add(fileMonth)
      console.log(`Archived ${file} -> monthly/${fileMonth}.json`)
    }
    unlinkSync(path.join(dailyDir, file))
    console.log(`Pruned ${file}`)
  }

  console.log('Backup complete.')
}

main().catch(err => { console.error(err); process.exit(1) })
