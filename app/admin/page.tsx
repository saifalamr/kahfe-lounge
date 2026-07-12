'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase, Category, MenuItem } from '@/lib/supabase'
import ImageCropper from './components/ImageCropper'
import NotificationPopup from './components/NotificationPopup'
import VoidModal from './components/VoidModal'
import CancelOrderModal from './components/CancelOrderModal'
import TransferPickerModal from './components/TransferPickerModal'
import MonthlyReportModal from './components/MonthlyReportModal'
import DayCloseModal from './components/DayCloseModal'
import ItemReportModal from './components/ItemReportModal'
import StaffReportModal from './components/StaffReportModal'
import DebtorDetailModal from './components/DebtorDetailModal'
import { useConnectivity } from '@/lib/useConnectivity'
import { ConnectivityBanner } from '@/lib/ConnectivityBanner'
import { printKitchenTicket, printReceipt, exportOrdersPDF, exportMonthlyReportPDF, printStaffReportPDF, printDayClosePDF, printItemReportPDF } from './lib/printTemplates'
import { formatTL } from './lib/format'

// Manager/Touchscreen/shared-staff-code PINs are verified server-side via
// the verify_access_pin RPC (see access_pins table) - nothing sensitive is
// hardcoded in this file anymore, since anything here ships straight to
// the browser and is readable by anyone who opens dev tools.

/* ── Main Admin Page ── */
export default function AdminPage() {
  const isOnline = useConnectivity()

  // Load the redesign's font system client-side (scoped to this page only —
  // the customer-facing menu keeps its own font/theme untouched)
  useEffect(() => {
    if (document.getElementById('kahfe-admin-fonts')) return
    const link = document.createElement('link')
    link.id = 'kahfe-admin-fonts'
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap'
    document.head.appendChild(link)
  }, [])

  const [auth, setAuth] = useState(false)
  const [role, setRole] = useState<'manager' | 'staff' | 'touchscreen' | null>(null)
  const [staffPermission, setStaffPermission] = useState<'full' | 'limited'>('full')
  const isManager = role === 'manager'
  const canPrint = role === 'touchscreen'
  // A 'Kısıtlı' staff member can only add orders and take payment — no
  // voids, no order cancellation, no discounts, no debt (Borç), no table
  // transfer/merge. Doesn't apply to manager or touchscreen, only to
  // individual staff PINs marked limited in Personel.
  const isLimitedStaff = role === 'staff' && staffPermission === 'limited'
  const [staffName, setStaffName] = useState<string>('')
  const [notifications, setNotifications] = useState<any[]>([])
  const [showNotif, setShowNotif] = useState(false)
  const [newOrderAlert, setNewOrderAlert] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Mobile browsers (iOS Safari, Android Chrome) refuse to let a fresh
  // AudioContext produce sound until it's been "unlocked" by a real user
  // tap/click somewhere on the page first - a new AudioContext created
  // straight from a realtime event (no gesture attached) stays silently
  // suspended. Desktop doesn't have this restriction, which is why the
  // notification beep worked there but not on mobile. Keeping one
  // AudioContext alive across the whole session and unlocking it on the
  // very first tap (see effect below) fixes that.
  const audioCtxRef = useRef<AudioContext | null>(null)
  // Tracks notifications the user has already acknowledged (Gördüm) so the
  // polling fallback below doesn't resurrect them - acknowledging doesn't
  // change the order's DB status, only dismissing (Kapat) does
  const acknowledgedIds = useRef<Set<string>>(new Set())

  // Unlock the shared AudioContext on the very first tap/click anywhere on
  // the page (works whether that's the login screen or, for a device
  // that's already logged in from a previous session, the first touch
  // after reload) so the notification beep can actually play later.
  useEffect(() => {
    function unlock() {
      if (!audioCtxRef.current) {
        try { audioCtxRef.current = new AudioContext() } catch (e) { return }
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {})
      }
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('touchstart', unlock)
    }
    document.addEventListener('pointerdown', unlock)
    document.addEventListener('touchstart', unlock)
    return () => {
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('touchstart', unlock)
    }
  }, [])

  function playNotifSound() {
    if (localStorage.getItem('kahfe_notif_sound') === 'off') return
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
      const ctx = audioCtxRef.current
      const fire = () => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = 880; gain.gain.value = 0.3
        osc.start(); osc.stop(ctx.currentTime + 0.15)
        setTimeout(() => { const o2 = ctx.createOscillator(); const g2 = ctx.createGain(); o2.connect(g2); g2.connect(ctx.destination); o2.frequency.value = 1100; g2.gain.value = 0.3; o2.start(); o2.stop(ctx.currentTime + 0.15) }, 200)
      }
      // If the context is still suspended (e.g. no tap registered yet, or
      // the mobile browser re-suspended it after backgrounding), resume it
      // first — resume() itself doesn't need a fresh gesture once the
      // context has been unlocked once already this session.
      if (ctx.state === 'suspended') ctx.resume().then(fire).catch(() => {})
      else fire()
    } catch (e) {}
  }

  // Tracks which pending order IDs have already been seen (via realtime or
  // a previous poll), so the 15s polling fallback below can tell a
  // genuinely new order apart from ones it's already reported on. This
  // matters most on mobile: backgrounding a browser tab commonly drops the
  // realtime websocket, so polling becomes the only way new orders (and
  // their sound alert) get noticed at all until the tab is foregrounded.
  const seenOrderIdsRef = useRef<Set<string> | null>(null)

  async function refreshNotifications() {
    const { data } = await supabase.from('orders').select('*').eq('status', 'pending').order('created_at', { ascending: false })
    if (!data) return
    if (seenOrderIdsRef.current === null) {
      // First load this session - just record what's already pending, don't beep for it
      seenOrderIdsRef.current = new Set(data.map((o: any) => o.id))
    } else {
      const newlySeen = data.filter((o: any) => !seenOrderIdsRef.current!.has(o.id))
      if (newlySeen.length > 0) {
        setNewOrderAlert(true)
        playNotifSound()
      }
      seenOrderIdsRef.current = new Set(data.map((o: any) => o.id))
    }
    setNotifications(data.filter((o: any) => !acknowledgedIds.current.has(o.id)))
  }

  useEffect(() => {
    if (!auth) return
    // Load pending orders on mount
    refreshNotifications()

    // Real-time subscription for new orders
    const channel = supabase
      .channel('orders-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        setNotifications(prev => [payload.new, ...prev])
        setNewOrderAlert(true)
        loadTableMapData()
        if (seenOrderIdsRef.current) seenOrderIdsRef.current.add((payload.new as any).id)
        // Play beep sound (respects the Ayarlar sound toggle for this device)
        playNotifSound()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => loadTableMapData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tabs' }, () => loadTableMapData())
      .subscribe()

    loadTableMapData()

    // Polling fallback in case realtime isn't enabled/working for this
    // Supabase project - checks every 15s regardless of which tab is open
    const notifPoll = setInterval(refreshNotifications, 15000)

    return () => { supabase.removeChannel(channel); clearInterval(notifPoll) }
  }, [auth])

  async function acceptOrder(id: string) {
    // Just acknowledges the popup notification - the order itself stays
    // 'pending' until it's marked Tamamlandı from the main list/table map
    acknowledgedIds.current.add(id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  async function dismissOrder(id: string) {
    await supabase.from('orders').update({ status: 'dismissed' }).eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)
  // Distinct from pwError: this fires when the login RPC itself fails
  // (missing/broken function, e.g. a SQL migration that never got run) —
  // without this, that failure looked identical to "wrong password" and
  // was genuinely undiagnosable from the login screen alone.
  const [loginSystemError, setLoginSystemError] = useState('')
  const [tab, setTab] = useState<'categories' | 'items' | 'orders' | 'staff' | 'settings' | 'debts' | 'receipts' | 'accountability'>('orders')
  const [allOrders, setAllOrders] = useState<any[]>([])
  const [orderSearchQuery, setOrderSearchQuery] = useState('')
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'map'|'list'|'floor'>('map')
  const [openTabs, setOpenTabs] = useState<any[]>([])
  const [tabOrders, setTabOrders] = useState<any[]>([])
  const [activeTableModal, setActiveTableModal] = useState<string | null>(null)

  const DEFAULT_TABLES = [
    ...Array.from({ length: 11 }, (_, i) => `MASA-${i + 1}`),
    ...Array.from({ length: 3 }, (_, i) => `KİTAPLIK-${i + 1}`),
    ...Array.from({ length: 4 }, (_, i) => `OKEY-${i + 1}`),
    ...Array.from({ length: 2 }, (_, i) => `KAHFE-${i + 1}`),
    'VİP-ODA',
  ]
  const [ALL_TABLES, setAllTables] = useState<string[]>(DEFAULT_TABLES)
  const [telegramRecipients, setTelegramRecipients] = useState<{ name: string, chat_id: string }[]>([])
  const [telegramEnabled, setTelegramEnabled] = useState(true)
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false)
  const [categoryStations, setCategoryStations] = useState<Record<string, 'kitchen'|'nargile'>>({})
  const [notifSoundOn, setNotifSoundOn] = useState(true)
  const [newTableName, setNewTableName] = useState('')
  const [newRecipientName, setNewRecipientName] = useState('')
  const [newRecipientChatId, setNewRecipientChatId] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('kahfe_notif_sound')
    if (saved !== null) setNotifSoundOn(saved !== 'off')
  }, [])

  async function loadSettings() {
    const { data } = await supabase.from('settings').select('key,value').in('key', ['tables', 'telegram_recipients', 'telegram_enabled', 'category_stations', 'auto_print_enabled', 'table_positions'])
    const tablesRow = data?.find((r: any) => r.key === 'tables')
    const recipientsRow = data?.find((r: any) => r.key === 'telegram_recipients')
    const telegramEnabledRow = data?.find((r: any) => r.key === 'telegram_enabled')
    const stationsRow = data?.find((r: any) => r.key === 'category_stations')
    const autoPrintRow = data?.find((r: any) => r.key === 'auto_print_enabled')
    const positionsRow = data?.find((r: any) => r.key === 'table_positions')
    setAllTables(Array.isArray(tablesRow?.value) && tablesRow.value.length > 0 ? tablesRow.value : DEFAULT_TABLES)
    setTelegramRecipients(Array.isArray(recipientsRow?.value) ? recipientsRow.value : [])
    setTelegramEnabled(telegramEnabledRow?.value !== false)
    setCategoryStations(stationsRow?.value && typeof stationsRow.value === 'object' ? stationsRow.value : {})
    setAutoPrintEnabled(autoPrintRow?.value === true)
    setTablePositions(positionsRow?.value && typeof positionsRow.value === 'object' ? positionsRow.value : {})
  }

  async function toggleTelegramEnabled() {
    const next = !telegramEnabled
    await supabase.from('settings').upsert({ key: 'telegram_enabled', value: next, updated_at: new Date().toISOString() })
    setTelegramEnabled(next)
  }

  async function toggleAutoPrintEnabled() {
    const next = !autoPrintEnabled
    await supabase.from('settings').upsert({ key: 'auto_print_enabled', value: next, updated_at: new Date().toISOString() })
    setAutoPrintEnabled(next)
  }

  // Manager-only PIN changes for Yönetici/Dokunmatik Ekran/Personel(Genel) —
  // the actual current PIN is never fetched or shown (matches how it's
  // stored server-side with no select policy); this only ever writes a new
  // one. Gated to isManager in the UI below, same as the rest of Ayarlar.
  const [accessPinInputs, setAccessPinInputs] = useState<Record<string, string>>({})
  const [accessPinMsg, setAccessPinMsg] = useState<Record<string, string>>({})
  async function updateAccessPin(role: 'manager'|'touchscreen'|'staff_shared') {
    const newPin = (accessPinInputs[role] || '').trim()
    if (!/^\d{4,6}$/.test(newPin)) {
      setAccessPinMsg(prev => ({ ...prev, [role]: '✗ 4-6 haneli bir sayı girin' }))
      return
    }
    const sessionToken = localStorage.getItem('kahfe_session_token')
    const { error } = await supabase.rpc('update_access_pin', { p_session_token: sessionToken, p_role: role, p_new_pin: newPin })
    if (error) {
      setAccessPinMsg(prev => ({ ...prev, [role]: '✗ Güncellenemedi: ' + error.message }))
      return
    }
    setAccessPinInputs(prev => ({ ...prev, [role]: '' }))
    setAccessPinMsg(prev => ({ ...prev, [role]: '✓ Şifre güncellendi' }))
    setTimeout(() => setAccessPinMsg(prev => ({ ...prev, [role]: '' })), 3000)
  }

  async function setCategoryStation(categoryId: string, station: 'kitchen'|'nargile') {
    const next = { ...categoryStations, [categoryId]: station }
    await supabase.from('settings').upsert({ key: 'category_stations', value: next, updated_at: new Date().toISOString() })
    setCategoryStations(next)
  }

  // Which physical station (kitchen printer vs nargile printer) a menu
  // item's category is routed to, for the split-ticket printing below
  function stationForItem(itemId: string): 'kitchen'|'nargile' {
    const menuItem = items.find(i => i.id === itemId)
    if (!menuItem) return 'kitchen'
    return categoryStations[menuItem.category_id] || 'kitchen'
  }

  function filterOrdersByStation(orders: any[], station: 'kitchen'|'nargile') {
    return orders
      .map((o: any) => ({ ...o, items: (o.items || []).filter((it: any) => stationForItem(it.id) === station) }))
      .filter((o: any) => o.items.length > 0)
  }

  async function saveTables(newList: string[]) {
    await supabase.from('settings').upsert({ key: 'tables', value: newList, updated_at: new Date().toISOString() })
    setAllTables(newList)
  }

  async function addTable() {
    const name = newTableName.trim().toUpperCase()
    if (!name) return
    if (ALL_TABLES.includes(name)) { alert('Bu masa adı zaten var.'); return }
    await saveTables([...ALL_TABLES, name])
    setNewTableName('')
  }

  async function removeTable(name: string) {
    const hasOpenTab = openTabs.some((t: any) => t.table_name === name)
    if (hasOpenTab) { alert(`${name} şu anda açık bir hesaba sahip. Önce masayı kapatın.`); return }
    if (!confirm(`"${name}" masasını silmek istediğinizden emin misiniz?`)) return
    await saveTables(ALL_TABLES.filter(t => t !== name))
  }

  async function saveTelegramRecipients(newList: { name: string, chat_id: string }[]) {
    await supabase.from('settings').upsert({ key: 'telegram_recipients', value: newList, updated_at: new Date().toISOString() })
    setTelegramRecipients(newList)
  }

  async function addTelegramRecipient() {
    const name = newRecipientName.trim()
    const chatId = newRecipientChatId.trim()
    if (!name || !/^\d+$/.test(chatId)) { alert('Lütfen bir isim ve sayısal bir Telegram chat ID girin.'); return }
    if (telegramRecipients.some(r => r.chat_id === chatId)) { alert('Bu chat ID zaten ekli.'); return }
    await saveTelegramRecipients([...telegramRecipients, { name, chat_id: chatId }])
    setNewRecipientName(''); setNewRecipientChatId('')
  }

  async function removeTelegramRecipient(chatId: string) {
    await saveTelegramRecipients(telegramRecipients.filter(r => r.chat_id !== chatId))
  }

  function toggleNotifSound() {
    const next = !notifSoundOn
    setNotifSoundOn(next)
    localStorage.setItem('kahfe_notif_sound', next ? 'on' : 'off')
  }

  // Table map state is intentionally independent from the today/week/month
  // stats filter and any Sıfırla reset — an occupied table must never
  // disappear from the map just because the manager reset the daily stats.
  async function loadTableMapData() {
    const { data: tabsData } = await supabase.from('tabs').select('*').eq('status', 'open')
    setOpenTabs(tabsData || [])
    if (tabsData && tabsData.length > 0) {
      const tabIds = tabsData.map((t: any) => t.id)
      const { data: ordersData } = await supabase.from('orders').select('*').in('tab_id', tabIds).order('created_at', { ascending: true })
      setTabOrders(ordersData || [])
    } else {
      setTabOrders([])
    }
  }

  function getTableInfo(tableName: string) {
    const openTab = openTabs.find((t: any) => t.table_name === tableName)
    if (!openTab) return { status: 'empty' as const, tabData: null, orders: [] as any[] }
    const orders = tabOrders.filter((o: any) => o.tab_id === openTab.id)
    // Dismissed (cancelled/voided) orders don't count toward "this table is
    // occupied" — a tab can still technically be open in the database (e.g.
    // every order on it got cancelled, or it was created but never got an
    // order) while having nothing active left. Without this filter the map
    // tile showed "Dolu" even though the detail view correctly showed the
    // table as empty, since the two used different filtering rules on the
    // same data.
    const activeOrders = orders.filter((o: any) => o.status !== 'dismissed')
    if (activeOrders.length === 0) return { status: 'empty' as const, tabData: openTab, orders }
    const hasPending = activeOrders.some((o: any) => o.status === 'pending')
    let status: 'pending'|'bill'|'occupied' = 'occupied'
    if (hasPending) status = 'pending'
    else if (openTab.bill_requested) status = 'bill'
    return { status, tabData: openTab, orders }
  }

  // Table transfer/merge — moving a tab to an empty table renames it in
  // place; moving it onto a table that already has an open tab merges the
  // two into one bill. Done via an atomic RPC (advisory lock) so two
  // simultaneous transfers can't collide.
  const [showTransferPicker, setShowTransferPicker] = useState<string | null>(null)

  async function transferOrMergeTab(sourceTableName: string, destTableName: string) {
    const sourceTab = openTabs.find((t: any) => t.table_name === sourceTableName)
    if (!sourceTab) return
    const destInfo = getTableInfo(destTableName)
    const verb = destInfo.status === 'empty' ? 'taşınacak' : 'ile birleştirilecek'
    if (!confirm(`${sourceTableName} masasındaki adisyon ${destTableName} masasına ${verb}. Emin misiniz?`)) return
    const { error } = await supabase.rpc('merge_or_transfer_tab', { p_source_tab_id: sourceTab.id, p_destination_table_name: destTableName })
    if (error) { alert('✗ İşlem başarısız oldu.\n\n' + error.message); return }
    setShowTransferPicker(null)
    setActiveTableModal(null)
    await loadTableMapData()
  }

  async function updateOrderStatus(id: string, status: string) {
    await supabase.from('orders').update({ status, handled_by: staffName }).eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
    await Promise.all([loadOrders(dateFilter), loadTableMapData()])
  }

  // Item-level void — removes one line item from an order, recomputes the
  // total, and logs who/why for accountability (a real audit trail, not a
  // silent edit)
  const [voidingItem, setVoidingItem] = useState<{ order: any, itemIndex: number } | null>(null)
  const [voidReason, setVoidReason] = useState('')

  function openVoid(order: any, itemIndex: number) {
    setVoidingItem({ order, itemIndex })
    setVoidReason('')
  }

  async function confirmVoid() {
    if (!voidingItem) return
    if (!voidReason.trim()) { alert('Lütfen bir iptal nedeni girin.'); return }
    const { order, itemIndex } = voidingItem
    const item = order.items[itemIndex]
    const newItems = order.items.filter((_: any, i: number) => i !== itemIndex)
    const newTotal = newItems.reduce((s: number, it: any) => s + Number(it.subtotal), 0)
    const updates: any = { items: newItems, total: newTotal, handled_by: staffName }
    if (newItems.length === 0) updates.status = 'dismissed'

    const { error } = await supabase.from('orders').update(updates).eq('id', order.id)
    if (error) {
      alert('✗ İptal edilemedi.\n\n' + error.message)
      return
    }
    await supabase.from('voids').insert({
      order_id: order.id,
      table_name: order.table_name,
      item_name: item.name,
      quantity: item.quantity,
      amount: item.subtotal,
      reason: voidReason.trim(),
      voided_by: staffName,
    })
    setVoidingItem(null)
    setVoidReason('')
    await Promise.all([loadOrders(dateFilter), loadTableMapData()])
  }

  // Full order cancellation — cancels an entire order at once (all items)
  // with a mandatory reason, instead of voiding items one by one. Logged
  // to the same voids table as a single consolidated entry.
  const [cancellingOrder, setCancellingOrder] = useState<any>(null)
  const [cancelReason, setCancelReason] = useState('')

  function openCancelOrder(order: any) {
    setCancellingOrder(order)
    setCancelReason('')
  }

  async function confirmCancelOrder() {
    if (!cancellingOrder) return
    if (!cancelReason.trim()) { alert('Lütfen bir iptal nedeni girin.'); return }
    const order = cancellingOrder
    const { error } = await supabase.from('orders').update({ status: 'dismissed', handled_by: staffName }).eq('id', order.id)
    if (error) { alert('✗ İptal edilemedi.\n\n' + error.message); return }
    const itemCount = (order.items || []).reduce((s: number, it: any) => s + Number(it.quantity), 0)
    await supabase.from('voids').insert({
      order_id: order.id,
      table_name: order.table_name,
      item_name: `Tüm Sipariş (${itemCount} ürün)`,
      quantity: itemCount,
      amount: order.total,
      reason: cancelReason.trim(),
      voided_by: staffName,
    })
    setCancellingOrder(null)
    setCancelReason('')
    await Promise.all([loadOrders(dateFilter), loadTableMapData()])
  }

  async function requestBill(tabId: string) {
    await supabase.from('tabs').update({ bill_requested: true }).eq('id', tabId)
    await loadTableMapData()
  }

  async function cancelBillRequest(tabId: string) {
    await supabase.from('tabs').update({ bill_requested: false }).eq('id', tabId)
    await loadTableMapData()
  }

  // Payment & closing a tab
  const [paymentTab, setPaymentTab] = useState<{ id: string, table_name: string, total: number, orders: any[] } | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'cash'|'card'|'transfer'|'mixed'|'debt'>('cash')
  const [splitCash, setSplitCash] = useState('')
  const [splitCard, setSplitCard] = useState('')
  const [splitPeopleCount, setSplitPeopleCount] = useState('2')
  const [settleMode, setSettleMode] = useState<'all'|'select'>('all')
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set())
  const [discountType, setDiscountType] = useState<'none'|'percent'|'amount'>('none')
  const [discountValue, setDiscountValue] = useState('')
  const [discountReason, setDiscountReason] = useState('')

  // Borç (debt/credit) management
  const [debtors, setDebtors] = useState<any[]>([])
  const [selectedDebtorId, setSelectedDebtorId] = useState('')
  const [newDebtorName, setNewDebtorName] = useState('')
  const [newDebtorPhone, setNewDebtorPhone] = useState('')

  async function loadDebtors() {
    const { data } = await supabase.from('debtors').select('*').order('name')
    setDebtors(data || [])
  }

  const [debtTransactions, setDebtTransactions] = useState<any[]>([])
  const [debtDetailId, setDebtDetailId] = useState<string | null>(null)
  const [debtPaymentAmount, setDebtPaymentAmount] = useState('')
  const [manualDebtAmount, setManualDebtAmount] = useState('')
  const [manualDebtNote, setManualDebtNote] = useState('')
  const [newDebtorNameTab, setNewDebtorNameTab] = useState('')
  const [newDebtorPhoneTab, setNewDebtorPhoneTab] = useState('')

  async function loadDebtTransactions() {
    const { data } = await supabase.from('debt_transactions').select('*').order('created_at', { ascending: false })
    setDebtTransactions(data || [])
  }

  function debtorStats(debtorId: string) {
    const txs = debtTransactions.filter((t: any) => t.debtor_id === debtorId)
    const borc = txs.filter((t: any) => t.type === 'borç').reduce((s: number, t: any) => s + Number(t.amount), 0)
    const odenen = txs.filter((t: any) => t.type === 'ödeme').reduce((s: number, t: any) => s + Number(t.amount), 0)
    return { borc, odenen, kalan: borc - odenen, txs }
  }

  async function addDebtorFromTab() {
    const name = newDebtorNameTab.trim()
    if (!name) return
    await supabase.from('debtors').insert({ name, phone: newDebtorPhoneTab.trim() || null })
    setNewDebtorNameTab(''); setNewDebtorPhoneTab('')
    await loadDebtors()
  }

  async function recordDebtPayment(debtorId: string) {
    const amt = parseFloat(debtPaymentAmount)
    if (!amt || amt <= 0) { alert('Geçerli bir tutar girin.'); return }
    await supabase.from('debt_transactions').insert({ debtor_id: debtorId, type: 'ödeme', amount: amt, created_by: staffName })
    setDebtPaymentAmount('')
    await loadDebtTransactions()
  }

  async function addManualDebt(debtorId: string) {
    const amt = parseFloat(manualDebtAmount)
    if (!amt || amt <= 0) { alert('Geçerli bir tutar girin.'); return }
    await supabase.from('debt_transactions').insert({ debtor_id: debtorId, type: 'borç', amount: amt, note: manualDebtNote.trim() || null, created_by: staffName })
    setManualDebtAmount(''); setManualDebtNote('')
    await loadDebtTransactions()
  }

  function computeDiscountAmount(total: number) {
    const v = parseFloat(discountValue) || 0
    let amt = discountType === 'percent' ? total * (v / 100) : discountType === 'amount' ? v : 0
    if (amt < 0) amt = 0
    if (amt > total) amt = total
    return amt
  }

  function openPayment(tabData: any, total: number, orders: any[]) {
    setPaymentTab({ id: tabData.id, table_name: tabData.table_name, total, orders })
    setPaymentMethod('cash')
    setSplitCash(total.toFixed(0))
    setSplitCard('0')
    setSplitPeopleCount('2')
    setSettleMode('all')
    setSelectedOrderIds(new Set())
    setDiscountType('none')
    setDiscountValue('')
    setDiscountReason('')
    setSelectedDebtorId('')
    setNewDebtorName('')
    setNewDebtorPhone('')
  }



  async function confirmPayment() {
    if (!paymentTab) return
    const discountAmount = computeDiscountAmount(paymentTab.total)
    if (discountAmount > 0 && !discountReason.trim()) {
      alert('Lütfen indirim için bir neden girin.')
      return
    }
    const finalTotal = paymentTab.total - discountAmount
    let cash = 0, card = 0, debtAmount = 0, transferAmount = 0
    let debtorId = selectedDebtorId
    if (paymentMethod === 'debt') {
      if (!debtorId && newDebtorName.trim()) {
        const { data: newDebtor, error: debtorError } = await supabase.from('debtors')
          .insert({ name: newDebtorName.trim(), phone: newDebtorPhone.trim() || null }).select('id').single()
        if (debtorError || !newDebtor) { alert('✗ Borçlu eklenemedi.\n\n' + (debtorError?.message || '')); return }
        debtorId = newDebtor.id
      }
      if (!debtorId) { alert('Lütfen bir borçlu seçin veya yeni bir borçlu ekleyin.'); return }
      debtAmount = finalTotal
    } else if (paymentMethod === 'cash') cash = finalTotal
    else if (paymentMethod === 'card') card = finalTotal
    else if (paymentMethod === 'transfer') transferAmount = finalTotal
    else {
      cash = parseFloat(splitCash) || 0
      card = parseFloat(splitCard) || 0
      if (Math.abs((cash + card) - finalTotal) > 0.5) {
        alert(`Nakit + Kart tutarı ödenecek tutarla eşleşmiyor.\n\nÖdenecek tutar: ${formatTL(finalTotal)} ₺\nGirilen: ${formatTL(cash + card)} ₺`)
        return
      }
    }
    const { data: closedTab, error: closeError } = await supabase.from('tabs').update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      payment_method: paymentMethod,
      cash_amount: cash,
      card_amount: card,
      transfer_amount: transferAmount,
      debt_amount: debtAmount,
      total: finalTotal,
      discount_amount: discountAmount,
      discount_reason: discountAmount > 0 ? discountReason.trim() : null,
      closed_by: staffName,
    }).eq('id', paymentTab.id).select('fatura_no').single()

    if (closeError) { alert('✗ Ödeme kaydedilemedi.\n\n' + closeError.message); return }

    if (discountAmount > 0) {
      await supabase.from('discounts').insert({
        tab_id: paymentTab.id,
        table_name: paymentTab.table_name,
        original_amount: paymentTab.total,
        discount_amount: discountAmount,
        reason: discountReason.trim(),
        applied_by: staffName,
      })
    }

    if (paymentMethod === 'debt' && debtorId) {
      await supabase.from('debt_transactions').insert({
        debtor_id: debtorId,
        tab_id: paymentTab.id,
        fatura_no: closedTab?.fatura_no,
        type: 'borç',
        amount: finalTotal,
        created_by: staffName,
      })
      await loadDebtors()
    }

    const receiptInfo = { table_name: paymentTab.table_name, total: finalTotal, cash, card, transfer: transferAmount, method: paymentMethod, orders: paymentTab.orders, discountAmount, discountReason: discountReason.trim(), originalTotal: paymentTab.total, faturaNo: closedTab?.fatura_no }
    setPaymentTab(null)
    setActiveTableModal(null)
    await loadTableMapData()
    if (canPrint) {
      printReceipt(receiptInfo, autoPrintEnabled)
    } else {
      alert('✓ Ödeme alındı, masa kapatıldı.\n\nFiş yazdırma yalnızca dokunmatik ekrandan yapılabilir.')
    }
  }

  function toggleSelectedOrder(orderId: string) {
    setSelectedOrderIds(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  // Settle only a subset of the orders on this tab (e.g. one guest's items),
  // take payment + print for just that portion, and leave the rest of the
  // table open with its remaining orders untouched.
  async function confirmPartialPayment() {
    if (!paymentTab) return
    const selectedOrders = paymentTab.orders.filter((o: any) => selectedOrderIds.has(o.id))
    if (selectedOrders.length === 0) { alert('Lütfen ödenecek en az bir sipariş seçin.'); return }

    // If every order on the tab was selected, this is just a full close —
    // use the normal flow so we don't leave an empty open tab behind.
    if (selectedOrders.length === paymentTab.orders.length) {
      await confirmPayment()
      return
    }

    const selectedTotal = selectedOrders.reduce((s: number, o: any) => s + Number(o.total), 0)
    const discountAmount = computeDiscountAmount(selectedTotal)
    if (discountAmount > 0 && !discountReason.trim()) {
      alert('Lütfen indirim için bir neden girin.')
      return
    }
    const finalTotal = selectedTotal - discountAmount
    let cash = 0, card = 0, debtAmount = 0, transferAmount = 0
    let debtorId = selectedDebtorId
    if (paymentMethod === 'debt') {
      if (!debtorId && newDebtorName.trim()) {
        const { data: newDebtor, error: debtorError } = await supabase.from('debtors')
          .insert({ name: newDebtorName.trim(), phone: newDebtorPhone.trim() || null }).select('id').single()
        if (debtorError || !newDebtor) { alert('✗ Borçlu eklenemedi.\n\n' + (debtorError?.message || '')); return }
        debtorId = newDebtor.id
      }
      if (!debtorId) { alert('Lütfen bir borçlu seçin veya yeni bir borçlu ekleyin.'); return }
      debtAmount = finalTotal
    } else if (paymentMethod === 'cash') cash = finalTotal
    else if (paymentMethod === 'card') card = finalTotal
    else if (paymentMethod === 'transfer') transferAmount = finalTotal
    else {
      cash = parseFloat(splitCash) || 0
      card = parseFloat(splitCard) || 0
      if (Math.abs((cash + card) - finalTotal) > 0.5) {
        alert(`Nakit + Kart tutarı ödenecek tutarla eşleşmiyor.\n\nÖdenecek tutar: ${formatTL(finalTotal)} ₺\nGirilen: ${formatTL(cash + card)} ₺`)
        return
      }
    }

    // Create a fresh tab for just the selected orders, then close it — this
    // gets it its own fatura_no via the DB trigger, same as a normal close.
    const { data: newTab, error: newTabError } = await supabase.from('tabs')
      .insert({ table_name: paymentTab.table_name, status: 'open' }).select('id').single()
    if (newTabError || !newTab) { alert('✗ Kısmi hesap oluşturulamadı.\n\n' + (newTabError?.message || '')); return }

    const { error: moveError } = await supabase.from('orders')
      .update({ tab_id: newTab.id })
      .in('id', selectedOrders.map((o: any) => o.id))
    if (moveError) { alert('✗ Siparişler taşınamadı.\n\n' + moveError.message); return }

    const { data: closedTab, error: closeError } = await supabase.from('tabs').update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      payment_method: paymentMethod,
      cash_amount: cash,
      card_amount: card,
      transfer_amount: transferAmount,
      debt_amount: debtAmount,
      total: finalTotal,
      discount_amount: discountAmount,
      discount_reason: discountAmount > 0 ? discountReason.trim() : null,
      closed_by: staffName,
    }).eq('id', newTab.id).select('fatura_no').single()

    if (closeError) { alert('✗ Ödeme kaydedilemedi.\n\n' + closeError.message); return }

    if (discountAmount > 0) {
      await supabase.from('discounts').insert({
        tab_id: newTab.id,
        table_name: paymentTab.table_name,
        original_amount: selectedTotal,
        discount_amount: discountAmount,
        reason: discountReason.trim(),
        applied_by: staffName,
      })
    }

    if (paymentMethod === 'debt' && debtorId) {
      await supabase.from('debt_transactions').insert({
        debtor_id: debtorId,
        tab_id: newTab.id,
        fatura_no: closedTab?.fatura_no,
        type: 'borç',
        amount: finalTotal,
        created_by: staffName,
      })
      await loadDebtors()
    }

    const receiptInfo = { table_name: paymentTab.table_name, total: finalTotal, cash, card, transfer: transferAmount, method: paymentMethod, orders: selectedOrders, discountAmount, discountReason: discountReason.trim(), originalTotal: selectedTotal, faturaNo: closedTab?.fatura_no }
    setPaymentTab(null)
    await loadTableMapData()
    if (canPrint) {
      printReceipt(receiptInfo, autoPrintEnabled)
    } else {
      alert('✓ Seçili siparişlerin ödemesi alındı.\n\nFiş yazdırma yalnızca dokunmatik ekrandan yapılabilir.')
    }
  }

  // Staff-entered orders (walk-ins, phone orders, waiter taking a verbal order)
  const [items, setItems] = useState<MenuItem[]>([])
  const [addOrderTable, setAddOrderTable] = useState<string | null>(null)
  const [staffCart, setStaffCart] = useState<Record<string, number>>({})
  const [staffCategoryFilter, setStaffCategoryFilter] = useState<string | null>(null)
  const [menuItemOptions, setMenuItemOptions] = useState<Record<string, any[]>>({})
  const [staffExtraItems, setStaffExtraItems] = useState<Record<string, any>>({})
  const [staffPendingOptionItem, setStaffPendingOptionItem] = useState<MenuItem | null>(null)
  const [staffPendingSelections, setStaffPendingSelections] = useState<Record<string,string>>({})

  function openAddOrder(tableName: string) {
    setAddOrderTable(tableName)
    setStaffCart({})
    setStaffCategoryFilter(null)
    setStaffExtraItems({})
  }

  function adjustStaffCart(itemId: string, delta: number) {
    setStaffCart(prev => {
      const next = { ...prev }
      const newQty = (next[itemId] || 0) + delta
      if (newQty <= 0) delete next[itemId]
      else next[itemId] = newQty
      return next
    })
  }

  function findMenuItemOrSynthetic(id: string): any {
    return items.find(i => i.id === id) || staffExtraItems[id]
  }

  function openStaffOptionPicker(item: MenuItem) {
    const groups = menuItemOptions[item.id] || []
    const defaults: Record<string,string> = {}
    groups.forEach((g: any) => { if (g.choices?.[0]) defaults[g.id] = g.choices[0].id })
    setStaffPendingSelections(defaults)
    setStaffPendingOptionItem(item)
  }

  function confirmStaffAddWithOptions() {
    if (!staffPendingOptionItem) return
    const groups = menuItemOptions[staffPendingOptionItem.id] || []
    const chosen = groups.map((g: any) => {
      const choiceId = staffPendingSelections[g.id]
      const choice = g.choices.find((c: any) => c.id === choiceId)
      return { choiceId, choiceName: choice?.name || '', priceDelta: Number(choice?.price_delta || 0) }
    })
    if (chosen.some(c => !c.choiceId)) return
    const optionsText = chosen.map(c => c.choiceName).join(', ')
    const priceDelta = chosen.reduce((s, c) => s + c.priceDelta, 0)
    const syntheticId = `${staffPendingOptionItem.id}::${groups.map((g: any) => staffPendingSelections[g.id]).join('_')}`
    const finalPrice = staffPendingOptionItem.price + priceDelta

    setStaffExtraItems(prev => ({
      ...prev,
      [syntheticId]: { ...staffPendingOptionItem, id: syntheticId, price: finalPrice, _baseId: staffPendingOptionItem.id, _optionsText: optionsText }
    }))
    adjustStaffCart(syntheticId, 1)
    setStaffPendingOptionItem(null)
  }

  const staffCartCount = Object.values(staffCart).reduce((s, q) => s + q, 0)
  const staffCartTotal = Object.entries(staffCart).reduce((s, [id, qty]) => {
    const item = findMenuItemOrSynthetic(id)
    return s + (item ? item.price * qty : 0)
  }, 0)

  async function submitStaffOrder() {
    if (!addOrderTable || staffCartCount === 0) return
    try {
      const orderItems = Object.entries(staffCart)
        .map(([id, qty]) => {
          const item = findMenuItemOrSynthetic(id)
          if (!item) return null
          const displayName = item._optionsText ? `${item.name} (${item._optionsText})` : item.name
          const displayNameEn = item._optionsText ? `${item.name_en || item.name} (${item._optionsText})` : (item.name_en || item.name)
          return { id: item._baseId || item.id, name: displayName, name_en: displayNameEn, price: item.price, quantity: qty, subtotal: item.price * qty }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)

      if (orderItems.length === 0) {
        alert('Seçilen ürünler artık mevcut değil. Lütfen tekrar seçin.')
        return
      }
      const orderTotal = orderItems.reduce((s, i) => s + i.subtotal, 0)

      const { data: tabId, error: tabError } = await supabase.rpc('get_or_create_open_tab', { p_table_name: addOrderTable })
      if (tabError || !tabId) {
        alert('✗ Masa açılamadı.\n\n' + (tabError?.message || 'Bilinmeyen hata'))
        return
      }

      // Staff-entered orders still need to be prepared, so they start as
      // "pending" the same as customer orders — under the simplified
      // 2-stage flow (Bekliyor → Tamamlandı), there's no intermediate stage
      const { error: orderError } = await supabase.from('orders').insert({
        table_name: addOrderTable,
        items: orderItems,
        total: orderTotal,
        status: 'pending',
        note: null,
        tab_id: tabId,
        created_by: staffName,
        handled_by: staffName,
      })
      if (orderError) {
        alert('✗ Sipariş eklenemedi.\n\n' + orderError.message)
        return
      }

      await loadTableMapData()
      setAddOrderTable(null)
      setStaffCart({})
      setStaffExtraItems({})
    } catch (err: any) {
      alert('✗ Beklenmeyen bir hata oluştu.\n\n' + (err?.message || String(err)))
    }
  }
  const [showMonthlyReport, setShowMonthlyReport] = useState<any>(null)
  const [dateFilter, setDateFilter] = useState<'today'|'week'|'month'|'custom'>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  // Reset markers are stored in Supabase (table: reset_markers) so a reset
  // made on one device is instantly reflected on every other device.
  async function getResetMarker(scope: 'today'|'week'|'month'|'custom'): Promise<string | null> {
    if (scope === 'custom') return null // resetting a custom range isn't a meaningful action
    const { data } = await supabase.from('reset_markers').select('reset_at').eq('key', scope).maybeSingle()
    return data?.reset_at || null
  }

  function baseFromForFilter(filter: 'today'|'week'|'month'|'custom') {
    const now = new Date()
    if (filter === 'today') return now.toISOString().split('T')[0]
    if (filter === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString() }
    if (filter === 'custom') return customFrom || now.toISOString().split('T')[0]
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  }

  const [revenueSummary, setRevenueSummary] = useState({ revenue: 0, cash: 0, card: 0, debt: 0, count: 0 })

  // Revenue should reflect money actually collected (closed/paid tabs),
  // not every order placed — an order can be placed and still be open/unpaid.
  // Debt is tracked separately since it's the opposite of collected: money
  // owed, not received, so it shouldn't be folded into "revenue".
  async function getClosedTabsRevenue(fromDate: string, toDate?: string) {
    let query = supabase.from('tabs').select('total,cash_amount,card_amount,transfer_amount,debt_amount')
      .eq('status', 'closed').gte('closed_at', fromDate)
    if (toDate) query = query.lte('closed_at', toDate)
    const { data } = await query
    const tabs = data || []
    const cash = tabs.reduce((s: number, t: any) => s + Number(t.cash_amount || 0), 0)
    const card = tabs.reduce((s: number, t: any) => s + Number(t.card_amount || 0), 0)
    const transfer = tabs.reduce((s: number, t: any) => s + Number(t.transfer_amount || 0), 0)
    return {
      // "Tahsil edilen" (collected) means money that actually came in —
      // cash + card + transfer. A tab paid on debt (Borç) hasn't actually
      // been collected yet, so it's tracked separately below rather than
      // folded into revenue, even though its `total` column is set the
      // same as any other closed tab.
      revenue: cash + card + transfer,
      cash, card,
      debt: tabs.reduce((s: number, t: any) => s + Number(t.debt_amount || 0), 0),
      count: tabs.length,
    }
  }

  async function loadOrders(filter: 'today'|'week'|'month'|'custom' = dateFilter) {
    setOrdersLoading(true)
    const baseFrom = baseFromForFilter(filter)
    const marker = await getResetMarker(filter)
    // Only honor the marker if it falls within the current window (e.g. a
    // "today" reset from three days ago shouldn't suppress today's orders)
    const fromDate = (marker && marker > baseFrom) ? marker : baseFrom
    const toDate = filter === 'custom' && customTo ? `${customTo}T23:59:59.999` : undefined
    let ordersQuery = supabase.from('orders').select('*').gte('created_at', fromDate).order('created_at', { ascending: false })
    if (toDate) ordersQuery = ordersQuery.lte('created_at', toDate)
    const [{ data }, revenue] = await Promise.all([
      ordersQuery,
      getClosedTabsRevenue(fromDate, toDate),
    ])
    setAllOrders(data || [])
    setRevenueSummary(revenue)
    setOrdersLoading(false)
  }


  const [showReportPicker, setShowReportPicker] = useState(false)

  async function generatePeriodReport(period: 'week'|'month'|'year') {
    setShowReportPicker(false)
    const now = new Date()
    const monthNames = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
    let firstDay: string, lastDay: string, title: string
    if (period === 'week') {
      const day = now.getDay() === 0 ? 7 : now.getDay() // Monday-start week
      const monday = new Date(now); monday.setDate(now.getDate() - day + 1); monday.setHours(0,0,0,0)
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23,59,59,999)
      firstDay = monday.toISOString(); lastDay = sunday.toISOString()
      title = `${monday.toLocaleDateString('tr-TR')} - ${sunday.toLocaleDateString('tr-TR')} Haftalık Raporu`
    } else if (period === 'year') {
      const year = now.getFullYear()
      firstDay = new Date(year, 0, 1).toISOString()
      lastDay = new Date(year, 11, 31, 23, 59, 59).toISOString()
      title = `${year} Yıllık Raporu`
    } else {
      const month = monthNames[now.getMonth()]
      const year = now.getFullYear()
      firstDay = new Date(year, now.getMonth(), 1).toISOString()
      lastDay = new Date(year, now.getMonth() + 1, 0, 23, 59, 59).toISOString()
      title = `${month} ${year} Raporu`
    }

    const { data: periodOrders } = await supabase.from('orders').select('*')
      .gte('created_at', firstDay).lte('created_at', lastDay)

    if (!periodOrders || periodOrders.length === 0) {
      showMsg('Bu dönemde hiç sipariş yok')
      return
    }

    const periodRevenue = await getClosedTabsRevenue(firstDay, lastDay)
    const totalRevenue = periodRevenue.revenue
    const totalDebt = periodRevenue.debt

    // Top items
    const itemMap: Record<string, { name: string; count: number; revenue: number; categoryId: string | null }> = {}
    periodOrders.forEach((o: any) => {
      o.items?.forEach((item: any) => {
        if (!itemMap[item.name]) {
          const menuItem = items.find((mi: any) => mi.id === item.id)
          itemMap[item.name] = { name: item.name, count: 0, revenue: 0, categoryId: menuItem?.category_id || null }
        }
        itemMap[item.name].count += item.quantity
        itemMap[item.name].revenue += item.subtotal
      })
    })
    const topItems = Object.values(itemMap).sort((a, b) => b.count - a.count).slice(0, 10)

    // Category-wise breakdown (which categories sold the most, and how much)
    const catMap: Record<string, { categoryName: string, icon: string, qty: number, revenue: number }> = {}
    Object.values(itemMap).forEach((r) => {
      const cat = categories.find((c: any) => c.id === r.categoryId)
      const key = r.categoryId || '__other__'
      if (!catMap[key]) catMap[key] = { categoryName: cat?.name || 'Diğer', icon: cat?.icon || '📦', qty: 0, revenue: 0 }
      catMap[key].qty += r.count
      catMap[key].revenue += r.revenue
    })
    const categoryStats = Object.values(catMap).sort((a, b) => b.revenue - a.revenue)

    // Top tables
    const tableMap: Record<string, number> = {}
    periodOrders.forEach((o: any) => { tableMap[o.table_name] = (tableMap[o.table_name] || 0) + Number(o.total) })
    const topTables = Object.entries(tableMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, rev]) => ({ name, revenue: rev }))

    // Daily breakdown
    const dayMap: Record<string, { orders: number; revenue: number }> = {}
    periodOrders.forEach((o: any) => {
      const day = o.created_at.split('T')[0]
      if (!dayMap[day]) dayMap[day] = { orders: 0, revenue: 0 }
      dayMap[day].orders++
      dayMap[day].revenue += Number(o.total)
    })

    // Only the monthly cadence gets persisted to the existing monthly_reports
    // table (matches its schema); week/year reports are generate-on-demand.
    if (period === 'month') {
      const monthNamesForSave = monthNames[now.getMonth()]
      await supabase.from('monthly_reports').insert({
        month: monthNamesForSave, year: now.getFullYear(),
        total_orders: periodOrders.length,
        total_revenue: totalRevenue,
        top_items: topItems,
        top_tables: topTables,
        daily_breakdown: dayMap
      })
    }

    showMsg(`✓ ${title.replace(' Raporu','')} raporu oluşturuldu!`)
    setShowMonthlyReport({ title, periodType: period, totalOrders: periodOrders.length, totalRevenue, totalDebt, topItems, topTables, categoryStats, dayMap })
  }





  async function resetStats(scope: 'today'|'week'|'month') {
    const label = scope === 'today' ? 'bugünkü' : scope === 'week' ? 'bu haftaki' : 'bu ayki'
    if (!confirm(`${label.charAt(0).toUpperCase()+label.slice(1)} istatistikleri sıfırlamak istediğinizden emin misiniz?\n\nSiparişler silinmez, sadece bu andan itibaren sayılmaya başlanır. Bu sıfırlama tüm cihazlarda (telefon, bilgisayar, POS) geçerli olacaktır.`)) return
    const nowIso = new Date().toISOString()
    const { error } = await supabase.from('reset_markers').upsert({ key: scope, reset_at: nowIso, updated_at: nowIso })
    if (error) {
      alert('✗ Sıfırlama başarısız oldu.\n\n' + error.message + '\n\nreset_markers tablosunun Supabase\'de oluşturulduğundan emin olun.')
      return
    }
    await loadOrders(scope)
    alert(`✓ ${label.charAt(0).toUpperCase()+label.slice(1)} istatistikler sıfırlandı.\n\nEski siparişler silinmedi, sadece bu andan sonraki siparişler sayılacak. Bu sıfırlama tüm cihazlarda geçerlidir.`)
  }

  useEffect(() => { if (auth) loadOrders() }, [auth])

  // Day-end close-out (Gün Sonu) - built on real payment data from closed tabs
  // Staff Performance report — aggregates data we already track
  // (created_by / handled_by / closed_by / voided_by) by staff name
  const [showStaffReport, setShowStaffReport] = useState(false)
  const [staffReportData, setStaffReportData] = useState<any[]>([])
  const [staffReportRange, setStaffReportRange] = useState<'today'|'week'|'month'>('today')

  // Per-item sales report (Ürün Raporu) - daily/monthly/yearly breakdown
  const [showItemReport, setShowItemReport] = useState(false)
  const [itemReportRange, setItemReportRange] = useState<'today'|'month'|'year'|'custom'>('today')
  const [itemReportData, setItemReportData] = useState<any[]>([])
  const [itemReportCustomFrom, setItemReportCustomFrom] = useState('')
  const [itemReportCustomTo, setItemReportCustomTo] = useState('')

  function itemReportFromDate(range: 'today'|'month'|'year'|'custom') {
    const now = new Date()
    if (range === 'today') return now.toISOString().split('T')[0]
    if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    if (range === 'custom') return itemReportCustomFrom || now.toISOString().split('T')[0]
    return new Date(now.getFullYear(), 0, 1).toISOString()
  }

  async function openItemReport(range: 'today'|'month'|'year'|'custom' = itemReportRange) {
    setItemReportRange(range)
    const fromDate = itemReportFromDate(range)
    let ordersQuery = supabase.from('orders').select('items').gte('created_at', fromDate).neq('status', 'dismissed')
    if (range === 'custom' && itemReportCustomTo) ordersQuery = ordersQuery.lte('created_at', `${itemReportCustomTo}T23:59:59.999`)
    const { data: rangeOrders } = await ordersQuery
    const itemMap: Record<string, { name: string, qty: number, revenue: number, categoryId: string | null }> = {}
    ;(rangeOrders || []).forEach((o: any) => {
      (o.items || []).forEach((it: any) => {
        if (!itemMap[it.name]) {
          const menuItem = items.find((mi: any) => mi.id === it.id)
          itemMap[it.name] = { name: it.name, qty: 0, revenue: 0, categoryId: menuItem?.category_id || null }
        }
        itemMap[it.name].qty += Number(it.quantity)
        itemMap[it.name].revenue += Number(it.subtotal)
      })
    })

    const catMap: Record<string, { categoryId: string, categoryName: string, icon: string, qty: number, revenue: number, items: any[] }> = {}
    Object.values(itemMap).forEach((r: any) => {
      const cat = categories.find((c: any) => c.id === r.categoryId)
      const key = r.categoryId || '__other__'
      if (!catMap[key]) catMap[key] = { categoryId: key, categoryName: cat?.name || 'Diğer', icon: cat?.icon || '📦', qty: 0, revenue: 0, items: [] }
      catMap[key].qty += r.qty
      catMap[key].revenue += r.revenue
      catMap[key].items.push(r)
    })
    const catRows = Object.values(catMap).sort((a, b) => b.revenue - a.revenue)
    catRows.forEach(c => c.items.sort((a: any, b: any) => b.revenue - a.revenue))

    setItemReportData(catRows)
    setShowItemReport(true)
  }

  async function openStaffReport(range: 'today'|'week'|'month' = staffReportRange) {
    setStaffReportRange(range)
    const fromDate = baseFromForFilter(range)
    const marker = await getResetMarker(range)
    const effectiveFrom = (marker && marker > fromDate) ? marker : fromDate

    const [{ data: closedTabs }, { data: orders }, { data: voidsData }] = await Promise.all([
      supabase.from('tabs').select('closed_by,total').eq('status', 'closed').gte('closed_at', effectiveFrom),
      supabase.from('orders').select('created_by,handled_by').gte('created_at', effectiveFrom),
      supabase.from('voids').select('voided_by,amount').gte('created_at', effectiveFrom),
    ])

    const statsMap: Record<string, any> = {}
    function ensure(name: string) {
      const key = name || 'Bilinmiyor'
      if (!statsMap[key]) statsMap[key] = { name: key, ordersCreated: 0, ordersHandled: 0, tabsClosed: 0, revenueClosed: 0, voidsCount: 0, voidsAmount: 0 }
      return statsMap[key]
    }
    ;(orders || []).forEach((o: any) => {
      if (o.created_by && o.created_by !== 'Müşteri (QR)') ensure(o.created_by).ordersCreated++
      if (o.handled_by) ensure(o.handled_by).ordersHandled++
    })
    ;(closedTabs || []).forEach((t: any) => {
      if (t.closed_by) { const s = ensure(t.closed_by); s.tabsClosed++; s.revenueClosed += Number(t.total) }
    })
    ;(voidsData || []).forEach((v: any) => {
      if (v.voided_by) { const s = ensure(v.voided_by); s.voidsCount++; s.voidsAmount += Number(v.amount) }
    })

    const rows = Object.values(statsMap).sort((a: any, b: any) => b.revenueClosed - a.revenueClosed)
    setStaffReportData(rows)
    setShowStaffReport(true)
  }



  const [showDayClose, setShowDayClose] = useState(false)
  const [dayCloseData, setDayCloseData] = useState<any>(null)
  const [countedCash, setCountedCash] = useState('')

  // Fiş Geçmişi (receipt history) — lets the manager find and reprint a
  // receipt from any point in the past (a week ago, a year ago, etc.),
  // not just at the moment a tab is closed.
  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const [receiptFrom, setReceiptFrom] = useState(weekAgo)
  const [receiptTo, setReceiptTo] = useState(today)
  const [receiptQuery, setReceiptQuery] = useState('')
  const [receiptResults, setReceiptResults] = useState<any[]>([])
  const [receiptSearching, setReceiptSearching] = useState(false)

  async function searchReceipts() {
    setReceiptSearching(true)
    let query = supabase.from('tabs').select('*').eq('status', 'closed')
      .gte('closed_at', `${receiptFrom}T00:00:00`)
      .lte('closed_at', `${receiptTo}T23:59:59.999`)
      .order('closed_at', { ascending: false })
      .limit(200)
    const q = receiptQuery.trim()
    if (q) {
      if (/^\d+$/.test(q)) query = query.eq('fatura_no', Number(q))
      else query = query.ilike('table_name', `%${q}%`)
    }
    const { data } = await query
    setReceiptResults(data || [])
    setReceiptSearching(false)
  }

  async function reprintReceipt(tabRow: any) {
    const { data: orders } = await supabase.from('orders').select('*').eq('tab_id', tabRow.id).order('created_at', { ascending: true })
    printReceipt({
      table_name: tabRow.table_name,
      total: Number(tabRow.total),
      cash: Number(tabRow.cash_amount || 0),
      card: Number(tabRow.card_amount || 0),
      transfer: Number(tabRow.transfer_amount || 0),
      method: tabRow.payment_method,
      orders: orders || [],
      discountAmount: Number(tabRow.discount_amount || 0),
      discountReason: tabRow.discount_reason || '',
      originalTotal: Number(tabRow.total) + Number(tabRow.discount_amount || 0),
      faturaNo: tabRow.fatura_no,
    }, autoPrintEnabled)
  }

  // İndirim & İptal Raporu — surfaces who's granting discounts and who's
  // voiding/cancelling items, for loss prevention (catches both honest
  // mistakes and actual patterns worth asking about). Data was already
  // being recorded in discounts/voids for every operation - this just
  // makes it visible instead of sitting unused in the database.
  const [accFrom, setAccFrom] = useState(weekAgo)
  const [accTo, setAccTo] = useState(today)
  const [accDiscounts, setAccDiscounts] = useState<any[]>([])
  const [accVoids, setAccVoids] = useState<any[]>([])
  const [accSearching, setAccSearching] = useState(false)

  async function searchAccountability() {
    setAccSearching(true)
    const fromISO = `${accFrom}T00:00:00`
    const toISO = `${accTo}T23:59:59.999`
    const [{ data: discounts }, { data: voids }] = await Promise.all([
      supabase.from('discounts').select('*').gte('created_at', fromISO).lte('created_at', toISO).order('created_at', { ascending: false }),
      supabase.from('voids').select('*').gte('created_at', fromISO).lte('created_at', toISO).order('created_at', { ascending: false }),
    ])
    setAccDiscounts(discounts || [])
    setAccVoids(voids || [])
    setAccSearching(false)
  }

  function groupByStaff(rows: any[], staffField: string, amountField: string) {
    const map: Record<string, { count: number, total: number }> = {}
    rows.forEach(r => {
      const name = r[staffField] || 'Bilinmiyor'
      if (!map[name]) map[name] = { count: 0, total: 0 }
      map[name].count++
      map[name].total += Number(r[amountField] || 0)
    })
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total)
  }

  // Full accounting export (Muhasebe İçin Excel) — a multi-sheet workbook
  // covering everything a muhasebeci would want for a date range: every
  // closed sale with its items, every discount/void/debt movement/manual
  // cash movement, plus a summary sheet. Reuses the same date range as
  // Fiş Geçmişi above.
  const [exportingAccounting, setExportingAccounting] = useState(false)
  async function exportAccountingExcel() {
    setExportingAccounting(true)
    try {
      const fromISO = `${receiptFrom}T00:00:00`
      const toISO = `${receiptTo}T23:59:59.999`

      const { data: tabs } = await supabase.from('tabs').select('*').eq('status', 'closed')
        .gte('closed_at', fromISO).lte('closed_at', toISO).order('closed_at', { ascending: true })
      const tabIds = (tabs || []).map((t: any) => t.id)
      const { data: orders } = tabIds.length > 0
        ? await supabase.from('orders').select('*').in('tab_id', tabIds)
        : { data: [] as any[] }
      const ordersByTab: Record<string, any[]> = {}
      ;(orders || []).forEach((o: any) => { (ordersByTab[o.tab_id] ||= []).push(o) })

      const { data: discounts } = await supabase.from('discounts').select('*').gte('created_at', fromISO).lte('created_at', toISO).order('created_at', { ascending: true })
      const { data: voids } = await supabase.from('voids').select('*').gte('created_at', fromISO).lte('created_at', toISO).order('created_at', { ascending: true })
      const { data: debtTx } = await supabase.from('debt_transactions').select('*').gte('created_at', fromISO).lte('created_at', toISO).order('created_at', { ascending: true })
      const { data: cashMoves } = await supabase.from('cash_movements').select('*').gte('created_at', fromISO).lte('created_at', toISO).order('created_at', { ascending: true })
      const debtorNameById: Record<string, string> = {}
      debtors.forEach((d: any) => { debtorNameById[d.id] = d.name })

      const methodLabel = (m: string) => m === 'cash' ? 'Nakit' : m === 'card' ? 'Kart' : m === 'transfer' ? 'Havale' : m === 'debt' ? 'Borç' : 'Karma'

      const salesSheet = (tabs || []).map((t: any) => {
        const items = (ordersByTab[t.id] || []).flatMap((o: any) => o.items || [])
        return {
          'Fiş No': t.fatura_no ? String(t.fatura_no).padStart(6, '0') : '',
          'Tarih': new Date(t.closed_at).toLocaleDateString('tr-TR'),
          'Saat': new Date(t.closed_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
          'Masa': t.table_name,
          'Ürünler': items.map((it: any) => `${it.quantity}x ${it.name}`).join(', '),
          'Ara Toplam': Number(t.total) + Number(t.discount_amount || 0),
          'İndirim': Number(t.discount_amount || 0),
          'Toplam': Number(t.total),
          'Nakit': Number(t.cash_amount || 0),
          'Kart': Number(t.card_amount || 0),
          'Havale': Number(t.transfer_amount || 0),
          'Borç': Number(t.debt_amount || 0),
          'Ödeme Yöntemi': methodLabel(t.payment_method),
          'Kapatan': t.closed_by || '',
        }
      })

      const discountSheet = (discounts || []).map((d: any) => ({
        'Tarih': new Date(d.created_at).toLocaleString('tr-TR'),
        'Masa': d.table_name,
        'Orijinal Tutar': Number(d.original_amount || 0),
        'İndirim Tutarı': Number(d.discount_amount || 0),
        'Neden': d.reason || '',
        'Uygulayan': d.applied_by || '',
      }))

      const voidSheet = (voids || []).map((v: any) => ({
        'Tarih': new Date(v.created_at).toLocaleString('tr-TR'),
        'Masa': v.table_name,
        'Ürün': v.item_name || 'Tüm Sipariş',
        'Adet': v.quantity || '',
        'Tutar': Number(v.amount || 0),
        'Neden': v.reason || '',
        'İptal Eden': v.voided_by || '',
      }))

      const debtSheet = (debtTx || []).map((d: any) => ({
        'Tarih': new Date(d.created_at).toLocaleString('tr-TR'),
        'Borçlu': debtorNameById[d.debtor_id] || 'Bilinmiyor',
        'Tür': d.type === 'borç' ? 'Borç Verildi' : 'Ödeme Alındı',
        'Tutar': Number(d.amount || 0),
        'Fiş No': d.fatura_no ? String(d.fatura_no).padStart(6, '0') : '',
        'Not': d.note || '',
        'İşlemi Yapan': d.created_by || '',
      }))

      const cashMoveSheet = (cashMoves || []).map((m: any) => ({
        'Tarih': new Date(m.created_at).toLocaleString('tr-TR'),
        'Tür': m.type === 'in' ? 'Kasaya Giriş' : 'Kasadan Çıkış',
        'Tutar': Number(m.amount || 0),
        'Açıklama': m.reason || '',
        'İşlemi Yapan': m.created_by || '',
      }))

      const totalCash = salesSheet.reduce((s, r) => s + r['Nakit'], 0)
      const totalCard = salesSheet.reduce((s, r) => s + r['Kart'], 0)
      const totalTransfer = salesSheet.reduce((s, r) => s + r['Havale'], 0)
      const totalDebtFromSales = salesSheet.reduce((s, r) => s + r['Borç'], 0)
      const totalDiscount = discountSheet.reduce((s, r) => s + r['İndirim Tutarı'], 0)
      const totalVoid = voidSheet.reduce((s, r) => s + r['Tutar'], 0)
      const totalDebtGiven = debtSheet.filter(r => r['Tür'] === 'Borç Verildi').reduce((s, r) => s + r['Tutar'], 0)
      const totalDebtPaid = debtSheet.filter(r => r['Tür'] === 'Ödeme Alındı').reduce((s, r) => s + r['Tutar'], 0)
      const totalCashIn = cashMoveSheet.filter(r => r['Tür'] === 'Kasaya Giriş').reduce((s, r) => s + r['Tutar'], 0)
      const totalCashOut = cashMoveSheet.filter(r => r['Tür'] === 'Kasadan Çıkış').reduce((s, r) => s + r['Tutar'], 0)

      const summarySheet = [
        { 'Kalem': 'Tarih Aralığı', 'Değer': `${receiptFrom} - ${receiptTo}` },
        { 'Kalem': 'Toplam Kapanan Masa', 'Değer': salesSheet.length },
        { 'Kalem': 'Toplam Ciro (Tahsil Edilen: Nakit+Kart+Havale)', 'Değer': totalCash + totalCard + totalTransfer },
        { 'Kalem': 'Nakit', 'Değer': totalCash },
        { 'Kalem': 'Kart', 'Değer': totalCard },
        { 'Kalem': 'Havale', 'Değer': totalTransfer },
        { 'Kalem': 'Satışlardan Doğan Borç', 'Değer': totalDebtFromSales },
        { 'Kalem': 'Toplam İndirim', 'Değer': totalDiscount },
        { 'Kalem': 'Toplam İptal (₺ Değer)', 'Değer': totalVoid },
        { 'Kalem': 'Yeni Borç Verilen (Tüm Borçlular)', 'Değer': totalDebtGiven },
        { 'Kalem': 'Tahsil Edilen Borç', 'Değer': totalDebtPaid },
        { 'Kalem': 'Kasaya Manuel Giriş', 'Değer': totalCashIn },
        { 'Kalem': 'Kasadan Manuel Çıkış', 'Değer': totalCashOut },
      ]

      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summarySheet), 'Özet')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesSheet), 'Satışlar')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(discountSheet), 'İndirimler')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(voidSheet), 'İptaller')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(debtSheet), 'Borç Hareketleri')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cashMoveSheet), 'Kasa Hareketleri')
      XLSX.writeFile(wb, `Kahfe_Lounge_Muhasebe_${receiptFrom}_${receiptTo}.xlsx`)
    } catch (e: any) {
      alert('✗ Excel oluşturulamadı.\n\n' + (e?.message || String(e)))
    } finally {
      setExportingAccounting(false)
    }
  }

  async function computeClosedTabsSummary(fromISO: string, toISO: string) {
    const { data: closedTabs } = await supabase.from('tabs').select('*')
      .eq('status', 'closed').gte('closed_at', fromISO).lte('closed_at', toISO)
    const tabs = closedTabs || []
    const cashTotal = tabs.reduce((s: number, t: any) => s + Number(t.cash_amount || 0), 0)
    const cardTotal = tabs.reduce((s: number, t: any) => s + Number(t.card_amount || 0), 0)
    const transferTotal = tabs.reduce((s: number, t: any) => s + Number(t.transfer_amount || 0), 0)
    const debtTotal = tabs.reduce((s: number, t: any) => s + Number(t.debt_amount || 0), 0)
    const discountTotal = tabs.reduce((s: number, t: any) => s + Number(t.discount_amount || 0), 0)
    const totalRevenue = cashTotal + cardTotal + transferTotal

    // Manual cash movements (Kasa Hareketi) — cash going in/out of the
    // drawer for reasons other than a sale (buying supplies, starting
    // float, owner withdrawal, etc). Without these, counted cash vs sales
    // cash looks like a "discrepancy" when it's really just an untracked
    // legitimate movement.
    const { data: movements } = await supabase.from('cash_movements').select('*')
      .gte('created_at', fromISO).lte('created_at', toISO)
    const moves = movements || []
    const cashInTotal = moves.filter((m: any) => m.type === 'in').reduce((s: number, m: any) => s + Number(m.amount), 0)
    const cashOutTotal = moves.filter((m: any) => m.type === 'out').reduce((s: number, m: any) => s + Number(m.amount), 0)
    const expectedCash = cashTotal + cashInTotal - cashOutTotal

    return { tabs, cashTotal, cardTotal, transferTotal, debtTotal, discountTotal, totalRevenue, tabCount: tabs.length, cashInTotal, cashOutTotal, expectedCash, movements: moves }
  }

  async function openDayClose() {
    const todayStart = new Date().toISOString().split('T')[0]
    const summary = await computeClosedTabsSummary(todayStart, new Date().toISOString())
    setDayCloseData(summary)
    setCountedCash('')
    setShowDayClose(true)
  }

  // Shift-based cash drawer reconciliation — separate from Gün Sonu (which
  // is a whole-day reconciliation). Whoever starts a shift owns the drawer
  // until they end it, at which point they reconcile just their own
  // shift's cash rather than everyone's for the whole day. Only one shift
  // is active system-wide at a time, matching a single physical drawer.
  const [activeShift, setActiveShift] = useState<any>(null)
  const [showShiftClose, setShowShiftClose] = useState(false)
  const [shiftCloseData, setShiftCloseData] = useState<any>(null)
  const [shiftCountedCash, setShiftCountedCash] = useState('')

  // Kasa Hareketi — manual cash in/out unrelated to sales (buying supplies,
  // starting float, owner withdrawal, etc). Feeds into the expectedCash
  // calculation above so Gün Sonü/Vardiya differences reflect reality
  // instead of flagging legitimate movements as discrepancies.
  const [showCashMovement, setShowCashMovement] = useState(false)
  const [cashMoveType, setCashMoveType] = useState<'in'|'out'>('out')
  const [cashMoveAmount, setCashMoveAmount] = useState('')
  const [cashMoveReason, setCashMoveReason] = useState('')
  const [recentCashMovements, setRecentCashMovements] = useState<any[]>([])

  async function loadRecentCashMovements() {
    const todayStart = new Date().toISOString().split('T')[0]
    const { data } = await supabase.from('cash_movements').select('*').gte('created_at', todayStart).order('created_at', { ascending: false }).limit(20)
    setRecentCashMovements(data || [])
  }

  function openCashMovement() {
    setCashMoveType('out')
    setCashMoveAmount('')
    setCashMoveReason('')
    loadRecentCashMovements()
    setShowCashMovement(true)
  }

  async function saveCashMovement() {
    const amount = parseFloat(cashMoveAmount)
    if (isNaN(amount) || amount <= 0) { alert('Lütfen geçerli bir tutar girin.'); return }
    if (!cashMoveReason.trim()) { alert('Lütfen bir açıklama girin (örn. Süt alımı).'); return }
    const { error } = await supabase.from('cash_movements').insert({ type: cashMoveType, amount, reason: cashMoveReason.trim(), created_by: staffName })
    if (error) { alert('✗ Kaydedilemedi.\n\n' + error.message + '\n\ncash_movements tablosunun Supabase\'de oluşturulduğundan emin olun.'); return }
    setCashMoveAmount('')
    setCashMoveReason('')
    await loadRecentCashMovements()
  }

  async function loadActiveShift() {
    const { data } = await supabase.from('shifts').select('*').is('ended_at', null).order('started_at', { ascending: false }).limit(1).maybeSingle()
    setActiveShift(data || null)
  }

  async function startShift() {
    if (activeShift) return
    const { data, error } = await supabase.from('shifts').insert({ staff_name: staffName, started_at: new Date().toISOString() }).select('*').single()
    if (error) { alert('✗ Vardiya başlatılamadı.\n\n' + error.message + '\n\nshifts tablosunun Supabase\'de oluşturulduğundan emin olun.'); return }
    setActiveShift(data)
  }

  async function openShiftClose() {
    if (!activeShift) return
    const summary = await computeClosedTabsSummary(activeShift.started_at, new Date().toISOString())
    setShiftCloseData(summary)
    setShiftCountedCash('')
    setShowShiftClose(true)
  }

  async function saveShiftClose() {
    if (!shiftCloseData || !activeShift) return
    const counted = parseFloat(shiftCountedCash)
    const diff = isNaN(counted) ? null : (counted - shiftCloseData.expectedCash)
    const { error } = await supabase.from('shifts').update({
      ended_at: new Date().toISOString(),
      counted_cash: isNaN(counted) ? null : counted,
      cash_difference: diff,
      cash_total: shiftCloseData.cashTotal,
      card_total: shiftCloseData.cardTotal,
      transfer_total: shiftCloseData.transferTotal,
      debt_total: shiftCloseData.debtTotal,
      cash_in_total: shiftCloseData.cashInTotal,
      cash_out_total: shiftCloseData.cashOutTotal,
      total_revenue: shiftCloseData.totalRevenue,
      tab_count: shiftCloseData.tabCount,
    }).eq('id', activeShift.id)
    if (error) { alert('✗ Vardiya kapatılamadı.\n\n' + error.message); return }
    const closedStaffName = activeShift.staff_name
    const startedAt = new Date(activeShift.started_at)
    const durationMin = Math.round((Date.now() - startedAt.getTime()) / 60000)
    const hrs = Math.floor(durationMin / 60), mins = durationMin % 60
    setShowShiftClose(false)
    setActiveShift(null)
    alert(`✓ Vardiya kapatıldı.\n\nPersonel: ${closedStaffName}\nSüre: ${hrs}s ${mins}dk\nCiro: ${formatTL(shiftCloseData.totalRevenue)} ₺\nNakit (Satış): ${formatTL(shiftCloseData.cashTotal)} ₺\nKart: ${formatTL(shiftCloseData.cardTotal)} ₺\nHavale: ${formatTL(shiftCloseData.transferTotal)} ₺\nBorç: ${formatTL(shiftCloseData.debtTotal)} ₺\nBeklenen Kasa: ${formatTL(shiftCloseData.expectedCash)} ₺${diff !== null ? `\nKasa Farkı: ${diff >= 0 ? '+' : ''}${formatTL(diff)} ₺` : ''}`)
  }

  async function saveDayClose() {
    if (!dayCloseData) return
    const counted = parseFloat(countedCash)
    const diff = isNaN(counted) ? null : (counted - dayCloseData.expectedCash)
    const { error } = await supabase.from('day_close_reports').insert({
      report_date: new Date().toISOString().split('T')[0],
      total_revenue: dayCloseData.totalRevenue,
      cash_total: dayCloseData.cashTotal,
      card_total: dayCloseData.cardTotal,
      transfer_total: dayCloseData.transferTotal,
      debt_total: dayCloseData.debtTotal,
      cash_in_total: dayCloseData.cashInTotal,
      cash_out_total: dayCloseData.cashOutTotal,
      tab_count: dayCloseData.tabCount,
      counted_cash: isNaN(counted) ? null : counted,
      cash_difference: diff,
      closed_by: staffName,
    })
    if (error) {
      alert('✗ Gün sonu kaydedilemedi.\n\n' + error.message + '\n\nday_close_reports tablosunun Supabase\'de oluşturulduğundan emin olun.')
      return
    }
    setShowDayClose(false)
    alert(`✓ Gün sonu kaydedildi.\n\nToplam Ciro: ${formatTL(dayCloseData.totalRevenue)} ₺\nNakit (Satış): ${formatTL(dayCloseData.cashTotal)} ₺\nKart: ${formatTL(dayCloseData.cardTotal)} ₺\nHavale: ${formatTL(dayCloseData.transferTotal)} ₺\nBorç: ${formatTL(dayCloseData.debtTotal)} ₺\nBeklenen Kasa: ${formatTL(dayCloseData.expectedCash)} ₺${diff !== null ? `\nKasa Farkı: ${diff >= 0 ? '+' : ''}${formatTL(diff)} ₺` : ''}`)
  }



  // Keep the orders list itself live: react instantly to any new order or
  // status change, plus a 20s polling safety net in case a realtime event
  // is missed (flaky wifi, tab was backgrounded, etc). No manual refresh needed.
  useEffect(() => {
    if (!auth || tab !== 'orders') return

    const liveChannel = supabase
      .channel('orders-live-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => loadOrders(dateFilter))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => loadOrders(dateFilter))
      .subscribe()

    const pollId = setInterval(() => loadOrders(dateFilter), 20000)

    return () => { supabase.removeChannel(liveChannel); clearInterval(pollId) }
  }, [auth, tab, dateFilter])
  const [categories, setCategories] = useState<Category[]>([])
  const [staffList, setStaffList] = useState<any[]>([])
  const [staffFormName, setStaffFormName] = useState('')
  const [staffFormPin, setStaffFormPin] = useState('')
  const [staffFormPermission, setStaffFormPermission] = useState<'full'|'limited'>('full')
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [bulkTargetCat, setBulkTargetCat] = useState('')
  const [bulkMode, setBulkMode] = useState(false)

  // Category form
  const [catName, setCatName] = useState('')
  const [catIcon, setCatIcon] = useState('')
  const [editingCat, setEditingCat] = useState<Category | null>(null)

  // Item form
  const [itemName, setItemName] = useState('')
  const [itemDesc, setItemDesc] = useState('')
  const [itemPrice, setItemPrice] = useState('')
  const [itemCat, setItemCat] = useState('')
  const [itemAvail, setItemAvail] = useState(true)
  const [itemRec, setItemRec] = useState(false)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)

  // Item options (e.g. Şeker Oranı: Sade / Az Şekerli / Orta Şekerli / Şekerli)
  // Only editable once an item exists, since groups reference the item id
  const [itemOptionGroups, setItemOptionGroups] = useState<any[]>([])
  const [newGroupName, setNewGroupName] = useState('')
  const [newChoiceText, setNewChoiceText] = useState<Record<string, string>>({})

  async function loadItemOptionGroups(menuItemId: string) {
    const { data: groups } = await supabase.from('item_option_groups').select('*').eq('menu_item_id', menuItemId).order('order_index')
    const groupIds = (groups || []).map((g: any) => g.id)
    let choices: any[] = []
    if (groupIds.length > 0) {
      const { data } = await supabase.from('item_option_choices').select('*').in('group_id', groupIds).order('order_index')
      choices = data || []
    }
    setItemOptionGroups((groups || []).map((g: any) => ({ ...g, choices: choices.filter((c: any) => c.group_id === g.id) })))
  }

  async function addOptionGroup() {
    const name = newGroupName.trim()
    if (!name || !editingItem) return
    const maxOrder = itemOptionGroups.length ? Math.max(...itemOptionGroups.map((g: any) => g.order_index)) + 1 : 0
    await supabase.from('item_option_groups').insert({ menu_item_id: editingItem.id, name, required: true, order_index: maxOrder })
    setNewGroupName('')
    await loadItemOptionGroups(editingItem.id)
  }

  async function deleteOptionGroup(groupId: string) {
    if (!confirm('Bu seçenek grubunu (ve tüm seçeneklerini) silmek istediğinizden emin misiniz?')) return
    await supabase.from('item_option_groups').delete().eq('id', groupId)
    if (editingItem) await loadItemOptionGroups(editingItem.id)
  }

  async function addOptionChoice(groupId: string) {
    const text = (newChoiceText[groupId] || '').trim()
    if (!text || !editingItem) return
    const group = itemOptionGroups.find((g: any) => g.id === groupId)
    const maxOrder = group?.choices?.length ? Math.max(...group.choices.map((c: any) => c.order_index)) + 1 : 0
    await supabase.from('item_option_choices').insert({ group_id: groupId, name: text, price_delta: 0, order_index: maxOrder })
    setNewChoiceText(prev => ({ ...prev, [groupId]: '' }))
    await loadItemOptionGroups(editingItem.id)
  }

  async function deleteOptionChoice(choiceId: string) {
    if (!editingItem) return
    await supabase.from('item_option_choices').delete().eq('id', choiceId)
    await loadItemOptionGroups(editingItem.id)
  }

  // These only fill in the English/Arabic name so the customer menu can
  // show the right language - the admin panel itself stays Turkish-only.
  async function updateGroupTranslation(groupId: string, field: 'name_en' | 'name_ar', value: string) {
    setItemOptionGroups(prev => prev.map((g: any) => g.id === groupId ? { ...g, [field]: value } : g))
    await supabase.from('item_option_groups').update({ [field]: value || null }).eq('id', groupId)
  }

  async function updateChoiceTranslation(groupId: string, choiceId: string, field: 'name_en' | 'name_ar', value: string) {
    setItemOptionGroups(prev => prev.map((g: any) => g.id === groupId
      ? { ...g, choices: g.choices.map((c: any) => c.id === choiceId ? { ...c, [field]: value } : c) }
      : g))
    await supabase.from('item_option_choices').update({ [field]: value || null }).eq('id', choiceId)
  }

  // Image crop states
  const [rawImageSrc, setRawImageSrc] = useState('')
  const [showCropper, setShowCropper] = useState(false)
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null)
  const [croppedPreview, setCroppedPreview] = useState('')
  const [existingImageUrl, setExistingImageUrl] = useState('')

  // Sessions auto-expire after this long regardless of anything else, so a
  // lost/stolen tablet stops working on its own even if nobody notices
  const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

  function clearSession() {
    localStorage.removeItem('kahfe_admin_role')
    localStorage.removeItem('kahfe_admin')
    localStorage.removeItem('kahfe_staff_name')
    localStorage.removeItem('kahfe_staff_permission')
    localStorage.removeItem('kahfe_session_started_at')
    localStorage.removeItem('kahfe_session_epoch')
    localStorage.removeItem('kahfe_session_token')
    setAuth(false); setRole(null); setStaffName(''); setStaffPermission('full')
  }

  async function getCurrentSessionEpoch(): Promise<string> {
    const { data } = await supabase.from('settings').select('value').eq('key', 'session_epoch').maybeSingle()
    return String(data?.value ?? '0')
  }

  async function logoutAllDevices() {
    if (!confirm('Bu, şu anda giriş yapmış olan TÜM cihazları (kendi cihazınız dahil) oturumdan çıkaracak. Herkesin tekrar PIN girmesi gerekecek. Devam edilsin mi?')) return
    const current = await getCurrentSessionEpoch()
    const next = String(Number(current) + 1)
    await supabase.from('settings').upsert({ key: 'session_epoch', value: next, updated_at: new Date().toISOString() })
    clearSession()
  }

  useEffect(() => {
    (async () => {
      const savedRole = localStorage.getItem('kahfe_admin_role')
      const savedName = localStorage.getItem('kahfe_staff_name')
      const savedPermission = localStorage.getItem('kahfe_staff_permission')
      const savedAt = Number(localStorage.getItem('kahfe_session_started_at') || 0)
      const savedEpoch = localStorage.getItem('kahfe_session_epoch')
      if (!(savedRole === 'manager' || savedRole === 'staff' || savedRole === 'touchscreen')) return
      if (!savedAt || Date.now() - savedAt > SESSION_MAX_AGE_MS) { clearSession(); return }
      const currentEpoch = await getCurrentSessionEpoch()
      if (savedEpoch !== currentEpoch) { clearSession(); return }
      setRole(savedRole)
      setAuth(true)
      setStaffName(savedName || (savedRole === 'manager' ? 'Yönetici' : savedRole === 'touchscreen' ? 'Dokunmatik Ekran' : 'Personel'))
      setStaffPermission(savedPermission === 'limited' ? 'limited' : 'full')
    })()
  }, [])

  // Re-check every 2 minutes so a remote "log out all devices" (or the 24h
  // expiry) takes effect promptly on a tablet that stays on-screen for days
  // rather than only being caught on the next full page reload
  useEffect(() => {
    if (!auth) return
    const interval = setInterval(async () => {
      const savedAt = Number(localStorage.getItem('kahfe_session_started_at') || 0)
      if (!savedAt || Date.now() - savedAt > SESSION_MAX_AGE_MS) { clearSession(); return }
      const savedEpoch = localStorage.getItem('kahfe_session_epoch')
      const currentEpoch = await getCurrentSessionEpoch()
      if (savedEpoch !== currentEpoch) clearSession()
    }, 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [auth])

  // Staff and the shared Touchscreen account can only ever see the orders tab
  useEffect(() => { if (role === 'staff' || role === 'touchscreen') setTab('orders') }, [role])
  useEffect(() => { if ((role === 'staff' || role === 'touchscreen') && dateFilter !== 'today') setDateFilter('today') }, [role, dateFilter])

  // Ticks every 30s purely so table occupancy timers ("· 42 dk") update
  // live on screen without needing a full data reload
  const [clockTick, setClockTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setClockTick(t => t + 1), 30 * 1000)
    return () => clearInterval(interval)
  }, [])

  function minutesSince(isoString: string): number {
    return Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 60000))
  }

  // Visual floor plan: free-form table positions instead of the fixed
  // category grid, so the layout can match real seating. Positions persist
  // in settings (table_positions), same pattern as everything else here.
  const FLOOR_TILE = 100
  const FLOOR_COLS = 6
  const [tablePositions, setTablePositions] = useState<Record<string, { x: number, y: number }>>({})
  const [floorEditMode, setFloorEditMode] = useState(false)
  const [dragPreview, setDragPreview] = useState<{ table: string, x: number, y: number } | null>(null)
  const dragStartRef = useRef<{ table: string, startX: number, startY: number, origX: number, origY: number } | null>(null)

  const floorCanvasHeight = Math.max(400, Math.ceil(ALL_TABLES.length / FLOOR_COLS) * 130 + 60)
  const floorCanvasWidth = FLOOR_COLS * 130

  function getTablePosition(tableName: string): { x: number, y: number } {
    if (tablePositions[tableName]) return tablePositions[tableName]
    const idx = ALL_TABLES.indexOf(tableName)
    const col = idx % FLOOR_COLS
    const row = Math.floor(idx / FLOOR_COLS)
    return { x: 20 + col * 130, y: 20 + row * 130 }
  }

  async function saveTablePositions(next: Record<string, { x: number, y: number }>) {
    setTablePositions(next)
    await supabase.from('settings').upsert({ key: 'table_positions', value: next, updated_at: new Date().toISOString() })
  }

  function clampFloorPos(x: number, y: number) {
    return { x: Math.min(Math.max(0, x), floorCanvasWidth - FLOOR_TILE), y: Math.min(Math.max(0, y), floorCanvasHeight - FLOOR_TILE) }
  }

  function handleFloorPointerDown(e: React.PointerEvent, tableName: string) {
    if (!floorEditMode) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const pos = getTablePosition(tableName)
    dragStartRef.current = { table: tableName, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }
    setDragPreview({ table: tableName, ...pos })
  }
  function handleFloorPointerMove(e: React.PointerEvent) {
    const d = dragStartRef.current
    if (!d) return
    const next = clampFloorPos(d.origX + (e.clientX - d.startX), d.origY + (e.clientY - d.startY))
    setDragPreview({ table: d.table, ...next })
  }
  function handleFloorPointerUp(e: React.PointerEvent) {
    const d = dragStartRef.current
    if (!d) return
    const finalPos = clampFloorPos(d.origX + (e.clientX - d.startX), d.origY + (e.clientY - d.startY))
    dragStartRef.current = null
    setDragPreview(null)
    saveTablePositions({ ...tablePositions, [d.table]: finalPos })
  }

  useEffect(() => { if (auth) { loadData(); loadSettings(); loadDebtors(); loadActiveShift() } }, [auth])

  async function loadData() {
    const [{ data: cats }, { data: its }, { data: staffData }] = await Promise.all([
      supabase.from('categories').select('*').order('order_index'),
      supabase.from('menu_items').select('*').order('order_index'),
      supabase.rpc('list_staff'),
    ])
    setCategories(cats || [])
    setItems(its || [])
    setStaffList(staffData || [])

    const itemIds = (its || []).map((x: any) => x.id)
    if (itemIds.length > 0) {
      const { data: groups } = await supabase.from('item_option_groups').select('*').in('menu_item_id', itemIds).order('order_index')
      const groupIds = (groups || []).map((g: any) => g.id)
      let choices: any[] = []
      if (groupIds.length > 0) {
        const { data } = await supabase.from('item_option_choices').select('*').in('group_id', groupIds).order('order_index')
        choices = data || []
      }
      const map: Record<string, any[]> = {}
      ;(groups || []).forEach((g: any) => {
        if (!map[g.menu_item_id]) map[g.menu_item_id] = []
        map[g.menu_item_id].push({ ...g, choices: choices.filter((ch: any) => ch.group_id === g.id) })
      })
      setMenuItemOptions(map)
    }
  }

  function hasMenuOptions(itemId: string) {
    return (menuItemOptions[itemId]?.length || 0) > 0
  }

  function startEditStaff(s: any) {
    setEditingStaffId(s.id)
    setStaffFormName(s.name)
    setStaffFormPin(s.pin)
    setStaffFormPermission(s.permission === 'limited' ? 'limited' : 'full')
  }

  function resetStaffForm() {
    setEditingStaffId(null)
    setStaffFormName('')
    setStaffFormPin('')
    setStaffFormPermission('full')
  }

  async function saveStaff() {
    const name = staffFormName.trim()
    const pin = staffFormPin.trim()
    if (!name || !/^\d{4,6}$/.test(pin)) {
      alert('Lütfen bir isim ve 4-6 haneli bir PIN girin.')
      return
    }
    const { data: reserved } = await supabase.rpc('pin_is_reserved', { p_pin: pin }) as { data: boolean | null }
    if (reserved) {
      alert('Bu PIN, yönetici/dokunmatik ekran şifrelerinden biriyle aynı olamaz. Başka bir PIN seçin.')
      return
    }
    const dup = staffList.find(s => s.pin === pin && s.id !== editingStaffId)
    if (dup) {
      alert(`Bu PIN zaten ${dup.name} adlı personelde kullanılıyor. Başka bir PIN seçin.`)
      return
    }
    const { error } = await supabase.rpc('upsert_staff', { p_id: editingStaffId, p_name: name, p_pin: pin, p_permission: staffFormPermission })
    if (error) { alert('✗ Kaydedilemedi.\n\n' + error.message); return }
    resetStaffForm()
    await loadData()
  }

  async function toggleStaffActive(s: any) {
    await supabase.rpc('set_staff_active', { p_id: s.id, p_active: !s.active })
    await loadData()
  }

  async function deleteStaff(id: string) {
    if (!confirm('Bu personeli silmek istediğinizden emin misiniz?')) return
    await supabase.rpc('delete_staff', { p_id: id })
    await loadData()
  }

  async function login() {
    // One atomic server-side call: checks the PIN (staff PIN or manager/
    // touchscreen/staff-shared PIN) and, only on success, mints a session
    // token — nobody can obtain a token without passing a real PIN check
    // inside this same database call.
    const { data, error } = await supabase.rpc('login_with_pin', { p_pin: pw }).maybeSingle() as { data: { role: string, token: string, staff_name: string, permission: string | null } | null, error: any }
    if (error) {
      setLoginSystemError(error.message || 'Bilinmeyen hata')
      return
    }
    setLoginSystemError('')
    if (!data) { setPwError(true); return }
    const normalizedRole: 'manager' | 'staff' | 'touchscreen' = data.role === 'manager' ? 'manager' : data.role === 'touchscreen' ? 'touchscreen' : 'staff'
    const permission: 'full' | 'limited' = data.permission === 'limited' ? 'limited' : 'full'
    localStorage.setItem('kahfe_admin_role', normalizedRole)
    localStorage.setItem('kahfe_staff_name', data.staff_name)
    localStorage.setItem('kahfe_staff_permission', permission)
    localStorage.setItem('kahfe_session_started_at', String(Date.now()))
    localStorage.setItem('kahfe_session_token', data.token)
    const epoch = await getCurrentSessionEpoch()
    localStorage.setItem('kahfe_session_epoch', epoch)
    setRole(normalizedRole)
    setStaffName(data.staff_name)
    setStaffPermission(permission)
    setAuth(true)
  }

  function showMsg(m: string) { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  // Category CRUD
  async function saveCategory() {
    if (!catName.trim()) return
    setLoading(true)
    if (editingCat) {
      await supabase.from('categories').update({ name: catName, icon: catIcon }).eq('id', editingCat.id)
      showMsg('Kategori güncellendi ✓'); setEditingCat(null)
    } else {
      const maxOrder = categories.length ? Math.max(...categories.map(c => c.order_index)) + 1 : 0
      await supabase.from('categories').insert({ name: catName, icon: catIcon, order_index: maxOrder })
      showMsg('Kategori eklendi ✓')
    }
    setCatName(''); setCatIcon(''); await loadData(); setLoading(false)
  }

  async function deleteCategory(id: string) {
    if (!confirm('Bu kategoriyi silmek istediğinizden emin misiniz?')) return
    await supabase.from('categories').delete().eq('id', id)
    showMsg('Kategori silindi'); await loadData()
  }

  // Item CRUD
  async function uploadBlob(blob: Blob): Promise<string> {
    const path = `items/${Date.now()}.jpg`
    const { error } = await supabase.storage.from('menu-images').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
    if (error) throw error
    return supabase.storage.from('menu-images').getPublicUrl(path).data.publicUrl
  }

  async function saveItem() {
    if (!itemName.trim() || !itemPrice || !itemCat) { showMsg('Ad, fiyat ve kategori zorunludur'); return }
    setLoading(true)
    try {
      let imageUrl = existingImageUrl
      if (croppedBlob) imageUrl = await uploadBlob(croppedBlob)

      if (editingItem) {
        await supabase.from('menu_items').update({ name: itemName, description: itemDesc, price: parseFloat(itemPrice), category_id: itemCat, image_url: imageUrl, available: itemAvail, recommended: itemRec }).eq('id', editingItem.id)
        showMsg('Ürün güncellendi ✓')
        await loadData()
      } else {
        const maxOrder = items.length ? Math.max(...items.map(i => i.order_index)) + 1 : 0
        const { data: newItem } = await supabase.from('menu_items').insert({ name: itemName, description: itemDesc, price: parseFloat(itemPrice), category_id: itemCat, image_url: imageUrl, available: itemAvail, recommended: itemRec, order_index: maxOrder }).select().single()
        showMsg('✓ Ürün eklendi. Şimdi isterseniz seçenek (şeker oranı vb.) ekleyebilirsiniz.')
        await loadData()
        if (newItem) { startEditItem(newItem as MenuItem); setLoading(false); return }
      }
      resetItemForm()
    } catch (e) { showMsg('Hata: ' + (e as Error).message) }
    setLoading(false)
  }

  async function deleteItem(id: string) {
    if (!confirm('Bu ürünü silmek istediğinizden emin misiniz?')) return
    await supabase.from('menu_items').delete().eq('id', id)
    showMsg('Ürün silindi'); await loadData()
  }

  async function bulkMove() {
    if (!bulkTargetCat || selectedItems.size === 0) { showMsg('Hedef kategori ve ürün seçin'); return }
    setLoading(true)
    const ids = Array.from(selectedItems)
    await Promise.all(ids.map(id => supabase.from('menu_items').update({ category_id: bulkTargetCat }).eq('id', id)))
    showMsg(`✓ ${ids.length} ürün taşındı`)
    setSelectedItems(new Set())
    setBulkTargetCat('')
    setBulkMode(false)
    await loadData()
    setLoading(false)
  }

  function toggleSelect(id: string) {
    setSelectedItems(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  async function toggleAvail(item: MenuItem) {
    await supabase.from('menu_items').update({ available: !item.available }).eq('id', item.id)
    await loadData()
  }

  function startEditItem(item: MenuItem) {
    setEditingItem(item); setItemName(item.name); setItemDesc(item.description || '')
    setItemPrice(item.price.toString()); setItemCat(item.category_id); setItemAvail(item.available)
    setItemRec(item.recommended || false)
    setExistingImageUrl(item.image_url || ''); setCroppedBlob(null); setCroppedPreview(item.image_url || '')
    setRawImageSrc(''); setShowCropper(false)
    loadItemOptionGroups(item.id)
  }

  function resetItemForm() {
    setItemName(''); setItemDesc(''); setItemPrice(''); setItemCat(''); setItemAvail(true); setItemRec(false)
    setEditingItem(null); setCroppedBlob(null); setCroppedPreview(''); setRawImageSrc('')
    setExistingImageUrl(''); setShowCropper(false)
    setItemOptionGroups([]); setNewGroupName(''); setNewChoiceText({})
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const url = URL.createObjectURL(file)
    setRawImageSrc(url); setShowCropper(true)
  }

  function handleCropDone(blob: Blob) {
    setCroppedBlob(blob)
    setCroppedPreview(URL.createObjectURL(blob))
    setShowCropper(false)
  }

  const s = {
    page: { background: '#0A0A0A', minHeight: '100vh', maxWidth: 480, margin: '0 auto', paddingBottom: 40 } as React.CSSProperties,
    header: { background: '#1A1A1A', padding: '16px 20px', borderBottom: '1px solid #2A2A2A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as React.CSSProperties,
    input: { width: '100%', background: '#2A2A2A', border: '1px solid #383838', borderRadius: 0, padding: '12px 14px', color: '#F0EDE8', fontSize: 14, outline: 'none' } as React.CSSProperties,
    label: { color: '#8A8A8A', fontSize: 12, fontWeight: 600, marginBottom: 6, display: 'block', letterSpacing: 1 } as React.CSSProperties,
    btn: { background: '#C0392B', border: 'none', borderRadius: 0, padding: '12px 20px', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', width: '100%' } as React.CSSProperties,
    btnSecondary: { background: '#2A2A2A', border: 'none', borderRadius: 0, padding: '10px 16px', color: '#8A8A8A', fontWeight: 600, fontSize: 13, cursor: 'pointer' } as React.CSSProperties,
    card: { background: '#1A1A1A', borderRadius: 0, padding: '14px 16px', border: '1px solid #2A2A2A', marginBottom: 10 } as React.CSSProperties,
    section: { padding: '16px 20px' } as React.CSSProperties,
  }

  if (!auth) return (
    <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <ConnectivityBanner />
      <div style={{ background: '#1A1A1A', borderRadius: 0, padding: 32, width: '100%', maxWidth: 360, border: '1px solid #2A2A2A' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ color: '#C9A84C', fontSize: 10, letterSpacing: 4, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>YÖNETİM PANELİ</div>
          <div style={{ color: '#F0EDE8', fontSize: 24, fontWeight: 800, fontFamily: "'Bricolage Grotesque', sans-serif", letterSpacing: '-0.01em' }}>KAHFE LOUNGE</div>
        </div>
        <label style={s.label}>ŞİFRE</label>
        <input type="password" value={pw} onChange={e => { setPw(e.target.value); setPwError(false) }}
          onKeyDown={e => e.key === 'Enter' && login()}
          style={{ ...s.input, height: 52, fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, letterSpacing: '0.2em', borderColor: pwError ? '#C0392B' : '#383838', boxShadow: pwError ? 'none' : 'none', marginBottom: 8 }}
          placeholder="Şifrenizi girin" />
        {pwError && <div style={{ color: '#C0392B', fontSize: 12, marginBottom: 12 }}>Hatalı şifre</div>}
        {loginSystemError && <div style={{ color: '#f39c12', fontSize: 12, marginBottom: 12, padding: 10, background: 'rgba(243,156,18,.1)', border: '1px solid rgba(243,156,18,.3)' }}>⚠️ Sistem hatası (şifre yanlış değil): {loginSystemError}<br/>Bu genellikle çalıştırılmamış bir SQL migration'ı gösterir — Claude'a bu mesajı gösterin.</div>}
        <button onClick={login} style={{ ...s.btn, height: 56, fontSize: 16, marginTop: 8 }}>Giriş Yap</button>
      </div>
    </div>
  )

  return (
    <>
      {showCropper && rawImageSrc && (
        <ImageCropper src={rawImageSrc} onCrop={handleCropDone} onCancel={() => setShowCropper(false)} />
      )}
      <style>{`
        @keyframes bellShake {
          0%,100%{transform:rotate(0)} 20%{transform:rotate(-15deg)} 40%{transform:rotate(15deg)} 60%{transform:rotate(-10deg)} 80%{transform:rotate(10deg)}
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0A0A0A; color: #F0EDE8; font-family: 'IBM Plex Sans', system-ui, sans-serif; }

        /* Fill the available width on touchscreens/desktops instead of
           staying pinned to a narrow phone-width column in the middle */
        .kahfe-shell { max-width: 480px; margin: 0 auto; }
        @media (min-width: 700px)  { .kahfe-shell { max-width: 100%; } }
        @media (min-width: 700px)  { .kahfe-shell .kahfe-section { padding-left: 32px; padding-right: 32px; } }
        @media (min-width: 700px)  { .kahfe-shell .kahfe-header   { padding-left: 32px; padding-right: 32px; } }
        @media (min-width: 1100px) { .kahfe-shell .kahfe-section { padding-left: 56px; padding-right: 56px; } }
        @media (min-width: 1100px) { .kahfe-shell .kahfe-header   { padding-left: 56px; padding-right: 56px; } }

        .kahfe-modal { max-width: 480px; }
        @media (min-width: 700px) { .kahfe-modal { max-width: 560px; } }
      `}</style>
      <div className="kahfe-shell" style={{ background: '#0A0A0A', minHeight: '100vh', paddingBottom: 40 }}>
        <ConnectivityBanner />
        <div className="kahfe-header" style={s.header}>
          <div>
            <div style={{ color: '#C9A84C', fontSize: 10, letterSpacing: 3, fontFamily: "'IBM Plex Mono', monospace" }}>YÖNETİM</div>
            <div style={{ color: '#F0EDE8', fontSize: 19, fontWeight: 800, fontFamily: "'Bricolage Grotesque', sans-serif", letterSpacing: '-0.01em' }}>KAHFE LOUNGE</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {/* Kitchen Display link */}
            <a href="/kitchen" target="_blank" rel="noopener noreferrer"
              style={{ background: '#2A2A2A', border: '1px solid #383838', borderRadius: 0, width: 40, height: 40, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, textDecoration: 'none' }}>
              🍳
            </a>
            {/* Nargile Display link */}
            <a href="/nargile" target="_blank" rel="noopener noreferrer"
              style={{ background: '#2A2A2A', border: '1px solid #383838', borderRadius: 0, width: 40, height: 40, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, textDecoration: 'none' }}>
              💨
            </a>
            {/* Notification Bell */}
            <button onClick={() => { setShowNotif(!showNotif); setNewOrderAlert(false) }}
              style={{ position: 'relative', background: newOrderAlert ? 'rgba(192,57,43,.2)' : '#2A2A2A', border: newOrderAlert ? '1px solid #C0392B' : '1px solid #383838', borderRadius: 0, width: 40, height: 40, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, animation: newOrderAlert ? 'bellShake .5s ease infinite' : 'none' }}>
              🔔
              {notifications.length > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, background: '#C0392B', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{notifications.length}</span>
              )}
            </button>
            <button onClick={clearSession} style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: 0, padding: '6px 12px', color: '#8A8A8A', fontSize: 12, cursor: 'pointer' }}>Çıkış</button>
          </div>
        </div>

        {/* Notification Panel */}
        {showNotif && (
          <NotificationPopup notifications={notifications} onClose={() => setShowNotif(false)} onDismiss={dismissOrder} onAccept={acceptOrder} />
        )}

        {/* Shift (Vardiya) status bar — anyone can start/end their own shift */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 16px', background: activeShift ? 'rgba(39,174,96,.08)' : '#111111', borderBottom: '1px solid #2A2A2A' }}>
          {activeShift ? (
            <div style={{ color: '#8A8A8A', fontSize: 12 }}>
              <span style={{ color: '#5FD08C', fontWeight: 700 }}>⏱ {activeShift.staff_name}</span> · {new Date(activeShift.started_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}'den beri
            </div>
          ) : (
            <div style={{ color: '#8A8A8A', fontSize: 12 }}>Aktif vardiya yok</div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            {!isLimitedStaff && (
              <button onClick={openCashMovement} style={{ height: 34, padding: '0 14px', background: 'transparent', border: '1px solid #383838', color: '#C9A84C', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>💰 Kasa Hareketi</button>
            )}
            {activeShift ? (
              <button onClick={openShiftClose} style={{ height: 34, padding: '0 14px', background: 'transparent', border: '1px solid #383838', color: '#e74c3c', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>⏹ Vardiyayı Bitir</button>
            ) : (
              <button onClick={startShift} style={{ height: 34, padding: '0 14px', background: 'rgba(201,168,76,.14)', border: '1px solid #C9A84C', color: '#C9A84C', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>▶ Vardiyamı Başlat</button>
            )}
          </div>
        </div>

        {/* Kasa Hareketi (manual cash in/out) modal */}
        {showCashMovement && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 260, background: 'rgba(0,0,0,.92)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end' }} onClick={() => setShowCashMovement(false)}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: '#141414', border: '1px solid rgba(201,168,76,.35)', borderBottom: 'none' }}>
              <div style={{ padding: '18px 20px', borderBottom: '1px solid #2A2A2A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#C9A84C', fontWeight: 700, fontSize: 17, fontFamily: "'Bricolage Grotesque', sans-serif" }}>💰 Kasa Hareketi</div>
                <button onClick={() => setShowCashMovement(false)} style={{ background: '#2A2A2A', border: 'none', width: 36, height: 36, color: '#8A8A8A', cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>
              <div style={{ padding: 20, maxHeight: '75vh', overflowY: 'auto' }}>
                <div style={{ color: '#8A8A8A', fontSize: 12, marginBottom: 14 }}>Satış dışı nakit hareketlerini kaydedin (malzeme alımı, kasa açılış parası, vb.) — Gün Sonü ve Vardiya hesaplamalarında dikkate alınır.</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button onClick={() => setCashMoveType('out')} style={{ flex: 1, height: 44, background: cashMoveType === 'out' ? 'rgba(231,76,60,.14)' : 'transparent', border: cashMoveType === 'out' ? '1px solid #e74c3c' : '1px solid #383838', color: cashMoveType === 'out' ? '#e74c3c' : '#8A8A8A', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>➖ Kasadan Çıkış</button>
                  <button onClick={() => setCashMoveType('in')} style={{ flex: 1, height: 44, background: cashMoveType === 'in' ? 'rgba(39,174,96,.14)' : 'transparent', border: cashMoveType === 'in' ? '1px solid #27ae60' : '1px solid #383838', color: cashMoveType === 'in' ? '#5FD08C' : '#8A8A8A', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>➕ Kasaya Giriş</button>
                </div>
                <input type="number" value={cashMoveAmount} onChange={e => setCashMoveAmount(e.target.value)} placeholder="Tutar (₺)"
                  style={{ width: '100%', height: 50, background: '#0A0A0A', border: '1px solid #383838', color: '#F0EDE8', padding: '0 14px', fontSize: 16, marginBottom: 10, fontFamily: "'IBM Plex Mono', monospace" }} />
                <input value={cashMoveReason} onChange={e => setCashMoveReason(e.target.value)} placeholder="Açıklama (örn. Süt alımı, kasa açılış parası)"
                  style={{ width: '100%', height: 50, background: '#0A0A0A', border: '1px solid #383838', color: '#F0EDE8', padding: '0 14px', fontSize: 14, marginBottom: 16 }} />
                <button onClick={saveCashMovement} style={{ width: '100%', height: 52, background: '#C9A84C', border: 'none', color: '#0A0A0A', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 20 }}>✓ Kaydet</button>

                <div style={{ color: '#8A8A8A', fontSize: 11, letterSpacing: '0.08em', marginBottom: 10, textTransform: 'uppercase' }}>Bugünkü Hareketler</div>
                {recentCashMovements.length === 0 && (
                  <div style={{ color: '#8A8A8A', fontSize: 13, textAlign: 'center', padding: 14 }}>Bugün henüz kasa hareketi yok.</div>
                )}
                {recentCashMovements.map((m: any) => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #2A2A2A' }}>
                    <div>
                      <div style={{ color: '#F0EDE8', fontSize: 13 }}>{m.reason}</div>
                      <div style={{ color: '#8A8A8A', fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}>{m.created_by} · {new Date(m.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div style={{ color: m.type === 'in' ? '#5FD08C' : '#e74c3c', fontWeight: 700, fontSize: 14, fontFamily: "'IBM Plex Mono', monospace" }}>{m.type === 'in' ? '+' : '-'}{formatTL(Number(m.amount))} ₺</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Shift close (Vardiya Sonu) modal */}
        {showShiftClose && shiftCloseData && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 260, background: 'rgba(0,0,0,.92)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end' }} onClick={() => setShowShiftClose(false)}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: '#141414', border: '1px solid rgba(231,76,60,.35)', borderBottom: 'none' }}>
              <div style={{ padding: '18px 20px', borderBottom: '1px solid #2A2A2A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#e74c3c', fontWeight: 700, fontSize: 17, fontFamily: "'Bricolage Grotesque', sans-serif" }}>⏹ Vardiya Sonu — {activeShift?.staff_name}</div>
                <button onClick={() => setShowShiftClose(false)} style={{ background: '#2A2A2A', border: 'none', width: 36, height: 36, color: '#8A8A8A', cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>
              <div style={{ padding: 20, maxHeight: '75vh', overflowY: 'auto' }}>
                <div style={{ color: '#8A8A8A', fontSize: 12, marginBottom: 16 }}>
                  {activeShift && new Date(activeShift.started_at).toLocaleString('tr-TR')} — {new Date().toLocaleString('tr-TR')}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                  <div style={{ flex: '1 1 45%', background: '#1A1A1A', border: '1px solid rgba(201,168,76,.2)', padding: 14, textAlign: 'center' }}>
                    <div style={{ color: '#8A8A8A', fontSize: 11 }}>CİRO</div>
                    <div style={{ color: '#C9A84C', fontWeight: 800, fontSize: 18 }}>{formatTL(shiftCloseData.totalRevenue)} ₺</div>
                  </div>
                  <div style={{ flex: '1 1 45%', background: '#1A1A1A', border: '1px solid #2A2A2A', padding: 14, textAlign: 'center' }}>
                    <div style={{ color: '#8A8A8A', fontSize: 11 }}>💵 NAKİT (SATIŞ)</div>
                    <div style={{ color: '#F0EDE8', fontWeight: 800, fontSize: 18 }}>{formatTL(shiftCloseData.cashTotal)} ₺</div>
                  </div>
                  <div style={{ flex: '1 1 45%', background: '#1A1A1A', border: '1px solid rgba(201,168,76,.35)', padding: 14, textAlign: 'center' }}>
                    <div style={{ color: '#8A8A8A', fontSize: 11 }}>🗄️ BEKLENEN KASA</div>
                    <div style={{ color: '#C9A84C', fontWeight: 800, fontSize: 18 }}>{formatTL(shiftCloseData.expectedCash)} ₺</div>
                  </div>
                  <div style={{ flex: '1 1 45%', background: '#1A1A1A', border: '1px solid #2A2A2A', padding: 14, textAlign: 'center' }}>
                    <div style={{ color: '#8A8A8A', fontSize: 11 }}>💳 KART</div>
                    <div style={{ color: '#F0EDE8', fontWeight: 800, fontSize: 18 }}>{formatTL(shiftCloseData.cardTotal)} ₺</div>
                  </div>
                  <div style={{ flex: '1 1 45%', background: '#1A1A1A', border: '1px solid #2A2A2A', padding: 14, textAlign: 'center' }}>
                    <div style={{ color: '#8A8A8A', fontSize: 11 }}>🏦 HAVALE</div>
                    <div style={{ color: '#F0EDE8', fontWeight: 800, fontSize: 18 }}>{formatTL(shiftCloseData.transferTotal)} ₺</div>
                  </div>
                  <div style={{ flex: '1 1 45%', background: '#1A1A1A', border: '1px solid rgba(231,76,60,.25)', padding: 14, textAlign: 'center' }}>
                    <div style={{ color: '#8A8A8A', fontSize: 11 }}>🧾 BORÇ</div>
                    <div style={{ color: '#e74c3c', fontWeight: 800, fontSize: 18 }}>{formatTL(shiftCloseData.debtTotal)} ₺</div>
                  </div>
                  <div style={{ flex: '1 1 45%', background: '#1A1A1A', border: '1px solid #2A2A2A', padding: 14, textAlign: 'center' }}>
                    <div style={{ color: '#8A8A8A', fontSize: 11 }}>SİPARİŞ SAYISI</div>
                    <div style={{ color: '#F0EDE8', fontWeight: 800, fontSize: 18 }}>{shiftCloseData.tabCount}</div>
                  </div>
                </div>
                <label style={{ color: '#8A8A8A', fontSize: 12, display: 'block', marginBottom: 8 }}>Sayılan Nakit (kasada gerçekte olan) — Beklenen Kasa ile karşılaştırılır, opsiyonel</label>
                <input type="number" value={shiftCountedCash} onChange={e => setShiftCountedCash(e.target.value)} placeholder="Örn. 3200"
                  style={{ width: '100%', height: 50, background: '#0A0A0A', border: '1px solid #383838', color: '#F0EDE8', padding: '0 14px', fontSize: 16, marginBottom: 20, fontFamily: "'IBM Plex Mono', monospace" }} />
                <button onClick={saveShiftClose} style={{ width: '100%', height: 54, background: '#e74c3c', border: 'none', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>✓ Vardiyayı Kapat</button>
              </div>
            </div>
          </div>
        )}

        {msg && <div style={{ background: '#1a3a1a', border: '1px solid #2a5a2a', color: '#4CAF50', padding: '12px 20px', fontSize: 14, fontWeight: 600 }}>{msg}</div>}

        <div style={{ display: 'flex', borderBottom: '1px solid #2A2A2A', overflowX: 'auto' }}>
          {(isManager ? (['orders', 'categories', 'items', 'staff', 'settings', 'debts', 'receipts', 'accountability'] as const) : (['orders'] as const)).map(t => (
            <button key={t} onClick={() => { setTab(t); if(t==='orders') loadOrders(dateFilter); if(t==='debts') loadDebtTransactions(); if(t==='receipts') searchReceipts(); if(t==='accountability') searchAccountability() }}
              style={{ flex: '1 0 auto', minWidth: 80, padding: '16px 8px', background: 'transparent', border: 'none', borderBottom: tab === t ? '2px solid #C9A84C' : '2px solid transparent', color: tab === t ? '#F0EDE8' : '#8A8A8A', fontWeight: tab === t ? 600 : 500, fontSize: 13, cursor: 'pointer', position: 'relative', whiteSpace: 'nowrap' }}>
              {t === 'categories' ? 'Kategoriler' : t === 'items' ? 'Ürünler' : t === 'staff' ? 'Personel' : t === 'settings' ? 'Ayarlar' : t === 'debts' ? 'Borç' : t === 'receipts' ? 'Fiş Geçmişi' : t === 'accountability' ? 'İndirim/İptal' : 'Siparişler'}
              {t === 'orders' && notifications.length > 0 && (
                <span style={{ position:'absolute', top:8, right:8, background:'#C0392B', color:'#fff', borderRadius:'50%', width:16, height:16, fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>{notifications.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* CATEGORIES */}
        {/* ORDERS TAB */}
        {tab === 'orders' && (
          <div className="kahfe-section" style={{ padding: '16px 20px' }}>

            {/* Monthly report modal - managers only */}
            {isManager && showMonthlyReport && (
              <MonthlyReportModal report={showMonthlyReport} onExportPDF={() => exportMonthlyReportPDF(showMonthlyReport)} onClose={() => setShowMonthlyReport(null)} />
            )}

            {/* Day-end close-out modal */}
            {isManager && showDayClose && dayCloseData && (
              <DayCloseModal dayCloseData={dayCloseData} countedCash={countedCash} onCountedCashChange={setCountedCash}
                onSave={saveDayClose} onExportPDF={() => printDayClosePDF(dayCloseData, countedCash)} onClose={() => setShowDayClose(false)} />
            )}

            {/* Ürün Raporu - per-item sales breakdown */}
            {isManager && showItemReport && (
              <ItemReportModal itemReportRange={itemReportRange} itemReportData={itemReportData} onRangeChange={openItemReport}
                customFrom={itemReportCustomFrom} customTo={itemReportCustomTo}
                onCustomFromChange={setItemReportCustomFrom} onCustomToChange={setItemReportCustomTo}
                onExportPDF={() => printItemReportPDF(itemReportRange, itemReportData)} onClose={() => setShowItemReport(false)} />
            )}

            {/* Staff Performance report modal */}
            {isManager && showStaffReport && (
              <StaffReportModal staffReportRange={staffReportRange} staffReportData={staffReportData} onRangeChange={openStaffReport}
                onExportPDF={() => printStaffReportPDF(staffReportRange, staffReportData)} onClose={() => setShowStaffReport(false)} />
            )}

            {/* Table drilldown modal - tap a table on the map */}
            {activeTableModal && (() => {
              const info = getTableInfo(activeTableModal)
              const activeOrders = info.orders.filter((o:any) => o.status !== 'dismissed')
              const tabTotal = activeOrders.reduce((s:number,o:any)=>s+Number(o.total),0)
              return (
                <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,.9)', backdropFilter:'blur(6px)', display:'flex', alignItems:'flex-end' }} onClick={() => setActiveTableModal(null)}>
                  <div className="kahfe-modal" onClick={e=>e.stopPropagation()} style={{ width:'100%', margin:'0 auto', background:'#141414', borderRadius: 0, maxHeight:'85vh', overflowY:'auto', border:'1px solid rgba(201,168,76,.3)', borderBottom:'none' }}>
                    <div style={{ padding:'20px', borderBottom:'1px solid #2A2A2A', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                      <div style={{ color:'#F0EDE8', fontWeight:700, fontSize:20, fontFamily:"'Bricolage Grotesque', sans-serif" }}>🪑 {activeTableModal}</div>
                      <button onClick={() => setActiveTableModal(null)} style={{ background:'#2A2A2A', border:'none', borderRadius: 0, width:36, height:36, color:'#8A8A8A', cursor:'pointer', fontSize:16 }}>✕</button>
                    </div>
                    <div style={{ padding:'16px 20px' }}>
                      {activeOrders.length === 0 && (
                        <div style={{ textAlign:'center', color:'#8A8A8A', padding:'30px 0' }}>Bu masa şu an boş.</div>
                      )}
                      {activeOrders.map((order:any) => {
                        const statusColor = order.status==='pending'?'#C0392B':'#27ae60'
                        const statusLabel = order.status==='pending'?'Bekliyor':'Tamamlandı'
                        return (
                          <div key={order.id} style={{ background:'#1A1A1A', border:'1px solid #2A2A2A', borderLeft:`3px solid ${statusColor}`, borderRadius: 0, padding:'14px 16px', marginBottom:10 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                              <span style={{ background:statusColor, color:'#fff', borderRadius: 0, padding:'4px 10px', fontSize:10, fontWeight:700, fontFamily:"'IBM Plex Mono', monospace", letterSpacing:'0.05em', textTransform:'uppercase' }}>{statusLabel}</span>
                              <span style={{ color:'#8A8A8A', fontSize:11, fontFamily:"'IBM Plex Mono', monospace" }}>{new Date(order.created_at).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'})}</span>
                            </div>
                            {order.items?.map((item:any, i:number) => (
                              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:14, color:'rgba(240,237,232,.85)', padding:'3px 0' }}>
                                <span><span style={{ color:'#C9A84C', fontFamily:"'IBM Plex Mono', monospace" }}>{item.quantity}×</span> {item.name}</span>
                                <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                                  <span style={{ color:'#B5B0A8', fontFamily:"'IBM Plex Mono', monospace" }}>{item.subtotal} ₺</span>
                                  {!isLimitedStaff && <button onClick={() => openVoid(order, i)} title="Ürünü iptal et" style={{ background:'transparent', border:'1px solid #383838', color:'#8A8A8A', width:26, height:26, cursor:'pointer', fontSize:12, lineHeight:1 }}>✕</button>}
                                </span>
                              </div>
                            ))}
                            {order.note && (
                              <div style={{ marginTop:8, padding:'8px 10px', background:'rgba(201,168,76,.06)', border:'1px solid rgba(201,168,76,.15)', borderRadius: 0, fontSize:12, color:'rgba(240,237,232,.7)' }}>📝 {order.note}</div>
                            )}
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10, paddingTop:8, borderTop:'1px solid rgba(201,168,76,.2)' }}>
                              <span style={{ color:'#C9A84C', fontWeight:700, fontSize:16, fontFamily:"'IBM Plex Mono', monospace" }}>₺ {order.total}</span>
                              <div style={{ display:'flex', gap:6 }}>
                                {!isLimitedStaff && order.status === 'pending' && <button onClick={() => openCancelOrder(order)} title="Siparişi iptal et" style={{ background:'transparent', border:'1px solid #383838', color:'#e74c3c', height:40, padding:'0 10px', cursor:'pointer', fontSize:16 }}>🚫</button>}
                                {order.status === 'pending' && <button onClick={() => updateOrderStatus(order.id, 'served')} disabled={!isOnline} style={{ background: isOnline ? '#27ae60' : '#2A2A2A', border:'none', borderRadius: 0, height:40, padding:'0 16px', color: isOnline ? '#fff' : '#666', fontSize:13, cursor: isOnline ? 'pointer' : 'not-allowed', fontWeight:600, fontFamily:"'IBM Plex Sans', sans-serif" }}>{isOnline ? '✓ Tamamlandı' : '🔴'}</button>}
                              </div>
                            </div>
                          </div>
                        )
                      })}

                      {activeOrders.length > 0 && (
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 2px', marginTop:6, marginBottom:16 }}>
                          <span style={{ color:'#8A8A8A', fontSize:11, fontWeight:600, fontFamily:"'IBM Plex Mono', monospace", letterSpacing:'0.08em', textTransform:'uppercase' }}>Masa Toplamı</span>
                          <span style={{ color:'#C9A84C', fontWeight:700, fontSize:20, fontFamily:"'IBM Plex Mono', monospace" }}>₺ {formatTL(tabTotal)}</span>
                        </div>
                      )}

                      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                        <button onClick={() => openAddOrder(activeTableModal)} style={{ flex:1, height:48, background:'transparent', border:'1px solid #383838', borderRadius: 0, color:'#F0EDE8', fontSize:14, cursor:'pointer', fontWeight:600, fontFamily:"'IBM Plex Sans', sans-serif" }}>➕ Sipariş Ekle</button>
                      </div>
                      {activeOrders.length > 0 && (
                        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                          {filterOrdersByStation(activeOrders, 'kitchen').length > 0 && (
                            <button onClick={() => printKitchenTicket(activeTableModal, filterOrdersByStation(activeOrders, 'kitchen'), autoPrintEnabled)} style={{ flex:1, height:48, background:'transparent', border:'1px solid #383838', borderRadius: 0, color:'#f39c12', fontSize:14, cursor:'pointer', fontWeight:600, fontFamily:"'IBM Plex Sans', sans-serif" }}>🍳 Mutfak Fişi</button>
                          )}
                          {filterOrdersByStation(activeOrders, 'nargile').length > 0 && (
                            <button onClick={() => printKitchenTicket(activeTableModal, filterOrdersByStation(activeOrders, 'nargile'), autoPrintEnabled)} style={{ flex:1, height:48, background:'transparent', border:'1px solid #383838', borderRadius: 0, color:'#9b59b6', fontSize:14, cursor:'pointer', fontWeight:600, fontFamily:"'IBM Plex Sans', sans-serif" }}>💨 Nargile Fişi</button>
                          )}
                        </div>
                      )}

                      {info.tabData && (
                        <div style={{ display:'flex', gap:8 }}>
                          {!info.tabData.bill_requested ? (
                            <button onClick={() => requestBill(info.tabData.id)} style={{ flex:1, height:52, background:'rgba(52,152,219,.14)', border:'1px solid #3498db', borderRadius: 0, color:'#6FB9E8', fontSize:14, cursor:'pointer', fontWeight:600, fontFamily:"'IBM Plex Sans', sans-serif" }}>🧾 Hesap İstendi</button>
                          ) : (
                            <button onClick={() => cancelBillRequest(info.tabData.id)} title="Hesap isteğini iptal et" style={{ flex:1, height:52, background:'rgba(52,152,219,.14)', border:'1px solid #3498db', borderRadius: 0, color:'#6FB9E8', fontSize:14, cursor:'pointer', fontWeight:600, fontFamily:"'IBM Plex Sans', sans-serif" }}>✕ Hesap İsteğini İptal Et</button>
                          )}
                          {!isLimitedStaff && <button onClick={() => setShowTransferPicker(activeTableModal)} style={{ flex:1, height:52, background:'transparent', border:'1px solid #383838', borderRadius: 0, color:'#B5B0A8', fontSize:14, cursor:'pointer', fontWeight:600, fontFamily:"'IBM Plex Sans', sans-serif" }}>🔀 Taşı</button>}
                          {activeOrders.length > 0 && (
                            <button onClick={() => openPayment(info.tabData, tabTotal, activeOrders)} style={{ flex:1, height:56, background:'#C9A84C', border:'none', borderRadius: 0, color:'#0A0A0A', fontSize:15, cursor:'pointer', fontWeight:600, fontFamily:"'IBM Plex Sans', sans-serif" }}>💳 Ödeme Al</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Void item modal - mandatory reason, logged to voids table */}
            {voidingItem && (
              <VoidModal voidingItem={voidingItem} voidReason={voidReason} onReasonChange={setVoidReason} onCancel={() => setVoidingItem(null)} onConfirm={confirmVoid} />
            )}

            {/* Full order cancellation modal */}
            {cancellingOrder && (
              <CancelOrderModal order={cancellingOrder} cancelReason={cancelReason} onReasonChange={setCancelReason} onCancel={() => setCancellingOrder(null)} onConfirm={confirmCancelOrder} />
            )}

            {/* Transfer/merge destination picker */}
            {showTransferPicker && (
              <TransferPickerModal sourceTable={showTransferPicker} allTables={ALL_TABLES} getTableInfo={getTableInfo} onTransfer={transferOrMergeTab} onClose={() => setShowTransferPicker(null)} />
            )}

            {/* Staff order builder - punch in a walk-in/phone/verbal order */}
            {addOrderTable && (
              <div style={{ position:'fixed', inset:0, zIndex:210, background:'rgba(0,0,0,.92)', backdropFilter:'blur(6px)', display:'flex', flexDirection:'column' }}>
                <div style={{ padding:'16px 20px', borderBottom:'1px solid #2A2A2A', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ color:'#C9A84C', fontWeight:800, fontSize:15 }}>➕ {addOrderTable} — Sipariş Ekle</div>
                  <button onClick={() => { setAddOrderTable(null); setStaffCart({}) }} style={{ background:'#2A2A2A', border:'none', borderRadius: 0, width:30, height:30, color:'#8A8A8A', cursor:'pointer', fontSize:16 }}>✕</button>
                </div>

                <div style={{ display:'flex', gap:6, padding:'12px 16px', overflowX:'auto', borderBottom:'1px solid #2A2A2A' }}>
                  <button onClick={() => setStaffCategoryFilter(null)}
                    style={{ flexShrink:0, background: staffCategoryFilter===null ? 'rgba(201,168,76,.15)' : '#1A1A1A', border: staffCategoryFilter===null ? '1px solid rgba(201,168,76,.4)' : '1px solid #2A2A2A', borderRadius: 0, padding:'7px 14px', color: staffCategoryFilter===null ? '#C9A84C' : '#8A8A8A', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>Tümü</button>
                  {categories.map(cat => (
                    <button key={cat.id} onClick={() => setStaffCategoryFilter(cat.id)}
                      style={{ flexShrink:0, background: staffCategoryFilter===cat.id ? 'rgba(201,168,76,.15)' : '#1A1A1A', border: staffCategoryFilter===cat.id ? '1px solid rgba(201,168,76,.4)' : '1px solid #2A2A2A', borderRadius: 0, padding:'7px 14px', color: staffCategoryFilter===cat.id ? '#C9A84C' : '#8A8A8A', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>{cat.icon} {cat.name}</button>
                  ))}
                </div>

                <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))', gap:10 }}>
                    {items.filter(it => it.available && (staffCategoryFilter === null || it.category_id === staffCategoryFilter)).map(item => {
                      const withOptions = hasMenuOptions(item.id)
                      const qty = withOptions ? 0 : (staffCart[item.id] || 0)
                      return (
                        <div key={item.id} style={{ background:'#1A1A1A', border: qty>0 ? '1.5px solid rgba(201,168,76,.5)' : '1px solid #2A2A2A', borderRadius: 0, padding:'12px 10px', display:'flex', flexDirection:'column', gap:8 }}>
                          <div>
                            <div style={{ color:'#F0EDE8', fontSize:13, fontWeight:700, marginBottom:2 }}>{item.name}</div>
                            <div style={{ color:'#C9A84C', fontSize:12, fontWeight:700 }}>{item.price} ₺</div>
                          </div>
                          {qty === 0 ? (
                            <button onClick={() => withOptions ? openStaffOptionPicker(item) : adjustStaffCart(item.id, 1)} style={{ background:'rgba(201,168,76,.15)', border:'1px solid rgba(201,168,76,.4)', borderRadius: 0, padding:'8px', color:'#C9A84C', fontSize:13, fontWeight:800, cursor:'pointer' }}>+ Ekle</button>
                          ) : (
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'#0f0f0f', borderRadius: 0, padding:'4px 8px' }}>
                              <button onClick={() => adjustStaffCart(item.id, -1)} style={{ background:'#2A2A2A', border:'none', borderRadius: 0, width:28, height:28, color:'#fff', fontSize:16, cursor:'pointer', fontWeight:800 }}>−</button>
                              <span style={{ color:'#C9A84C', fontWeight:800, fontSize:14 }}>{qty}</span>
                              <button onClick={() => adjustStaffCart(item.id, 1)} style={{ background:'#C9A84C', border:'none', borderRadius: 0, width:28, height:28, color:'#141414', fontSize:16, cursor:'pointer', fontWeight:800 }}>+</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div style={{ padding:'14px 16px', borderTop:'1px solid #2A2A2A', display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ color:'#8A8A8A', fontSize:11, fontFamily:"'IBM Plex Mono', monospace" }}>{staffCartCount} ürün</div>
                    <div style={{ color:'#C9A84C', fontWeight:700, fontSize:20, fontFamily:"'IBM Plex Mono', monospace" }}>₺ {formatTL(staffCartTotal)}</div>
                  </div>
                  <button onClick={submitStaffOrder} disabled={staffCartCount===0 || !isOnline}
                    style={{ background: (staffCartCount===0 || !isOnline) ? '#2A2A2A' : '#27ae60', border:'none', borderRadius: 0, height:56, padding:'0 28px', color: (staffCartCount===0 || !isOnline) ? '#666' : '#fff', fontSize:16, fontWeight:600, fontFamily:"'IBM Plex Sans', sans-serif", cursor: (staffCartCount===0 || !isOnline) ? 'not-allowed' : 'pointer' }}>{isOnline ? 'Siparişi Gönder' : '🔴 Bağlantı Yok'}</button>
                </div>
              </div>
            )}

            {/* Staff option picker - choose variant (e.g. şeker oranı) before adding */}
            {staffPendingOptionItem && (
              <div style={{ position:'fixed', inset:0, zIndex:215, background:'rgba(0,0,0,.92)', backdropFilter:'blur(6px)', display:'flex', alignItems:'flex-end' }} onClick={() => setStaffPendingOptionItem(null)}>
                <div className="kahfe-modal" onClick={e=>e.stopPropagation()} style={{ width:'100%', margin:'0 auto', background:'#141414', border:'1px solid rgba(201,168,76,.3)', borderBottom:'none' }}>
                  <div style={{ padding:'20px', borderBottom:'1px solid #2A2A2A' }}>
                    <div style={{ color:'#F0EDE8', fontWeight:700, fontSize:17, fontFamily:"'Bricolage Grotesque', sans-serif" }}>{staffPendingOptionItem.name}</div>
                    <div style={{ color:'#8A8A8A', fontSize:12, marginTop:2 }}>Tercihinizi seçin</div>
                  </div>
                  <div style={{ padding:20 }}>
                    {(menuItemOptions[staffPendingOptionItem.id] || []).map((g: any) => (
                      <div key={g.id} style={{ marginBottom:18 }}>
                        <div style={{ color:'#C9A84C', fontSize:11, letterSpacing:'.08em', textTransform:'uppercase', fontWeight:700, marginBottom:10 }}>{g.name}</div>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                          {g.choices.map((c: any) => {
                            const active = staffPendingSelections[g.id] === c.id
                            return (
                              <button key={c.id} onClick={() => setStaffPendingSelections(prev => ({ ...prev, [g.id]: c.id }))}
                                style={{ borderRadius:999, padding:'10px 18px', fontSize:13.5, fontWeight:600, cursor:'pointer', fontFamily:"'IBM Plex Sans', sans-serif",
                                  background: active ? '#C9A84C' : 'transparent', color: active ? '#0A0A0A' : '#B5B0A8', border: active ? '1px solid #C9A84C' : '1px solid #383838' }}>
                                {c.name}{c.price_delta > 0 ? ` (+${c.price_delta}₺)` : ''}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                    <button onClick={confirmStaffAddWithOptions}
                      style={{ width:'100%', height:52, background:'#27ae60', border:'none', color:'#fff', fontWeight:600, fontSize:15, cursor:'pointer', fontFamily:"'IBM Plex Sans', sans-serif" }}>+ Sepete Ekle</button>
                  </div>
                </div>
              </div>
            )}

            {/* Payment modal - choose method, optionally split, close the tab */}
            {paymentTab && (() => {
              const selectedOrders = paymentTab.orders.filter((o: any) => selectedOrderIds.has(o.id))
              const baseTotal = settleMode === 'select' && selectedOrders.length > 0
                ? selectedOrders.reduce((s: number, o: any) => s + Number(o.total), 0)
                : paymentTab.total
              const discountAmount = computeDiscountAmount(baseTotal)
              const finalTotal = baseTotal - discountAmount
              const peopleCount = Math.max(1, parseInt(splitPeopleCount) || 1)
              const perPerson = finalTotal / peopleCount
              return (
              <div style={{ position:'fixed', inset:0, zIndex:220, background:'rgba(0,0,0,.92)', backdropFilter:'blur(6px)', display:'flex', alignItems:'flex-end' }} onClick={() => setPaymentTab(null)}>
                <div className="kahfe-modal" onClick={e=>e.stopPropagation()} style={{ width:'100%', margin:'0 auto', background:'#141414', borderRadius: 0, border:'1px solid rgba(39,174,96,.3)', borderBottom:'none' }}>
                  <div style={{ padding:'18px 20px', borderBottom:'1px solid #2A2A2A', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ color:'#27ae60', fontWeight:700, fontSize:17, fontFamily:"'Bricolage Grotesque', sans-serif" }}>💳 {paymentTab.table_name} — Ödeme Al</div>
                    <button onClick={() => setPaymentTab(null)} style={{ background:'#2A2A2A', border:'none', borderRadius: 0, width:36, height:36, color:'#8A8A8A', cursor:'pointer', fontSize:16 }}>✕</button>
                  </div>
                  <div style={{ padding:'20px' }}>
                    <div style={{ textAlign:'center', marginBottom:16 }}>
                      <div style={{ color:'#8A8A8A', fontSize:11, fontFamily:"'IBM Plex Mono', monospace", letterSpacing:'0.1em', textTransform:'uppercase' }}>{settleMode==='select' && selectedOrders.length>0 ? 'SEÇİLİ SİPARİŞLER TUTARI' : 'ÖDENECEK TUTAR'}</div>
                      {discountAmount > 0 && (
                        <div style={{ color:'#8A8A8A', fontSize:15, fontFamily:"'IBM Plex Mono', monospace", textDecoration:'line-through' }}>₺ {formatTL(baseTotal)}</div>
                      )}
                      <div style={{ color:'#C9A84C', fontWeight:700, fontSize:36, fontFamily:"'IBM Plex Mono', monospace" }}>₺ {formatTL(finalTotal)}</div>
                      {discountAmount > 0 && (
                        <div style={{ color:'#e74c3c', fontSize:13, fontFamily:"'IBM Plex Mono', monospace", marginTop:2 }}>-₺{formatTL(discountAmount)} indirim</div>
                      )}
                    </div>

                    {/* Equal-split calculator: quick reference only, doesn't change the actual bill */}
                    <div style={{ marginBottom:16, padding:12, background:'rgba(201,168,76,.06)', border:'1px solid rgba(201,168,76,.2)', display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ color:'#8A8A8A', fontSize:12, fontFamily:"'IBM Plex Sans', sans-serif", whiteSpace:'nowrap' }}>👥 Kaç kişi?</span>
                      <input type="number" min="1" value={splitPeopleCount} onChange={e => setSplitPeopleCount(e.target.value)}
                        style={{ width:56, height:36, background:'#0A0A0A', border:'1px solid #383838', color:'#F0EDE8', padding:'0 8px', fontSize:14, textAlign:'center', fontFamily:"'IBM Plex Mono', monospace" }} />
                      <span style={{ color:'#8A8A8A', fontSize:12, fontFamily:"'IBM Plex Sans', sans-serif" }}>kişi başı</span>
                      <span style={{ color:'#C9A84C', fontWeight:700, fontSize:16, fontFamily:"'IBM Plex Mono', monospace", marginLeft:'auto' }}>₺ {formatTL(perPerson)}</span>
                    </div>

                    {/* Settle mode: pay the whole tab, or select specific orders (e.g. one guest's rounds) */}
                    <div style={{ marginBottom:16 }}>
                      <div style={{ display:'flex', gap:8, marginBottom: settleMode==='select' ? 10 : 0 }}>
                        <button onClick={() => { setSettleMode('all'); setSelectedOrderIds(new Set()) }}
                          style={{ flex:1, height:40, background: settleMode==='all' ? 'rgba(39,174,96,.14)' : 'transparent', border: settleMode==='all' ? '1px solid #27ae60' : '1px solid #2A2A2A', color: settleMode==='all' ? '#5FD08C' : '#8A8A8A', fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:"'IBM Plex Sans', sans-serif" }}>
                          Tüm Hesap
                        </button>
                        <button onClick={() => setSettleMode('select')}
                          style={{ flex:1, height:40, background: settleMode==='select' ? 'rgba(39,174,96,.14)' : 'transparent', border: settleMode==='select' ? '1px solid #27ae60' : '1px solid #2A2A2A', color: settleMode==='select' ? '#5FD08C' : '#8A8A8A', fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:"'IBM Plex Sans', sans-serif" }}>
                          Belirli Siparişler
                        </button>
                      </div>
                      {settleMode === 'select' && (
                        <div style={{ border:'1px solid #2A2A2A' }}>
                          {paymentTab.orders.map((o: any) => (
                            <label key={o.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderBottom:'1px solid #2A2A2A', cursor:'pointer' }}>
                              <input type="checkbox" checked={selectedOrderIds.has(o.id)} onChange={() => toggleSelectedOrder(o.id)} style={{ width:18, height:18 }} />
                              <div style={{ flex:1 }}>
                                <div style={{ color:'#F0EDE8', fontSize:13 }}>{(o.items||[]).map((it:any)=>`${it.quantity}x ${it.name}`).join(', ')}</div>
                                <div style={{ color:'#8A8A8A', fontSize:11, fontFamily:"'IBM Plex Mono', monospace" }}>{new Date(o.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</div>
                              </div>
                              <span style={{ color:'#C9A84C', fontWeight:700, fontSize:14, fontFamily:"'IBM Plex Mono', monospace" }}>₺ {o.total}</span>
                            </label>
                          ))}
                          {paymentTab.orders.length === 0 && (
                            <div style={{ padding:14, color:'#8A8A8A', fontSize:13, textAlign:'center' }}>Bu masada aktif sipariş yok.</div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Discount — not available to limited staff */}
                    {!isLimitedStaff && (
                      <div style={{ marginBottom:16 }}>
                        <div style={{ display:'flex', gap:8, marginBottom: discountType !== 'none' ? 10 : 0 }}>
                          {(['none','percent','amount'] as const).map(d => (
                            <button key={d} onClick={() => { setDiscountType(d); if (d === 'none') setDiscountValue('') }}
                              style={{ flex:1, height:40, background: discountType===d ? 'rgba(201,168,76,.14)' : 'transparent', border: discountType===d ? '1px solid #C9A84C' : '1px solid #2A2A2A', color: discountType===d ? '#C9A84C' : '#8A8A8A', fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:"'IBM Plex Sans', sans-serif" }}>
                              {d==='none' ? 'İndirim Yok' : d==='percent' ? '% İndirim' : '₺ İndirim'}
                            </button>
                          ))}
                        </div>
                        {discountType !== 'none' && (
                          <div style={{ display:'flex', gap:8 }}>
                            <input type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)} placeholder={discountType==='percent' ? 'Örn. 10' : 'Örn. 50'}
                              style={{ width:90, height:48, background:'#0A0A0A', border:'1px solid #383838', color:'#F0EDE8', padding:'0 12px', fontSize:16, fontFamily:"'IBM Plex Mono', monospace" }} />
                            <input value={discountReason} onChange={e => setDiscountReason(e.target.value)} placeholder="İndirim nedeni (zorunlu)"
                              style={{ flex:1, height:48, background:'#0A0A0A', border:'1px solid #383838', color:'#F0EDE8', padding:'0 12px', fontSize:14, fontFamily:"'IBM Plex Sans', sans-serif" }} />
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8, marginBottom:16 }}>
                      {(isLimitedStaff ? (['cash','card','transfer','mixed'] as const) : (['cash','card','transfer','mixed','debt'] as const)).map(m => (
                        <button key={m} onClick={() => setPaymentMethod(m)}
                          style={{ height:72, background: paymentMethod===m ? 'rgba(39,174,96,.14)' : 'transparent', border: paymentMethod===m ? '1px solid #27ae60' : '1px solid #2A2A2A', borderRadius: 0, color: paymentMethod===m ? '#5FD08C' : '#B5B0A8', fontWeight:600, fontSize:13, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4 }}>
                          <span style={{ fontSize:20 }}>{m==='cash' ? '💵' : m==='card' ? '💳' : m==='transfer' ? '🏦' : m==='mixed' ? '🔀' : '🧾'}</span>
                          {m==='cash' ? 'Nakit' : m==='card' ? 'Kart' : m==='transfer' ? 'Havale' : m==='mixed' ? 'Böl' : 'Borç'}
                        </button>
                      ))}
                    </div>

                    {paymentMethod === 'mixed' && (
                      <div style={{ display:'flex', gap:10, marginBottom:16 }}>
                        <div style={{ flex:1 }}>
                          <label style={{ color:'#8A8A8A', fontSize:11, display:'block', marginBottom:6, fontFamily:"'IBM Plex Mono', monospace", letterSpacing:'0.08em' }}>NAKİT (₺)</label>
                          <input type="number" value={splitCash} onChange={e => setSplitCash(e.target.value)}
                            style={{ width:'100%', height:52, background:'#0A0A0A', border:'1px solid #383838', borderRadius: 0, padding:'0 14px', color:'#F0EDE8', fontSize:17, fontFamily:"'IBM Plex Mono', monospace" }} />
                        </div>
                        <div style={{ flex:1 }}>
                          <label style={{ color:'#8A8A8A', fontSize:11, display:'block', marginBottom:6, fontFamily:"'IBM Plex Mono', monospace", letterSpacing:'0.08em' }}>KART (₺)</label>
                          <input type="number" value={splitCard} onChange={e => setSplitCard(e.target.value)}
                            style={{ width:'100%', height:52, background:'#0A0A0A', border:'1px solid #383838', borderRadius: 0, padding:'0 14px', color:'#F0EDE8', fontSize:17, fontFamily:"'IBM Plex Mono', monospace" }} />
                        </div>
                      </div>
                    )}

                    {paymentMethod === 'debt' && (
                      <div style={{ marginBottom:16, padding:14, background:'rgba(201,168,76,.06)', border:'1px solid rgba(201,168,76,.2)' }}>
                        <label style={{ color:'#8A8A8A', fontSize:11, display:'block', marginBottom:8, fontFamily:"'IBM Plex Mono', monospace", letterSpacing:'0.08em' }}>BORÇLU SEÇ</label>
                        <select value={selectedDebtorId} onChange={e => { setSelectedDebtorId(e.target.value); if (e.target.value) { setNewDebtorName(''); setNewDebtorPhone('') } }}
                          style={{ width:'100%', height:48, background:'#0A0A0A', border:'1px solid #383838', color:'#F0EDE8', padding:'0 12px', fontSize:14, marginBottom:10, fontFamily:"'IBM Plex Sans', sans-serif" }}>
                          <option value="">— Seçiniz veya yeni ekleyin —</option>
                          {debtors.map(d => <option key={d.id} value={d.id}>{d.name}{d.phone ? ` (${d.phone})` : ''}</option>)}
                        </select>
                        {!selectedDebtorId && (
                          <div style={{ display:'flex', gap:8 }}>
                            <input value={newDebtorName} onChange={e => setNewDebtorName(e.target.value)} placeholder="Yeni borçlu adı"
                              style={{ flex:1, height:48, background:'#0A0A0A', border:'1px solid #383838', color:'#F0EDE8', padding:'0 12px', fontSize:14, fontFamily:"'IBM Plex Sans', sans-serif" }} />
                            <input value={newDebtorPhone} onChange={e => setNewDebtorPhone(e.target.value)} placeholder="Telefon (opsiyonel)"
                              style={{ flex:1, height:48, background:'#0A0A0A', border:'1px solid #383838', color:'#F0EDE8', padding:'0 12px', fontSize:14, fontFamily:"'IBM Plex Sans', sans-serif" }} />
                          </div>
                        )}
                      </div>
                    )}

                    {canPrint && (
                      <button onClick={() => printReceipt({ table_name: paymentTab.table_name, total: finalTotal, cash: paymentMethod==='cash'?finalTotal:(parseFloat(splitCash)||0), card: paymentMethod==='card'?finalTotal:(parseFloat(splitCard)||0), transfer: paymentMethod==='transfer'?finalTotal:0, method: paymentMethod, orders: settleMode==='select' && selectedOrders.length>0 ? selectedOrders : paymentTab.orders, discountAmount, discountReason, originalTotal: baseTotal }, autoPrintEnabled)}
                        style={{ width:'100%', height:48, background:'transparent', border:'1px solid #383838', borderRadius: 0, color:'#C9A84C', fontSize:14, cursor:'pointer', fontWeight:600, marginBottom:10 }}>🧾 Fişi Yazdır (Kapatmadan)</button>
                    )}

                    <button onClick={settleMode==='select' ? confirmPartialPayment : confirmPayment} disabled={!isOnline || (settleMode==='select' && selectedOrders.length===0)}
                      style={{ width:'100%', height:56, background: isOnline ? '#27ae60' : '#2A2A2A', border:'none', borderRadius: 0, color: isOnline ? '#fff' : '#666', fontSize:16, cursor: isOnline ? 'pointer' : 'not-allowed', fontWeight:600, fontFamily:"'IBM Plex Sans', sans-serif" }}>
                      {!isOnline ? '🔴 Bağlantı Yok' : settleMode==='select' ? '✓ Seçili Siparişleri Öde ve Yazdır' : '✓ Ödemeyi Onayla ve Masayı Kapat'}
                    </button>
                  </div>
                </div>
              </div>
              )
            })()}

            {/* View toggle - table map vs flat list, both roles see this */}
            <div style={{ display:'flex', gap:6, marginBottom:14 }}>
              <button onClick={() => setViewMode('map')}
                style={{ flex:1, height:48, background: viewMode==='map' ? 'rgba(201,168,76,.14)' : 'transparent', border: viewMode==='map' ? '1px solid #C9A84C' : '1px solid #2A2A2A', borderRadius: 0, color: viewMode==='map' ? '#C9A84C' : '#8A8A8A', fontWeight:600, fontSize:14, cursor:'pointer', fontFamily:"'IBM Plex Sans', sans-serif" }}>🗺️ Masa Haritası</button>
              <button onClick={() => setViewMode('list')}
                style={{ flex:1, height:48, background: viewMode==='list' ? 'rgba(201,168,76,.14)' : 'transparent', border: viewMode==='list' ? '1px solid #C9A84C' : '1px solid #2A2A2A', borderRadius: 0, color: viewMode==='list' ? '#C9A84C' : '#8A8A8A', fontWeight:600, fontSize:14, cursor:'pointer', fontFamily:"'IBM Plex Sans', sans-serif" }}>📋 Liste</button>
              <button onClick={() => setViewMode('floor')}
                style={{ flex:1, height:48, background: viewMode==='floor' ? 'rgba(201,168,76,.14)' : 'transparent', border: viewMode==='floor' ? '1px solid #C9A84C' : '1px solid #2A2A2A', borderRadius: 0, color: viewMode==='floor' ? '#C9A84C' : '#8A8A8A', fontWeight:600, fontSize:14, cursor:'pointer', fontFamily:"'IBM Plex Sans', sans-serif" }}>📐 Kat Planı</button>
            </div>

            {viewMode === 'map' && (
              <div style={{ marginBottom: 20 }}>
                {/* Legend */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginBottom:16, fontSize:11, color:'#8A8A8A', fontFamily:"'IBM Plex Mono', monospace" }}>
                  <span>🔴 Sipariş Bekliyor</span>
                  <span>🔵 Hesap İstendi</span>
                  <span>🟡 Dolu</span>
                  <span>⚪ Boş</span>
                </div>
                {[
                  { label: 'MASALAR', tables: ALL_TABLES.filter(t => t.startsWith('MASA')) },
                  { label: 'KİTAPLIK', tables: ALL_TABLES.filter(t => t.startsWith('KİTAPLIK')) },
                  { label: 'OKEY', tables: ALL_TABLES.filter(t => t.startsWith('OKEY')) },
                  { label: 'KAHFE', tables: ALL_TABLES.filter(t => t.startsWith('KAHFE')) },
                  { label: 'VİP', tables: ALL_TABLES.filter(t => t.startsWith('VİP')) },
                ].map(group => (
                  <div key={group.label} style={{ marginBottom: 18 }}>
                    <div style={{ color:'#8A8A8A', fontSize:11, letterSpacing:'0.14em', marginBottom:8, fontWeight:600, fontFamily:"'IBM Plex Mono', monospace" }}>{group.label}</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(96px, 140px))', gap:10 }}>
                      {group.tables.map(tableName => {
                        const info = getTableInfo(tableName)
                        const palette: Record<string, { bg:string, border:string, topAccent:string, text:string, labelText:string, label:string }> = {
                          empty:     { bg:'#161616', border:'#2A2A2A', topAccent:'transparent', text:'#8A8A8A', labelText:'#6E6E6E', label:'Boş' },
                          occupied:  { bg:'#221E12', border:'rgba(201,168,76,.5)', topAccent:'#C9A84C', text:'#F0EDE8', labelText:'#C9A84C', label:'Dolu' },
                          pending:   { bg:'#241413', border:'rgba(192,57,43,.55)', topAccent:'#C0392B', text:'#F0EDE8', labelText:'#E8756A', label:'Bekliyor' },
                          bill:      { bg:'#12202A', border:'rgba(52,152,219,.55)', topAccent:'#3498DB', text:'#F0EDE8', labelText:'#6FB9E8', label:'Hesap' },
                        }
                        const p = palette[info.status]
                        const itemCount = info.orders.reduce((s:number,o:any)=>s + (o.status!=='dismissed' ? 1 : 0), 0)
                        const openedMinutesAgo = info.status !== 'empty' && info.tabData?.opened_at ? minutesSince(info.tabData.opened_at) : null
                        return (
                          <button key={tableName} onClick={() => setActiveTableModal(tableName)}
                            style={{ background:p.bg, border:`1px solid ${p.border}`, borderTop:`3px solid ${p.topAccent}`, borderRadius: 0, padding:'12px 10px', cursor:'pointer', textAlign:'left', minHeight:72, display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
                            <div style={{ color:p.text, fontWeight:700, fontSize:16, fontFamily:"'Bricolage Grotesque', sans-serif" }}>{tableName.replace('-', ' ')}</div>
                            <div style={{ color:p.labelText, fontSize:10, fontFamily:"'IBM Plex Mono', monospace", letterSpacing:'0.08em', textTransform:'uppercase', marginTop:6 }}>
                              {p.label}{info.status !== 'empty' && itemCount > 0 ? ` · ${itemCount}` : ''}{openedMinutesAgo !== null ? ` · ${openedMinutesAgo} dk` : ''}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {viewMode === 'floor' && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginBottom:12, fontSize:11, color:'#8A8A8A', fontFamily:"'IBM Plex Mono', monospace" }}>
                  <span>🔴 Sipariş Bekliyor</span>
                  <span>🔵 Hesap İstendi</span>
                  <span>🟡 Dolu</span>
                  <span>⚪ Boş</span>
                </div>
                {isManager && (
                  <button onClick={() => setFloorEditMode(v => !v)}
                    style={{ marginBottom: 12, height: 44, padding: '0 16px', background: floorEditMode ? 'rgba(39,174,96,.14)' : 'transparent', border: floorEditMode ? '1px solid #27ae60' : '1px solid #383838', color: floorEditMode ? '#5FD08C' : '#C9A84C', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif" }}>
                    {floorEditMode ? '✓ Bitti' : '✏️ Düzeni Düzenle'}
                  </button>
                )}
                {floorEditMode && (
                  <div style={{ color: '#8A8A8A', fontSize: 12, marginBottom: 12 }}>Masaları sürükleyerek gerçek oturma düzeninizi oluşturun. Konumlar otomatik kaydedilir.</div>
                )}
                <div style={{ position: 'relative', width: '100%', overflow: 'auto', border: '1px solid #2A2A2A', background: '#0F0F0F' }}>
                  <div style={{ position: 'relative', width: floorCanvasWidth, height: floorCanvasHeight }}>
                    {ALL_TABLES.map(tableName => {
                      const info = getTableInfo(tableName)
                      const palette: Record<string, { bg:string, border:string, text:string, labelText:string, label:string }> = {
                        empty:     { bg:'#161616', border:'#2A2A2A', text:'#8A8A8A', labelText:'#6E6E6E', label:'Boş' },
                        occupied:  { bg:'#221E12', border:'rgba(201,168,76,.6)', text:'#F0EDE8', labelText:'#C9A84C', label:'Dolu' },
                        pending:   { bg:'#241413', border:'rgba(192,57,43,.65)', text:'#F0EDE8', labelText:'#E8756A', label:'Bekliyor' },
                        bill:      { bg:'#12202A', border:'rgba(52,152,219,.65)', text:'#F0EDE8', labelText:'#6FB9E8', label:'Hesap' },
                      }
                      const p = palette[info.status]
                      const itemCount = info.orders.reduce((s:number,o:any)=>s + (o.status!=='dismissed' ? 1 : 0), 0)
                      const openedMinutesAgo = info.status !== 'empty' && info.tabData?.opened_at ? minutesSince(info.tabData.opened_at) : null
                      const pos = dragPreview?.table === tableName ? dragPreview : getTablePosition(tableName)
                      const isDragging = dragPreview?.table === tableName
                      return (
                        <div key={tableName}
                          onPointerDown={e => handleFloorPointerDown(e, tableName)}
                          onPointerMove={handleFloorPointerMove}
                          onPointerUp={handleFloorPointerUp}
                          onClick={() => { if (!floorEditMode) setActiveTableModal(tableName) }}
                          style={{ position:'absolute', left:pos.x, top:pos.y, width:FLOOR_TILE, height:FLOOR_TILE, background:p.bg, border:`2px solid ${p.border}`, borderRadius:12, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:6, cursor: floorEditMode ? 'grab' : 'pointer', userSelect:'none', touchAction:'none', zIndex: isDragging ? 10 : 1, boxShadow: isDragging ? '0 8px 20px rgba(0,0,0,.5)' : 'none' }}>
                          <div style={{ color:p.text, fontWeight:700, fontSize:13, fontFamily:"'Bricolage Grotesque', sans-serif" }}>{tableName.replace('-', ' ')}</div>
                          <div style={{ color:p.labelText, fontSize:9, fontFamily:"'IBM Plex Mono', monospace", letterSpacing:'0.05em', textTransform:'uppercase', marginTop:4 }}>
                            {p.label}{itemCount > 0 ? ` · ${itemCount}` : ''}{openedMinutesAgo !== null ? ` · ${openedMinutesAgo}dk` : ''}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {viewMode === 'list' && (<>
            {/* Date filter - week/month view is manager-only */}
            {isManager && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display:'flex', gap:6, marginBottom: dateFilter === 'custom' ? 10 : 0 }}>
                  {(['today','week','month','custom'] as const).map(f => (
                    <button key={f} onClick={() => { setDateFilter(f); if (f !== 'custom') loadOrders(f) }}
                      style={{ flex:1, height:44, background: dateFilter===f ? 'rgba(201,168,76,.14)' : 'transparent', border: dateFilter===f ? '1px solid #C9A84C' : '1px solid #2A2A2A', borderRadius: 0, color: dateFilter===f ? '#C9A84C' : '#8A8A8A', fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:"'IBM Plex Sans', sans-serif" }}>
                      {f==='today'?'Bugün':f==='week'?'Bu Hafta':f==='month'?'Bu Ay':'Özel'}
                    </button>
                  ))}
                </div>
                {dateFilter === 'custom' && (
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                      style={{ flex:1, height:44, background:'#1A1A1A', border:'1px solid #2A2A2A', color:'#F0EDE8', padding:'0 10px', fontSize:13, fontFamily:"'IBM Plex Mono', monospace" }} />
                    <span style={{ color:'#8A8A8A', fontSize:12 }}>—</span>
                    <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                      style={{ flex:1, height:44, background:'#1A1A1A', border:'1px solid #2A2A2A', color:'#F0EDE8', padding:'0 10px', fontSize:13, fontFamily:"'IBM Plex Mono', monospace" }} />
                    <button onClick={() => loadOrders('custom')} disabled={!customFrom}
                      style={{ height:44, padding:'0 16px', background: customFrom ? '#C9A84C' : '#2A2A2A', border:'none', color: customFrom ? '#0A0A0A' : '#666', fontWeight:600, fontSize:13, cursor: customFrom ? 'pointer' : 'not-allowed', fontFamily:"'IBM Plex Sans', sans-serif" }}>Uygula</button>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <input value={orderSearchQuery} onChange={e => setOrderSearchQuery(e.target.value)} placeholder="🔍 Masa veya ürün adına göre ara..."
                style={{ width:'100%', height:44, background:'#1A1A1A', border:'1px solid #2A2A2A', color:'#F0EDE8', padding:'0 14px', fontSize:14, outline:'none', fontFamily:"'IBM Plex Sans', sans-serif" }} />
            </div>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, gap:8, flexWrap:'wrap' }}>
              <div style={{ color:'#8A8A8A', fontSize:12, letterSpacing:'0.08em', fontFamily:"'IBM Plex Mono', monospace" }}>{allOrders.length} SİPARİŞ</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <button onClick={() => loadOrders()} style={{ background:'transparent', border:'1px solid #383838', borderRadius: 0, height:36, width:36, color:'#C9A84C', fontSize:14, cursor:'pointer', fontWeight:600 }}>↻</button>
                {isManager && (
                  <>
                    {dateFilter !== 'custom' && (
                      <button onClick={() => resetStats(dateFilter as 'today'|'week'|'month')} style={{ background:'transparent', border:'1px solid #383838', borderRadius: 0, height:36, padding:'0 12px', color:'#8A8A8A', fontSize:12, cursor:'pointer', fontWeight:600, fontFamily:"'IBM Plex Sans', sans-serif" }}>Sıfırla</button>
                    )}
                    <button onClick={() => exportOrdersPDF(dateFilter, allOrders, revenueSummary)} style={{ background:'transparent', border:'1px solid #383838', borderRadius: 0, height:36, padding:'0 12px', color:'#C9A84C', fontSize:12, cursor:'pointer', fontWeight:600, fontFamily:"'IBM Plex Mono', monospace" }}>PDF</button>
                    <div style={{ position:'relative' }}>
                      <button onClick={() => setShowReportPicker(v => !v)} style={{ background:'rgba(201,168,76,.14)', border:'1px solid rgba(201,168,76,.4)', borderRadius: 0, height:36, padding:'0 12px', color:'#C9A84C', fontSize:12, cursor:'pointer', fontWeight:600, fontFamily:"'IBM Plex Sans', sans-serif" }}>📊 Rapor</button>
                      {showReportPicker && (
                        <>
                          <div onClick={() => setShowReportPicker(false)} style={{ position:'fixed', inset:0, zIndex:299 }} />
                          <div style={{ position:'absolute', top:40, left:0, zIndex:300, background:'#1A1A1A', border:'1px solid #383838', minWidth:140, boxShadow:'0 8px 24px rgba(0,0,0,.5)' }}>
                            {([['week','📅 Haftalık'],['month','🗓️ Aylık'],['year','📈 Yıllık']] as const).map(([period, label]) => (
                              <button key={period} onClick={() => generatePeriodReport(period)}
                                style={{ display:'block', width:'100%', textAlign:'left', background:'transparent', border:'none', borderBottom:'1px solid #2A2A2A', padding:'12px 14px', color:'#F0EDE8', fontSize:13, cursor:'pointer', fontFamily:"'IBM Plex Sans', sans-serif" }}>
                                {label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    <button onClick={openDayClose} style={{ background:'rgba(52,152,219,.14)', border:'1px solid rgba(52,152,219,.4)', borderRadius: 0, height:36, padding:'0 12px', color:'#3498db', fontSize:12, cursor:'pointer', fontWeight:600, fontFamily:"'IBM Plex Sans', sans-serif" }}>🌙 Gün Sonu</button>
                    <button onClick={() => openStaffReport(dateFilter === 'custom' ? 'today' : dateFilter)} style={{ background:'rgba(201,168,76,.14)', border:'1px solid rgba(201,168,76,.4)', borderRadius: 0, height:36, padding:'0 12px', color:'#C9A84C', fontSize:12, cursor:'pointer', fontWeight:600, fontFamily:"'IBM Plex Sans', sans-serif" }}>👤 Personel</button>
                    <button onClick={() => openItemReport('today')} style={{ background:'rgba(201,168,76,.14)', border:'1px solid rgba(201,168,76,.4)', borderRadius: 0, height:36, padding:'0 12px', color:'#C9A84C', fontSize:12, cursor:'pointer', fontWeight:600, fontFamily:"'IBM Plex Sans', sans-serif" }}>📦 Ürün Raporu</button>
                  </>
                )}
              </div>
            </div>

            {/* Summary bar - revenue stats, managers only */}
            {isManager && allOrders.length > 0 && (
              <div style={{ background:'#1A1A1A', border:'1px solid rgba(201,168,76,.2)', borderRadius: 0, padding:'16px', marginBottom:16, display:'flex', justifyContent:'space-around' }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ color:'#C9A84C', fontWeight:700, fontSize:22, fontFamily:"'IBM Plex Mono', monospace" }}>{allOrders.length}</div>
                  <div style={{ color:'#8A8A8A', fontSize:11, fontFamily:"'IBM Plex Mono', monospace", letterSpacing:'0.05em', textTransform:'uppercase', marginTop:4 }}>Toplam Sipariş</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ color:'#C9A84C', fontWeight:700, fontSize:22, fontFamily:"'IBM Plex Mono', monospace" }}>{allOrders.filter(o=>o.status==='pending').length}</div>
                  <div style={{ color:'#8A8A8A', fontSize:11, fontFamily:"'IBM Plex Mono', monospace", letterSpacing:'0.05em', textTransform:'uppercase', marginTop:4 }}>Bekliyor</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ color:'#C9A84C', fontWeight:700, fontSize:22, fontFamily:"'IBM Plex Mono', monospace" }}>₺ {formatTL(revenueSummary.revenue)}</div>
                  <div style={{ color:'#8A8A8A', fontSize:11, fontFamily:"'IBM Plex Mono', monospace", letterSpacing:'0.05em', textTransform:'uppercase', marginTop:4 }}>Ciro (Tahsil Edilen)</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ color:'#e74c3c', fontWeight:700, fontSize:22, fontFamily:"'IBM Plex Mono', monospace" }}>₺ {formatTL(revenueSummary.debt)}</div>
                  <div style={{ color:'#8A8A8A', fontSize:11, fontFamily:"'IBM Plex Mono', monospace", letterSpacing:'0.05em', textTransform:'uppercase', marginTop:4 }}>Borç (Tahsil Edilmeyen)</div>
                </div>
              </div>
            )}

            {ordersLoading && <div style={{ textAlign:'center', color:'#8A8A8A', padding:40 }}>Yükleniyor...</div>}

            {!ordersLoading && allOrders.length === 0 && (
              <div style={{ textAlign:'center', color:'#8A8A8A', padding:40 }}>Bugün henüz sipariş yok</div>
            )}

            {allOrders.filter((order: any) => {
              const q = orderSearchQuery.trim().toLowerCase()
              if (!q) return true
              const tableMatch = order.table_name?.toLowerCase().includes(q)
              const itemMatch = (order.items || []).some((it: any) => it.name?.toLowerCase().includes(q))
              return tableMatch || itemMatch
            }).map((order:any) => {
              const statusColor = order.status==='pending'?'#C0392B':order.status==='dismissed'?'#8A8A8A':'#27ae60'
              const statusLabel = order.status==='pending'?'Bekliyor':order.status==='dismissed'?'Reddedildi':'Tamamlandı'
              return (
                <div key={order.id} style={{ background:'#1A1A1A', border:'1px solid #2A2A2A', borderLeft:`3px solid ${statusColor}`, borderRadius: 0, padding:'16px 18px', marginBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ background:statusColor, color:'#fff', borderRadius: 0, padding:'4px 10px', fontSize:11, fontWeight:700, fontFamily:"'IBM Plex Mono', monospace", letterSpacing:'0.05em', textTransform:'uppercase' }}>{statusLabel}</span>
                      <span style={{ color:'#F0EDE8', fontWeight:700, fontSize:18, fontFamily:"'Bricolage Grotesque', sans-serif" }}>{order.table_name.replace('-', ' ')}</span>
                    </div>
                    <span style={{ color:'#8A8A8A', fontSize:12, fontFamily:"'IBM Plex Mono', monospace" }}>{new Date(order.created_at).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'})}</span>
                  </div>

                  {order.items?.map((item:any, i:number) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:15, color:'#F0EDE8', padding:'4px 0', borderBottom:'1px solid rgba(240,237,232,.05)' }}>
                      <span><span style={{ color:'#C9A84C', fontFamily:"'IBM Plex Mono', monospace" }}>{item.quantity}×</span> {item.name}</span>
                      <span style={{ color:'#B5B0A8', fontFamily:"'IBM Plex Mono', monospace" }}>{item.subtotal} ₺</span>
                    </div>
                  ))}

                  {order.note && (
                    <div style={{ marginTop:8, padding:'8px 10px', background:'rgba(201,168,76,.06)', border:'1px solid rgba(201,168,76,.15)', borderRadius: 0, fontSize:12, color:'rgba(240,237,232,.7)' }}>
                      📝 {order.note}
                    </div>
                  )}

                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:12, paddingTop:10, borderTop:'1px solid #2A2A2A' }}>
                    <span style={{ color:'#8A8A8A', fontWeight:600, fontSize:11, fontFamily:"'IBM Plex Mono', monospace", letterSpacing:'0.08em', textTransform:'uppercase' }}>Toplam</span>
                    <span style={{ color:'#C9A84C', fontWeight:700, fontSize:20, fontFamily:"'IBM Plex Mono', monospace" }}>₺ {order.total}</span>
                  </div>
                  {order.status === 'pending' && (
                    <div style={{ display:'flex', gap:8, marginTop:12 }}>
                      {!isLimitedStaff && (
                        <button onClick={() => openCancelOrder(order)} title="Siparişi iptal et"
                          style={{ width:56, background:'transparent', border:'1px solid #383838', borderRadius: 0, color:'#e74c3c', fontSize:18, cursor:'pointer' }}>🚫</button>
                      )}
                      <button onClick={() => updateOrderStatus(order.id, 'served')} disabled={!isOnline}
                        style={{ flex:1, background: isOnline ? '#27ae60' : '#2A2A2A', border:'none', borderRadius: 0, padding:0, height:48, color: isOnline ? '#fff' : '#666', fontSize:15, cursor: isOnline ? 'pointer' : 'not-allowed', fontWeight:600, fontFamily:"'IBM Plex Sans', sans-serif" }}>{isOnline ? '✓ Tamamlandı' : '🔴 Bağlantı Yok'}</button>
                    </div>
                  )}
                </div>
              )
            })}
            </>)}
          </div>
        )}

        {isManager && tab === 'categories' && (
          <div className="kahfe-section" style={s.section}>
            <div style={{ background: '#1A1A1A', borderRadius: 0, padding: 16, border: '1px solid #2A2A2A', marginBottom: 20 }}>
              <div style={{ color: '#C9A84C', fontSize: 11, letterSpacing: 2, fontWeight: 700, marginBottom: 14 }}>{editingCat ? 'KATEGORİ DÜZENLE' : 'YENİ KATEGORİ EKLE'}</div>
              <label style={s.label}>KATEGORİ ADI *</label>
              <input value={catName} onChange={e => setCatName(e.target.value)} style={{ ...s.input, marginBottom: 12 }} placeholder="örn. Kahveler" />
              <label style={s.label}>EMOJİ / İKON (opsiyonel)</label>
              <input value={catIcon} onChange={e => setCatIcon(e.target.value)} style={{ ...s.input, marginBottom: 16 }} placeholder="örn. ☕" />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveCategory} disabled={loading} style={{ ...s.btn, flex: 1 }}>{loading ? 'Kaydediliyor...' : editingCat ? 'Güncelle' : 'Ekle'}</button>
                {editingCat && <button onClick={() => { setEditingCat(null); setCatName(''); setCatIcon('') }} style={s.btnSecondary}>İptal</button>}
              </div>
            </div>
            <div style={{ color: '#8A8A8A', fontSize: 12, marginBottom: 12, letterSpacing: 1 }}>MEVCUT KATEGORİLER ({categories.length}) — ⠿ Sürükle ile sırala</div>
            {categories.map((cat, idx) => (
              <div key={cat.id}
                draggable
                onDragStart={e => { e.dataTransfer.setData('text/plain', String(idx)); (e.currentTarget as HTMLElement).style.opacity='0.4' }}
                onDragEnd={e => { (e.currentTarget as HTMLElement).style.opacity='1' }}
                onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor='#C9A84C' }}
                onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor='#2A2A2A' }}
                onDrop={async e => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).style.borderColor='#2A2A2A'
                  const fromIdx = parseInt(e.dataTransfer.getData('text/plain'))
                  if (fromIdx === idx) return
                  const reordered = [...categories]
                  const [moved] = reordered.splice(fromIdx, 1)
                  reordered.splice(idx, 0, moved)
                  await Promise.all(reordered.map((c, i) => supabase.from('categories').update({ order_index: i }).eq('id', c.id)))
                  showMsg('Sıralama güncellendi ✓')
                  await loadData()
                }}
                style={{ ...s.card, cursor: 'grab', transition: 'border-color .2s, opacity .2s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ color: '#555', fontSize: 18, cursor: 'grab', userSelect: 'none' }}>⠿</span>
                    {cat.icon && <span style={{ fontSize: 22 }}>{cat.icon}</span>}
                    <div>
                      <div style={{ color: '#F0EDE8', fontWeight: 700 }}>{cat.name}</div>
                      <div style={{ color: '#8A8A8A', fontSize: 12 }}>{items.filter(i => i.category_id === cat.id).length} ürün · #{idx + 1}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setEditingCat(cat); setCatName(cat.name); setCatIcon(cat.icon || '') }} style={{ background: '#2A2A2A', border: 'none', borderRadius: 0, padding: '6px 12px', color: '#C9A84C', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Düzenle</button>
                    <button onClick={() => deleteCategory(cat.id)} style={{ background: '#2A2A2A', border: 'none', borderRadius: 0, padding: '6px 12px', color: '#C0392B', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Sil</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ITEMS */}
        {isManager && tab === 'items' && (
          <div className="kahfe-section" style={s.section}>
            <div style={{ background: '#1A1A1A', borderRadius: 0, padding: 16, border: '1px solid #2A2A2A', marginBottom: 20 }}>
              <div style={{ color: '#C9A84C', fontSize: 11, letterSpacing: 2, fontWeight: 700, marginBottom: 14 }}>{editingItem ? 'ÜRÜN DÜZENLE' : 'YENİ ÜRÜN EKLE'}</div>

              <label style={s.label}>ÜRÜN ADI *</label>
              <input value={itemName} onChange={e => setItemName(e.target.value)} style={{ ...s.input, marginBottom: 12 }} placeholder="örn. Türk Kahvesi" />

              <label style={s.label}>AÇIKLAMA</label>
              <textarea value={itemDesc} onChange={e => setItemDesc(e.target.value)} style={{ ...s.input, marginBottom: 12, minHeight: 70, resize: 'vertical' } as React.CSSProperties} placeholder="Kısa açıklama..." />

              <label style={s.label}>FİYAT (₺) *</label>
              <input type="number" value={itemPrice} onChange={e => setItemPrice(e.target.value)} style={{ ...s.input, marginBottom: 12 }} placeholder="0.00" />

              <label style={s.label}>KATEGORİ *</label>
              <select value={itemCat} onChange={e => setItemCat(e.target.value)} style={{ ...s.input, marginBottom: 12 }}>
                <option value="">Kategori seçin...</option>
                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>)}
              </select>

              <label style={s.label}>FOTOĞRAF</label>
              <input type="file" accept="image/*" onChange={handleFileChange} style={{ ...s.input, marginBottom: 12, padding: '10px 14px' }} />

              {/* Preview */}
              {croppedPreview ? (
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <img src={croppedPreview} alt="önizleme" style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 0, border: '2px solid #C9A84C' }} />
                  <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
                    {rawImageSrc && <button onClick={() => setShowCropper(true)} style={{ background: '#C9A84C', border: 'none', borderRadius: 0, padding: '6px 10px', color: '#1A0E06', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>✂️ Düzenle</button>}
                    <button onClick={() => { setCroppedPreview(''); setCroppedBlob(null); setExistingImageUrl('') }} style={{ background: '#C0392B', border: 'none', borderRadius: 0, padding: '6px 10px', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>✕ Sil</button>
                  </div>
                  <div style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(0,0,0,0.7)', borderRadius: 0, padding: '4px 8px', fontSize: 10, color: '#C9A84C' }}>
                    {croppedBlob ? '✓ Kırpıldı' : '📷 Mevcut fotoğraf'}
                  </div>
                </div>
              ) : null}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <input type="checkbox" id="avail" checked={itemAvail} onChange={e => setItemAvail(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#C0392B' }} />
                <label htmlFor="avail" style={{ color: '#F0EDE8', fontSize: 14, cursor: 'pointer' }}>Satışta (aktif)</label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, background: itemRec ? 'rgba(201,168,76,.08)' : 'transparent', border: itemRec ? '1px solid rgba(201,168,76,.3)' : '1px solid #2A2A2A', borderRadius: 0, padding: '10px 12px' }}>
                <input type="checkbox" id="rec" checked={itemRec} onChange={e => setItemRec(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#C9A84C' }} />
                <label htmlFor="rec" style={{ color: '#C9A84C', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>⭐ Öne Çıkan (Önerilen)</label>
              </div>

              {editingItem && (
                <div style={{ marginBottom: 16, border: '1px solid #2A2A2A', padding: 14 }}>
                  <div style={{ color: '#C9A84C', fontSize: 11, letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>SEÇENEKLER</div>
                  <div style={{ color: '#8A8A8A', fontSize: 12, marginBottom: 12 }}>Örn. "Şeker Oranı" grubu → Sade, Az Şekerli, Orta Şekerli, Şekerli seçenekleri. Müşteri sipariş verirken bir tanesini seçmek zorunda kalır. İngilizce/Arapça alanlarını doldurursanız, menüde o dile göre otomatik gösterilir; boş bırakılırsa Türkçe adı gösterilir.</div>

                  {itemOptionGroups.map((group: any) => (
                    <div key={group.id} style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', padding: 12, marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 13 }}>{group.name}</div>
                        <button onClick={() => deleteOptionGroup(group.id)} style={{ background: 'transparent', border: '1px solid #383838', color: '#C0392B', fontSize: 11, cursor: 'pointer', padding: '4px 8px' }}>Grubu Sil</button>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                        <input defaultValue={group.name_en || ''} onBlur={e => updateGroupTranslation(group.id, 'name_en', e.target.value)}
                          placeholder="İngilizce grup adı (örn. Sugar Level)" style={{ ...s.input, flex: 1, height: 34, fontSize: 12 }} />
                        <input defaultValue={group.name_ar || ''} onBlur={e => updateGroupTranslation(group.id, 'name_ar', e.target.value)}
                          placeholder="Arapça grup adı (opsiyonel)" style={{ ...s.input, flex: 1, height: 34, fontSize: 12, direction: 'rtl' }} />
                      </div>
                      {group.choices.map((choice: any) => (
                        <div key={choice.id} style={{ padding: '8px 0', borderTop: '1px solid #2A2A2A' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ color: '#F0EDE8', fontSize: 13 }}>{choice.name}</span>
                            <button onClick={() => deleteOptionChoice(choice.id)} style={{ background: 'transparent', border: 'none', color: '#8A8A8A', fontSize: 14, cursor: 'pointer' }}>✕</button>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input defaultValue={choice.name_en || ''} onBlur={e => updateChoiceTranslation(group.id, choice.id, 'name_en', e.target.value)}
                              placeholder="İngilizce (örn. Less Sweet)" style={{ ...s.input, flex: 1, height: 32, fontSize: 12 }} />
                            <input defaultValue={choice.name_ar || ''} onBlur={e => updateChoiceTranslation(group.id, choice.id, 'name_ar', e.target.value)}
                              placeholder="Arapça (opsiyonel)" style={{ ...s.input, flex: 1, height: 32, fontSize: 12, direction: 'rtl' }} />
                          </div>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <input value={newChoiceText[group.id] || ''} onChange={e => setNewChoiceText(prev => ({ ...prev, [group.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && addOptionChoice(group.id)}
                          placeholder="Yeni seçenek (örn. Az Şekerli)" style={{ ...s.input, flex: 1, height: 40, fontSize: 13 }} />
                        <button onClick={() => addOptionChoice(group.id)} style={{ height: 40, padding: '0 14px', background: '#2A2A2A', border: 'none', color: '#C9A84C', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>+ Ekle</button>
                      </div>
                    </div>
                  ))}

                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addOptionGroup()}
                      placeholder="Yeni grup adı (örn. Şeker Oranı)" style={{ ...s.input, flex: 1, height: 44 }} />
                    <button onClick={addOptionGroup} style={{ height: 44, padding: '0 16px', background: '#C9A84C', border: 'none', color: '#0A0A0A', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>+ Grup Ekle</button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveItem} disabled={loading} style={{ ...s.btn, flex: 1 }}>{loading ? 'Kaydediliyor...' : editingItem ? 'Güncelle' : 'Ekle'}</button>
                {editingItem && <button onClick={resetItemForm} style={s.btnSecondary}>İptal</button>}
              </div>
            </div>

            {/* Filter */}
            <select value={filterCat} onChange={e => { setFilterCat(e.target.value); setSelectedItems(new Set()) }} style={{ ...s.input, marginBottom: 10 }}>
              <option value="">Tüm Kategoriler ({items.length})</option>
              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.icon} {cat.name} ({items.filter(i => i.category_id === cat.id).length})</option>)}
            </select>

            {/* Bulk move toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ color: '#8A8A8A', fontSize: 12, letterSpacing: 1 }}>
                {items.filter(i => !filterCat || i.category_id === filterCat).length} ÜRÜN
                {selectedItems.size > 0 && <span style={{ color: '#C9A84C', marginLeft: 8 }}>· {selectedItems.size} seçildi</span>}
              </div>
              <button onClick={() => { setBulkMode(!bulkMode); setSelectedItems(new Set()) }}
                style={{ background: bulkMode ? 'rgba(201,168,76,.15)' : '#2A2A2A', border: bulkMode ? '1px solid rgba(201,168,76,.4)' : 'none', borderRadius: 0, padding: '6px 12px', color: bulkMode ? '#C9A84C' : '#8A8A8A', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                {bulkMode ? '✕ İptal' : '↔ Toplu Taşı'}
              </button>
            </div>

            {/* Bulk move action bar */}
            {bulkMode && selectedItems.size > 0 && (
              <div style={{ background: '#1A1A1A', border: '1px solid rgba(201,168,76,.3)', borderRadius: 0, padding: 14, marginBottom: 14 }}>
                <div style={{ color: '#C9A84C', fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                  {selectedItems.size} ürünü taşı →
                </div>
                <select value={bulkTargetCat} onChange={e => setBulkTargetCat(e.target.value)} style={{ ...s.input, marginBottom: 10 }}>
                  <option value="">Hedef kategori seçin...</option>
                  {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>)}
                </select>
                <button onClick={bulkMove} disabled={loading || !bulkTargetCat}
                  style={{ ...s.btn, background: bulkTargetCat ? '#C0392B' : '#2A2A2A', color: bulkTargetCat ? '#fff' : '#555' }}>
                  {loading ? 'Taşınıyor...' : `${selectedItems.size} Ürünü Taşı`}
                </button>
              </div>
            )}

            {items.filter(i => !filterCat || i.category_id === filterCat).map(item => {
              const cat = categories.find(c => c.id === item.category_id)
              const isSelected = selectedItems.has(item.id)
              return (
                <div key={item.id} onClick={() => bulkMode && toggleSelect(item.id)}
                  style={{ ...s.card, opacity: item.available ? 1 : 0.5, border: isSelected ? '1px solid #C9A84C' : '1px solid #2A2A2A', cursor: bulkMode ? 'pointer' : 'default', background: isSelected ? 'rgba(201,168,76,.06)' : '#1A1A1A' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {/* Bulk mode checkbox */}
                    {bulkMode && (
                      <div style={{ width: 24, height: 24, borderRadius: 0, border: isSelected ? 'none' : '2px solid #383838', background: isSelected ? '#C9A84C' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>
                        {isSelected && '✓'}
                      </div>
                    )}
                    <div style={{ width: 60, height: 60, borderRadius: 0, overflow: 'hidden', background: '#2A2A2A', flexShrink: 0 }}>
                      {item.image_url
                        ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 22 }}>📷</div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{item.recommended && <span style={{ marginRight: 4 }}>⭐</span>}{item.name}</div>
                      <div style={{ color: '#8A8A8A', fontSize: 11, marginBottom: 4 }}>{cat?.name || '—'}</div>
                      <div style={{ color: '#C9A84C', fontWeight: 800, fontSize: 14 }}>{item.price} ₺</div>
                    </div>
                    {!bulkMode && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button onClick={() => startEditItem(item)} style={{ background: '#2A2A2A', border: 'none', borderRadius: 0, padding: '6px 10px', color: '#C9A84C', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Düzenle</button>
                      <button onClick={async () => { await supabase.from('menu_items').update({ recommended: !item.recommended }).eq('id', item.id); await loadData() }} style={{ background: item.recommended ? 'rgba(201,168,76,.2)' : '#2A2A2A', border: 'none', borderRadius: 0, padding: '6px 10px', color: item.recommended ? '#C9A84C' : '#8A8A8A', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>{item.recommended ? '⭐ Öne Çıkan' : 'Öne Çıkar'}</button>
                      <button onClick={() => deleteItem(item.id)} style={{ background: '#2A2A2A', border: 'none', borderRadius: 0, padding: '6px 10px', color: '#C0392B', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Sil</button>
                    </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {isManager && tab === 'staff' && (
          <div className="kahfe-section" style={s.section}>
            <div style={{ background: '#1A1A1A', borderRadius: 0, padding: 20, border: '1px solid #2A2A2A', marginBottom: 20 }}>
              <div style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 16, fontFamily: "'Bricolage Grotesque', sans-serif", marginBottom: 14 }}>{editingStaffId ? 'Personeli Düzenle' : 'Yeni Personel Ekle'}</div>
              <input value={staffFormName} onChange={e => setStaffFormName(e.target.value)} placeholder="İsim (örn. Ahmet)" style={{ ...s.input, height: 52, marginBottom: 10 }} />
              <input value={staffFormPin} onChange={e => setStaffFormPin(e.target.value.replace(/\D/g, ''))} placeholder="4-6 haneli PIN (örn. 4821)" inputMode="numeric" style={{ ...s.input, height: 52, fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, letterSpacing: '0.15em', marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button onClick={() => setStaffFormPermission('full')}
                  style={{ flex: 1, height: 48, background: staffFormPermission === 'full' ? 'rgba(39,174,96,.14)' : 'transparent', border: staffFormPermission === 'full' ? '1px solid #27ae60' : '1px solid #383838', color: staffFormPermission === 'full' ? '#5FD08C' : '#8A8A8A', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  Tam Yetkili
                </button>
                <button onClick={() => setStaffFormPermission('limited')}
                  style={{ flex: 1, height: 48, background: staffFormPermission === 'limited' ? 'rgba(243,156,18,.14)' : 'transparent', border: staffFormPermission === 'limited' ? '1px solid #f39c12' : '1px solid #383838', color: staffFormPermission === 'limited' ? '#f39c12' : '#8A8A8A', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  Kısıtlı (Sadece Sipariş + Ödeme)
                </button>
              </div>
              <div style={{ color: '#8A8A8A', fontSize: 11.5, marginBottom: 10 }}>Kısıtlı personel sadece sipariş ekleyebilir ve ödeme alabilir — ürün iptali, sipariş iptali, indirim, borç ve masa taşıma yapamaz.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveStaff} style={{ flex: 1, height: 52, background: '#C9A84C', border: 'none', borderRadius: 0, color: '#0A0A0A', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif" }}>{editingStaffId ? '✓ Kaydet' : '+ Ekle'}</button>
                {editingStaffId && (
                  <button onClick={resetStaffForm} style={{ height: 52, background: 'transparent', border: '1px solid #383838', borderRadius: 0, padding: '0 20px', color: '#8A8A8A', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif" }}>İptal</button>
                )}
              </div>
            </div>

            {staffList.length === 0 && (
              <div style={{ textAlign:'center', color:'#8A8A8A', padding:20 }}>Henüz kayıtlı personel yok. Herkes şimdilik ortak personel kodunu (5678) kullanabilir.</div>
            )}

            {staffList.map(s => (
              <div key={s.id} style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 0, padding: '16px 18px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: s.active ? 1 : 0.5 }}>
                <div>
                  <div style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 16, fontFamily: "'Bricolage Grotesque', sans-serif" }}>{s.name}</div>
                  <div style={{ color: '#8A8A8A', fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>PIN: {s.pin} {!s.active && '· Pasif'} {s.permission === 'limited' && <span style={{ color: '#f39c12' }}>· Kısıtlı</span>}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => startEditStaff(s)} style={{ background: 'transparent', border: '1px solid #383838', borderRadius: 0, height: 40, padding: '0 12px', color: '#C9A84C', fontSize: 12, cursor: 'pointer', fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif" }}>Düzenle</button>
                  <button onClick={() => toggleStaffActive(s)} style={{ background: 'transparent', border: '1px solid #383838', borderRadius: 0, height: 40, padding: '0 12px', color: s.active ? '#f39c12' : '#27ae60', fontSize: 12, cursor: 'pointer', fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif" }}>{s.active ? 'Pasifleştir' : 'Aktifleştir'}</button>
                  <button onClick={() => deleteStaff(s.id)} style={{ background: 'transparent', border: '1px solid #383838', borderRadius: 0, height: 40, padding: '0 12px', color: '#C0392B', fontSize: 12, cursor: 'pointer', fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif" }}>Sil</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {isManager && tab === 'settings' && (
          <div className="kahfe-section" style={s.section}>
            {/* Notification sound (per-device) */}
            <div style={{ background: '#1A1A1A', borderRadius: 0, padding: 20, border: '1px solid #2A2A2A', marginBottom: 20 }}>
              <div style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 16, fontFamily: "'Bricolage Grotesque', sans-serif", marginBottom: 4 }}>🔔 Bildirim Sesi</div>
              <div style={{ color: '#8A8A8A', fontSize: 12, marginBottom: 14 }}>Bu cihaz için — her cihazda ayrı ayarlanır (örn. mutfak tableti farklı olabilir).</div>
              <button onClick={toggleNotifSound} style={{ height: 48, padding: '0 20px', background: notifSoundOn ? 'rgba(39,174,96,.14)' : 'transparent', border: notifSoundOn ? '1px solid #27ae60' : '1px solid #383838', color: notifSoundOn ? '#5FD08C' : '#8A8A8A', fontSize: 14, cursor: 'pointer', fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                {notifSoundOn ? '🔊 Açık — Kapatmak için tıkla' : '🔇 Kapalı — Açmak için tıkla'}
              </button>
            </div>

            {/* Access PINs — manager-only, write-only (current values are never fetched/shown) */}
            <div style={{ background: '#1A1A1A', borderRadius: 0, padding: 20, border: '1px solid #2A2A2A', marginBottom: 20 }}>
              <div style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 16, fontFamily: "'Bricolage Grotesque', sans-serif", marginBottom: 4 }}>🔐 Erişim Şifreleri</div>
              <div style={{ color: '#8A8A8A', fontSize: 12, marginBottom: 14 }}>Yönetici, Dokunmatik Ekran ve Genel Personel giriş şifrelerini buradan değiştirebilirsiniz. Mevcut şifreler güvenlik nedeniyle burada gösterilmez — sadece yenisini girip güncelleyebilirsiniz.</div>
              {([['manager','Yönetici Şifresi'],['touchscreen','Dokunmatik Ekran Şifresi'],['staff_shared','Personel (Genel) Şifresi']] as const).map(([role, label]) => (
                <div key={role} style={{ marginBottom: 12 }}>
                  <div style={{ color: '#B5B0A8', fontSize: 12, marginBottom: 6 }}>{label}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="text" inputMode="numeric" value={accessPinInputs[role] || ''} onChange={e => setAccessPinInputs(prev => ({ ...prev, [role]: e.target.value.replace(/\D/g, '') }))}
                      onKeyDown={e => e.key === 'Enter' && updateAccessPin(role)}
                      placeholder="Yeni şifre (4-6 hane)" maxLength={6} style={{ ...s.input, height: 44, flex: 1, fontFamily: "'IBM Plex Mono', monospace" }} />
                    <button onClick={() => updateAccessPin(role)} style={{ height: 44, padding: '0 16px', background: '#C9A84C', border: 'none', color: '#0A0A0A', fontSize: 13, cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}>Güncelle</button>
                  </div>
                  {accessPinMsg[role] && (
                    <div style={{ color: accessPinMsg[role].startsWith('✓') ? '#5FD08C' : '#e74c3c', fontSize: 12, marginTop: 6 }}>{accessPinMsg[role]}</div>
                  )}
                </div>
              ))}
              <div style={{ borderTop: '1px solid #2A2A2A', marginTop: 14, paddingTop: 14 }}>
                <div style={{ color: '#B5B0A8', fontSize: 12, marginBottom: 8 }}>Oturum Güvenliği: girişler 24 saat sonra otomatik sona erer. Bir cihaz kaybolduysa veya çalındıysa, aşağıdaki düğme tüm cihazları anında oturumdan çıkarır.</div>
                <button onClick={logoutAllDevices} style={{ height: 44, padding: '0 16px', background: 'transparent', border: '1px solid #C0392B', color: '#e74c3c', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>🚪 Tüm Cihazlardan Çıkış Yap</button>
              </div>
            </div>

            {/* Auto print via RawBT */}
            <div style={{ background: '#1A1A1A', borderRadius: 0, padding: 20, border: '1px solid #2A2A2A', marginBottom: 20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom: 4 }}>
                <div style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 16, fontFamily: "'Bricolage Grotesque', sans-serif" }}>🖨️ Otomatik Yazdırma (RawBT)</div>
                <button onClick={toggleAutoPrintEnabled} style={{ height: 36, padding: '0 14px', background: autoPrintEnabled ? 'rgba(39,174,96,.14)' : 'transparent', border: autoPrintEnabled ? '1px solid #27ae60' : '1px solid #383838', color: autoPrintEnabled ? '#5FD08C' : '#8A8A8A', fontSize: 12, cursor: 'pointer', fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                  {autoPrintEnabled ? '⚡ Aktif (Dialogsuz)' : '🖱️ Kapalı (Tarayıcı Dialogu)'}
                </button>
              </div>
              <div style={{ color: '#8A8A8A', fontSize: 12, marginBottom: 4 }}>Açıkken Mutfak/Nargile fişi ve makbuz, tarayıcı yazdırma penceresi açmadan doğrudan RawBT uygulamasına gönderilir — sessiz yazdırma.</div>
              <div style={{ color: '#8A8A8A', fontSize: 12 }}>Gerekli: tablette Play Store'dan "RawBT Print Service" kurulu ve yazıcı RawBT içinde seçili olmalı. Kurulu değilse veya yazıcı henüz yoksa, bunu KAPALI bırakın — normal tarayıcı yazdırma çalışmaya devam eder.</div>
            </div>

            {/* Telegram recipients */}
            <div style={{ background: '#1A1A1A', borderRadius: 0, padding: 20, border: '1px solid #2A2A2A', marginBottom: 20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom: 4 }}>
                <div style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 16, fontFamily: "'Bricolage Grotesque', sans-serif" }}>📲 Telegram Bildirimleri</div>
                <button onClick={toggleTelegramEnabled} style={{ height: 36, padding: '0 14px', background: telegramEnabled ? 'rgba(39,174,96,.14)' : 'transparent', border: telegramEnabled ? '1px solid #27ae60' : '1px solid #383838', color: telegramEnabled ? '#5FD08C' : '#8A8A8A', fontSize: 12, cursor: 'pointer', fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                  {telegramEnabled ? '🔔 Aktif' : '🔕 Kapalı'}
                </button>
              </div>
              <div style={{ color: '#8A8A8A', fontSize: 12, marginBottom: 14 }}>Kapalıyken yeni sipariş geldiğinde hiç Telegram mesajı gönderilmez - sipariş, masa numarasıyla sisteme yine de eklenir.</div>
              <div style={{ opacity: telegramEnabled ? 1 : 0.4, pointerEvents: telegramEnabled ? 'auto' : 'none' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <input value={newRecipientName} onChange={e => setNewRecipientName(e.target.value)} placeholder="İsim" style={{ ...s.input, height: 48, flex: 1 }} />
                  <input value={newRecipientChatId} onChange={e => setNewRecipientChatId(e.target.value.replace(/\D/g, ''))} placeholder="Telegram Chat ID" inputMode="numeric" style={{ ...s.input, height: 48, flex: 1, fontFamily: "'IBM Plex Mono', monospace" }} />
                </div>
                <button onClick={addTelegramRecipient} style={{ width: '100%', height: 48, background: '#C9A84C', border: 'none', color: '#0A0A0A', fontWeight: 600, fontSize: 14, cursor: 'pointer', marginBottom: 14, fontFamily: "'IBM Plex Sans', sans-serif" }}>+ Ekle</button>
                {telegramRecipients.length === 0 && (
                  <div style={{ color: '#8A8A8A', fontSize: 13, textAlign: 'center', padding: '10px 0' }}>Henüz kayıtlı alıcı yok (varsayılan liste kullanılıyor).</div>
                )}
                {telegramRecipients.map(r => (
                  <div key={r.chat_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid #2A2A2A' }}>
                    <div>
                      <div style={{ color: '#F0EDE8', fontSize: 14, fontWeight: 600 }}>{r.name}</div>
                      <div style={{ color: '#8A8A8A', fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}>{r.chat_id}</div>
                    </div>
                    <button onClick={() => removeTelegramRecipient(r.chat_id)} style={{ background: 'transparent', border: '1px solid #383838', height: 36, padding: '0 12px', color: '#C0392B', fontSize: 12, cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif" }}>Sil</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Category → printer station routing */}
            <div style={{ background: '#1A1A1A', borderRadius: 0, padding: 20, border: '1px solid #2A2A2A', marginBottom: 20 }}>
              <div style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 16, fontFamily: "'Bricolage Grotesque', sans-serif", marginBottom: 4 }}>🖨️ Fiş Yönlendirme</div>
              <div style={{ color: '#8A8A8A', fontSize: 12, marginBottom: 14 }}>Her kategorinin fişi hangi istasyona (Mutfak / Nargile) yazdırılacağını seçin. Ayarlanmamış kategoriler varsayılan olarak Mutfak'a gider.</div>
              {categories.map(cat => (
                <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid #2A2A2A' }}>
                  <div style={{ color: '#F0EDE8', fontSize: 14 }}>{cat.icon} {cat.name}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setCategoryStation(cat.id, 'kitchen')} style={{ height: 36, padding: '0 12px', background: (categoryStations[cat.id] || 'kitchen') === 'kitchen' ? 'rgba(243,156,18,.14)' : 'transparent', border: (categoryStations[cat.id] || 'kitchen') === 'kitchen' ? '1px solid #f39c12' : '1px solid #383838', color: (categoryStations[cat.id] || 'kitchen') === 'kitchen' ? '#f39c12' : '#8A8A8A', fontSize: 12, cursor: 'pointer', fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif" }}>🍳 Mutfak</button>
                    <button onClick={() => setCategoryStation(cat.id, 'nargile')} style={{ height: 36, padding: '0 12px', background: categoryStations[cat.id] === 'nargile' ? 'rgba(155,89,182,.14)' : 'transparent', border: categoryStations[cat.id] === 'nargile' ? '1px solid #9b59b6' : '1px solid #383838', color: categoryStations[cat.id] === 'nargile' ? '#9b59b6' : '#8A8A8A', fontSize: 12, cursor: 'pointer', fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif" }}>💨 Nargile</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Table list, grouped the same way as Masa Haritası so it's not one flat jumble */}
            <div style={{ background: '#1A1A1A', borderRadius: 0, padding: 20, border: '1px solid #2A2A2A', marginBottom: 20 }}>
              <div style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 16, fontFamily: "'Bricolage Grotesque', sans-serif", marginBottom: 4 }}>🪑 Masalar</div>
              <div style={{ color: '#8A8A8A', fontSize: 12, marginBottom: 14 }}>Masa Haritası'nda görünen masalar. Yeni bir QR/NFC etiketi bastırdığınızda buraya da eklemeyi unutmayın.</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                <input value={newTableName} onChange={e => setNewTableName(e.target.value)} placeholder="Örn. MASA-12" style={{ ...s.input, height: 48, flex: 1 }} onKeyDown={e => e.key === 'Enter' && addTable()} />
                <button onClick={addTable} style={{ height: 48, padding: '0 20px', background: '#C9A84C', border: 'none', color: '#0A0A0A', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif" }}>+ Ekle</button>
              </div>
              {[
                { label: 'MASALAR', tables: ALL_TABLES.filter(t => t.startsWith('MASA')) },
                { label: 'KİTAPLIK', tables: ALL_TABLES.filter(t => t.startsWith('KİTAPLIK')) },
                { label: 'OKEY', tables: ALL_TABLES.filter(t => t.startsWith('OKEY')) },
                { label: 'KAHFE', tables: ALL_TABLES.filter(t => t.startsWith('KAHFE')) },
                { label: 'VİP', tables: ALL_TABLES.filter(t => t.startsWith('VİP')) },
                { label: 'DİĞER', tables: ALL_TABLES.filter(t => !/^(MASA|KİTAPLIK|OKEY|KAHFE|VİP)/.test(t)) },
              ].filter(group => group.tables.length > 0).map(group => (
                <div key={group.label} style={{ marginBottom: 16 }}>
                  <div style={{ color: '#C9A84C', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8, fontFamily: "'IBM Plex Mono', monospace" }}>{group.label} ({group.tables.length})</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                    {group.tables.map(t => (
                      <div key={t} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #2A2A2A', padding: '8px 10px', fontSize: 12, color: '#F0EDE8', fontFamily: "'IBM Plex Mono', monospace" }}>
                        {t}
                        <button onClick={() => removeTable(t)} style={{ background: 'transparent', border: 'none', color: '#C0392B', cursor: 'pointer', fontSize: 14, padding: 0, marginLeft: 6 }}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isManager && tab === 'debts' && (
          <div className="kahfe-section" style={s.section}>
            <div style={{ background: '#1A1A1A', borderRadius: 0, padding: 20, border: '1px solid #2A2A2A', marginBottom: 20 }}>
              <div style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 16, fontFamily: "'Bricolage Grotesque', sans-serif", marginBottom: 14 }}>+ Yeni Borçlu Ekle</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={newDebtorNameTab} onChange={e => setNewDebtorNameTab(e.target.value)} placeholder="İsim" style={{ ...s.input, height: 48, flex: 1 }} />
                <input value={newDebtorPhoneTab} onChange={e => setNewDebtorPhoneTab(e.target.value)} placeholder="Telefon (opsiyonel)" style={{ ...s.input, height: 48, flex: 1 }} />
                <button onClick={addDebtorFromTab} style={{ height: 48, padding: '0 20px', background: '#C9A84C', border: 'none', color: '#0A0A0A', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif" }}>+ Ekle</button>
              </div>
            </div>

            {debtors.length === 0 && (
              <div style={{ textAlign: 'center', color: '#8A8A8A', padding: 20 }}>Henüz kayıtlı borçlu yok.</div>
            )}

            {debtors.map(d => {
              const stats = debtorStats(d.id)
              return (
                <div key={d.id} onClick={() => setDebtDetailId(d.id)} style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderLeft: stats.kalan > 0 ? '3px solid #C0392B' : '3px solid #27ae60', padding: '16px 18px', marginBottom: 10, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 16, fontFamily: "'Bricolage Grotesque', sans-serif" }}>{d.name}</div>
                    {d.phone && <div style={{ color: '#8A8A8A', fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}>{d.phone}</div>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    <div>
                      <div style={{ color: '#8A8A8A', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Toplam Borç</div>
                      <div style={{ color: '#F0EDE8', fontSize: 16, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>₺{formatTL(stats.borc)}</div>
                    </div>
                    <div>
                      <div style={{ color: '#8A8A8A', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ödenen</div>
                      <div style={{ color: '#27ae60', fontSize: 16, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>₺{formatTL(stats.odenen)}</div>
                    </div>
                    <div>
                      <div style={{ color: '#8A8A8A', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Kalan</div>
                      <div style={{ color: stats.kalan > 0 ? '#e74c3c' : '#8A8A8A', fontSize: 16, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>₺{formatTL(stats.kalan)}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* RECEIPT HISTORY — search and reprint any past receipt */}
        {isManager && tab === 'receipts' && (
          <div className="kahfe-section" style={s.section}>
            <div style={{ background: '#1A1A1A', borderRadius: 0, padding: 20, border: '1px solid #2A2A2A', marginBottom: 20 }}>
              <div style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 16, fontFamily: "'Bricolage Grotesque', sans-serif", marginBottom: 4 }}>🧾 Fiş Geçmişi</div>
              <div style={{ color: '#8A8A8A', fontSize: 12, marginBottom: 14 }}>Geçmişteki herhangi bir tarihten (bir hafta önce, bir yıl önce, fark etmez) fiş bulup yeniden yazdırın.</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#8A8A8A', fontSize: 11, display: 'block', marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>BAŞLANGIÇ</label>
                  <input type="date" value={receiptFrom} onChange={e => setReceiptFrom(e.target.value)} style={{ ...s.input, height: 44, width: '100%' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#8A8A8A', fontSize: 11, display: 'block', marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>BİTİŞ</label>
                  <input type="date" value={receiptTo} onChange={e => setReceiptTo(e.target.value)} style={{ ...s.input, height: 44, width: '100%' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input value={receiptQuery} onChange={e => setReceiptQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchReceipts()}
                  placeholder="Masa adı (örn. MASA-3) veya fiş numarası" style={{ ...s.input, flex: 1, height: 48 }} />
                <button onClick={searchReceipts} style={{ height: 48, padding: '0 20px', background: '#C9A84C', border: 'none', color: '#0A0A0A', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  {receiptSearching ? '...' : '🔍 Ara'}
                </button>
              </div>
              <button onClick={exportAccountingExcel} disabled={exportingAccounting} style={{ width: '100%', height: 46, background: 'transparent', border: '1px solid #27ae60', color: '#5FD08C', fontWeight: 700, fontSize: 13, cursor: exportingAccounting ? 'not-allowed' : 'pointer', opacity: exportingAccounting ? 0.6 : 1 }}>
                {exportingAccounting ? 'Hazırlanıyor...' : '📊 Muhasebe İçin Excel İndir (Bu Tarih Aralığı)'}
              </button>
            </div>

            {receiptResults.length === 0 && !receiptSearching && (
              <div style={{ textAlign: 'center', color: '#8A8A8A', padding: 20 }}>Bu aralıkta sonuç bulunamadı. Tarih aralığını genişletmeyi deneyin.</div>
            )}

            {receiptResults.map((r: any) => (
              <div key={r.id} style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', padding: '14px 16px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div>
                  <div style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 15, fontFamily: "'Bricolage Grotesque', sans-serif" }}>{r.table_name.replace('-', ' ')} {r.fatura_no ? `· Fiş #${String(r.fatura_no).padStart(6, '0')}` : ''}</div>
                  <div style={{ color: '#8A8A8A', fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}>{new Date(r.closed_at).toLocaleString('tr-TR')} · {r.payment_method === 'cash' ? 'Nakit' : r.payment_method === 'card' ? 'Kart' : r.payment_method === 'transfer' ? 'Havale' : r.payment_method === 'debt' ? 'Borç' : 'Karma'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ color: '#C9A84C', fontWeight: 700, fontSize: 16, fontFamily: "'IBM Plex Mono', monospace" }}>₺{formatTL(Number(r.total))}</div>
                  <button onClick={() => reprintReceipt(r)} style={{ height: 40, padding: '0 14px', background: 'transparent', border: '1px solid #383838', color: '#C9A84C', fontSize: 12, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>🖨️ Yazdır</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* İNDİRİM & İPTAL RAPORU — loss prevention: who's discounting/voiding, how much, how often */}
        {isManager && tab === 'accountability' && (() => {
          const discountByStaff = groupByStaff(accDiscounts, 'applied_by', 'discount_amount')
          const voidByStaff = groupByStaff(accVoids, 'voided_by', 'amount')
          const totalDiscount = accDiscounts.reduce((s, d) => s + Number(d.discount_amount || 0), 0)
          const totalVoid = accVoids.reduce((s, v) => s + Number(v.amount || 0), 0)
          return (
          <div className="kahfe-section" style={s.section}>
            <div style={{ background: '#1A1A1A', borderRadius: 0, padding: 20, border: '1px solid #2A2A2A', marginBottom: 20 }}>
              <div style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 16, fontFamily: "'Bricolage Grotesque', sans-serif", marginBottom: 4 }}>🏷️ İndirim & İptal Raporu</div>
              <div style={{ color: '#8A8A8A', fontSize: 12, marginBottom: 14 }}>Kim ne kadar indirim veriyor, kim ne kadar ürün/sipariş iptal ediyor — hem dürüst hatalar hem de dikkat edilmesi gereken örüntüler için.</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#8A8A8A', fontSize: 11, display: 'block', marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>BAŞLANGIÇ</label>
                  <input type="date" value={accFrom} onChange={e => setAccFrom(e.target.value)} style={{ ...s.input, height: 44, width: '100%' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#8A8A8A', fontSize: 11, display: 'block', marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>BİTİŞ</label>
                  <input type="date" value={accTo} onChange={e => setAccTo(e.target.value)} style={{ ...s.input, height: 44, width: '100%' }} />
                </div>
              </div>
              <button onClick={searchAccountability} style={{ width: '100%', height: 48, background: '#C9A84C', border: 'none', color: '#0A0A0A', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                {accSearching ? '...' : '🔍 Ara'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <div style={{ flex: 1, background: '#1A1A1A', border: '1px solid rgba(231,76,60,.25)', padding: 14, textAlign: 'center' }}>
                <div style={{ color: '#8A8A8A', fontSize: 11 }}>TOPLAM İNDİRİM</div>
                <div style={{ color: '#e74c3c', fontWeight: 800, fontSize: 20 }}>{formatTL(totalDiscount)} ₺</div>
                <div style={{ color: '#8A8A8A', fontSize: 11, marginTop: 2 }}>{accDiscounts.length} işlem</div>
              </div>
              <div style={{ flex: 1, background: '#1A1A1A', border: '1px solid rgba(231,76,60,.25)', padding: 14, textAlign: 'center' }}>
                <div style={{ color: '#8A8A8A', fontSize: 11 }}>TOPLAM İPTAL</div>
                <div style={{ color: '#e74c3c', fontWeight: 800, fontSize: 20 }}>{formatTL(totalVoid)} ₺</div>
                <div style={{ color: '#8A8A8A', fontSize: 11, marginTop: 2 }}>{accVoids.length} işlem</div>
              </div>
            </div>

            <div style={{ color: '#C9A84C', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 10, textTransform: 'uppercase' }}>🏷️ Personel Bazında İndirim</div>
            {discountByStaff.length === 0 && <div style={{ color: '#8A8A8A', fontSize: 13, textAlign: 'center', padding: 14 }}>Bu aralıkta indirim yok.</div>}
            {discountByStaff.map(([name, stat]) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', background: '#1A1A1A', border: '1px solid #2A2A2A', padding: '12px 16px', marginBottom: 8 }}>
                <div style={{ color: '#F0EDE8', fontWeight: 600, fontSize: 14 }}>{name}</div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#e74c3c', fontWeight: 700, fontSize: 15, fontFamily: "'IBM Plex Mono', monospace" }}>{formatTL(stat.total)} ₺</div>
                  <div style={{ color: '#8A8A8A', fontSize: 11 }}>{stat.count} işlem</div>
                </div>
              </div>
            ))}

            <div style={{ color: '#C9A84C', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', margin: '20px 0 10px', textTransform: 'uppercase' }}>🚫 Personel Bazında İptal</div>
            {voidByStaff.length === 0 && <div style={{ color: '#8A8A8A', fontSize: 13, textAlign: 'center', padding: 14 }}>Bu aralıkta iptal yok.</div>}
            {voidByStaff.map(([name, stat]) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', background: '#1A1A1A', border: '1px solid #2A2A2A', padding: '12px 16px', marginBottom: 8 }}>
                <div style={{ color: '#F0EDE8', fontWeight: 600, fontSize: 14 }}>{name}</div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#e74c3c', fontWeight: 700, fontSize: 15, fontFamily: "'IBM Plex Mono', monospace" }}>{formatTL(stat.total)} ₺</div>
                  <div style={{ color: '#8A8A8A', fontSize: 11 }}>{stat.count} işlem</div>
                </div>
              </div>
            ))}

            <div style={{ color: '#8A8A8A', fontSize: 11, letterSpacing: '0.08em', margin: '20px 0 10px', textTransform: 'uppercase' }}>Detaylı Kayıtlar — İndirimler</div>
            {accDiscounts.map((d: any) => (
              <div key={d.id} style={{ padding: '10px 0', borderBottom: '1px solid #2A2A2A', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ color: '#F0EDE8', fontSize: 13 }}>{d.table_name} — {d.reason || 'Neden belirtilmemiş'}</div>
                  <div style={{ color: '#8A8A8A', fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}>{d.applied_by} · {new Date(d.created_at).toLocaleString('tr-TR')}</div>
                </div>
                <div style={{ color: '#e74c3c', fontWeight: 700, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", whiteSpace: 'nowrap' }}>-{formatTL(Number(d.discount_amount))} ₺</div>
              </div>
            ))}

            <div style={{ color: '#8A8A8A', fontSize: 11, letterSpacing: '0.08em', margin: '20px 0 10px', textTransform: 'uppercase' }}>Detaylı Kayıtlar — İptaller</div>
            {accVoids.map((v: any) => (
              <div key={v.id} style={{ padding: '10px 0', borderBottom: '1px solid #2A2A2A', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ color: '#F0EDE8', fontSize: 13 }}>{v.table_name} — {v.item_name ? `${v.quantity}x ${v.item_name}` : 'Tüm Sipariş'} · {v.reason || 'Neden belirtilmemiş'}</div>
                  <div style={{ color: '#8A8A8A', fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}>{v.voided_by} · {new Date(v.created_at).toLocaleString('tr-TR')}</div>
                </div>
                <div style={{ color: '#e74c3c', fontWeight: 700, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", whiteSpace: 'nowrap' }}>-{formatTL(Number(v.amount))} ₺</div>
              </div>
            ))}
          </div>
          )
        })()}

        {/* Debtor detail modal */}
        {debtDetailId && (() => {
          const debtor = debtors.find(d => d.id === debtDetailId)
          if (!debtor) return null
          const stats = debtorStats(debtDetailId)
          return (
            <DebtorDetailModal debtor={debtor} stats={stats}
              debtPaymentAmount={debtPaymentAmount} onDebtPaymentAmountChange={setDebtPaymentAmount}
              manualDebtAmount={manualDebtAmount} onManualDebtAmountChange={setManualDebtAmount}
              manualDebtNote={manualDebtNote} onManualDebtNoteChange={setManualDebtNote}
              onRecordPayment={() => recordDebtPayment(debtDetailId)} onAddManualDebt={() => addManualDebt(debtDetailId)}
              onClose={() => setDebtDetailId(null)} />
          )
        })()}
      </div>
    </>
  )
}
