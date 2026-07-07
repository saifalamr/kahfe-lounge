'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, Category, MenuItem } from '@/lib/supabase'

const ADMIN_PASSWORD = 'kahfe2024admin'
const STAFF_PASSWORD = 'kahfe2024staff'

/* ── Image Cropper Component ── */
function ImageCropper({ src, onCrop, onCancel }: { src: string; onCrop: (blob: Blob) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imgLoaded, setImgLoaded] = useState(false)

  const CROP_W = 600
  const CROP_H = 450

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !imgLoaded) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, CROP_W, CROP_H)
    const sw = img.naturalWidth * zoom
    const sh = img.naturalHeight * zoom
    ctx.drawImage(img, pos.x, pos.y, sw, sh)
  }, [zoom, pos, imgLoaded])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { imgRef.current = img; setImgLoaded(true) }
    img.src = src
  }, [src])

  function onMouseDown(e: React.MouseEvent) {
    setDragging(true)
    setDragStart({ x: e.clientX - pos.x, y: e.clientY - pos.y })
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging) return
    setPos({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    setDragging(true)
    setDragStart({ x: t.clientX - pos.x, y: t.clientY - pos.y })
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!dragging) return
    const t = e.touches[0]
    setPos({ x: t.clientX - dragStart.x, y: t.clientY - dragStart.y })
  }
  function stopDrag() { setDragging(false) }

  function handleCrop() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(blob => { if (blob) onCrop(blob) }, 'image/jpeg', 0.92)
  }

  function resetPos() {
    const img = imgRef.current
    if (!img) return
    setZoom(1)
    setPos({ x: (CROP_W - img.naturalWidth) / 2, y: (CROP_H - img.naturalHeight) / 2 })
  }

  useEffect(() => { if (imgLoaded) resetPos() }, [imgLoaded])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ color: '#C9A84C', fontSize: 11, letterSpacing: 3, fontWeight: 700, marginBottom: 12 }}>FOTOĞRAF DÜZENLE</div>
      <div style={{ color: '#888', fontSize: 12, marginBottom: 16 }}>Sürükle · Zoom ile boyutlandır · Kırp</div>

      {/* Canvas crop area */}
      <div ref={containerRef} style={{ position: 'relative', border: '2px solid #C9A84C', borderRadius: 12, overflow: 'hidden', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          width={CROP_W}
          height={CROP_H}
          style={{ display: 'block', maxWidth: '100%', width: Math.min(CROP_W, window.innerWidth - 40) }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={stopDrag}
        />
        {/* grid overlay */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(201,168,76,.15) 1px,transparent 1px),linear-gradient(90deg,rgba(201,168,76,.15) 1px,transparent 1px)', backgroundSize: '33.3% 33.3%' }} />
      </div>

      {/* Zoom slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, width: '100%', maxWidth: CROP_W }}>
        <span style={{ color: '#888', fontSize: 12 }}>🔍</span>
        <input type="range" min={0.1} max={3} step={0.01} value={zoom}
          onChange={e => setZoom(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: '#C9A84C' }} />
        <span style={{ color: '#C9A84C', fontSize: 12, minWidth: 36 }}>{Math.round(zoom * 100)}%</span>
        <button onClick={resetPos} style={{ background: '#2A2A2A', border: 'none', borderRadius: 8, padding: '6px 12px', color: '#888', fontSize: 12, cursor: 'pointer' }}>Sıfırla</button>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 12, marginTop: 16, width: '100%', maxWidth: CROP_W }}>
        <button onClick={onCancel} style={{ flex: 1, background: 'transparent', border: '1px solid #2A2A2A', borderRadius: 12, padding: 14, color: '#888', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>İptal</button>
        <button onClick={handleCrop} style={{ flex: 2, background: '#C9A84C', border: 'none', borderRadius: 12, padding: 14, color: '#1A0E06', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>✓ Fotoğrafı Kaydet</button>
      </div>
    </div>
  )
}

/* ── Main Admin Page ── */
export default function AdminPage() {
  const [auth, setAuth] = useState(false)
  const [role, setRole] = useState<'manager' | 'staff' | null>(null)
  const isManager = role === 'manager'
  const [notifications, setNotifications] = useState<any[]>([])
  const [showNotif, setShowNotif] = useState(false)
  const [newOrderAlert, setNewOrderAlert] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!auth) return
    // Load pending orders on mount
    supabase.from('orders').select('*').eq('status', 'pending').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setNotifications(data) })

    // Real-time subscription for new orders
    const channel = supabase
      .channel('orders-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        setNotifications(prev => [payload.new, ...prev])
        setNewOrderAlert(true)
        loadTableMapData()
        // Play beep sound
        try {
          const ctx = new AudioContext()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain); gain.connect(ctx.destination)
          osc.frequency.value = 880; gain.gain.value = 0.3
          osc.start(); osc.stop(ctx.currentTime + 0.15)
          setTimeout(() => { const o2 = ctx.createOscillator(); const g2 = ctx.createGain(); o2.connect(g2); g2.connect(ctx.destination); o2.frequency.value = 1100; g2.gain.value = 0.3; o2.start(); o2.stop(ctx.currentTime + 0.15) }, 200)
        } catch(e) {}
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => loadTableMapData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tabs' }, () => loadTableMapData())
      .subscribe()

    loadTableMapData()

    return () => { supabase.removeChannel(channel) }
  }, [auth])

  async function acceptOrder(id: string) {
    await supabase.from('orders').update({ status: 'accepted' }).eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  async function dismissOrder(id: string) {
    await supabase.from('orders').update({ status: 'dismissed' }).eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)
  const [tab, setTab] = useState<'categories' | 'items' | 'orders'>('orders')
  const [allOrders, setAllOrders] = useState<any[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'map'|'list'>('map')
  const [openTabs, setOpenTabs] = useState<any[]>([])
  const [tabOrders, setTabOrders] = useState<any[]>([])
  const [activeTableModal, setActiveTableModal] = useState<string | null>(null)

  const ALL_TABLES = [
    ...Array.from({ length: 11 }, (_, i) => `MASA-${i + 1}`),
    ...Array.from({ length: 3 }, (_, i) => `KİTAPLIK-${i + 1}`),
    ...Array.from({ length: 4 }, (_, i) => `OKEY-${i + 1}`),
    ...Array.from({ length: 2 }, (_, i) => `KAHFE-${i + 1}`),
    'VİP-ODA',
  ]

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
    const active = orders.filter((o: any) => o.status !== 'served' && o.status !== 'dismissed')
    let status: 'pending'|'preparing'|'ready'|'bill'|'occupied' = 'occupied'
    if (active.some((o: any) => o.status === 'pending')) status = 'pending'
    else if (active.some((o: any) => o.status === 'accepted')) status = 'preparing'
    else if (active.some((o: any) => o.status === 'ready')) status = 'ready'
    else if (openTab.bill_requested) status = 'bill'
    return { status, tabData: openTab, orders }
  }

  async function updateOrderStatus(id: string, status: string) {
    await supabase.from('orders').update({ status }).eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
    await Promise.all([loadOrders(dateFilter), loadTableMapData()])
  }

  async function requestBill(tabId: string) {
    await supabase.from('tabs').update({ bill_requested: true }).eq('id', tabId)
    await loadTableMapData()
  }

  async function closeTable(tabId: string) {
    if (!confirm('Masayı kapatmak istediğinizden emin misiniz?\n\nBu, ödeme alındığını manuel olarak işaretler (henüz tam ödeme/adisyon sistemi yok). Masa boşa çıkacak.')) return
    await supabase.from('tabs').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', tabId)
    setActiveTableModal(null)
    await loadTableMapData()
  }

  // Staff-entered orders (walk-ins, phone orders, waiter taking a verbal order)
  const [addOrderTable, setAddOrderTable] = useState<string | null>(null)
  const [staffCart, setStaffCart] = useState<Record<string, number>>({})
  const [staffCategoryFilter, setStaffCategoryFilter] = useState<string | null>(null)

  function openAddOrder(tableName: string) {
    setAddOrderTable(tableName)
    setStaffCart({})
    setStaffCategoryFilter(null)
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

  const staffCartCount = Object.values(staffCart).reduce((s, q) => s + q, 0)
  const staffCartTotal = Object.entries(staffCart).reduce((s, [id, qty]) => {
    const item = items.find(i => i.id === id)
    return s + (item ? item.price * qty : 0)
  }, 0)

  async function submitStaffOrder() {
    if (!addOrderTable || staffCartCount === 0) return
    const orderItems = Object.entries(staffCart).map(([id, qty]) => {
      const item = items.find(i => i.id === id)!
      return { id: item.id, name: item.name, name_en: item.name_en || item.name, price: item.price, quantity: qty, subtotal: item.price * qty }
    })
    const orderTotal = orderItems.reduce((s, i) => s + i.subtotal, 0)

    let tabId = openTabs.find((t: any) => t.table_name === addOrderTable)?.id
    if (!tabId) {
      const { data: newTab } = await supabase.from('tabs').insert({ table_name: addOrderTable, status: 'open' }).select('id').single()
      tabId = newTab?.id
    }

    // Staff-entered orders go straight to "accepted" (Hazırlanıyor) —
    // there's no need for a Kabul step on an order staff just typed in themselves
    await supabase.from('orders').insert({
      table_name: addOrderTable,
      items: orderItems,
      total: orderTotal,
      status: 'accepted',
      note: null,
      tab_id: tabId
    })

    await loadTableMapData()
    setAddOrderTable(null)
    setStaffCart({})
  }
  const [showMonthlyReport, setShowMonthlyReport] = useState<any>(null)
  const [dateFilter, setDateFilter] = useState<'today'|'week'|'month'>('today')

  // Reset markers are stored in Supabase (table: reset_markers) so a reset
  // made on one device is instantly reflected on every other device.
  async function getResetMarker(scope: 'today'|'week'|'month'): Promise<string | null> {
    const { data } = await supabase.from('reset_markers').select('reset_at').eq('key', scope).maybeSingle()
    return data?.reset_at || null
  }

  function baseFromForFilter(filter: 'today'|'week'|'month') {
    const now = new Date()
    if (filter === 'today') return now.toISOString().split('T')[0]
    if (filter === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString() }
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  }

  async function loadOrders(filter: 'today'|'week'|'month' = dateFilter) {
    setOrdersLoading(true)
    const baseFrom = baseFromForFilter(filter)
    const marker = await getResetMarker(filter)
    // Only honor the marker if it falls within the current window (e.g. a
    // "today" reset from three days ago shouldn't suppress today's orders)
    const fromDate = (marker && marker > baseFrom) ? marker : baseFrom
    const { data } = await supabase.from('orders').select('*')
      .gte('created_at', fromDate).order('created_at', { ascending: false })
    setAllOrders(data || [])
    setOrdersLoading(false)
  }


  async function generateMonthlyReport() {
    const now = new Date()
    const monthNames = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
    const month = monthNames[now.getMonth()]
    const year = now.getFullYear()
    const firstDay = new Date(year, now.getMonth(), 1).toISOString()
    const lastDay = new Date(year, now.getMonth() + 1, 0, 23, 59, 59).toISOString()

    const { data: monthOrders } = await supabase.from('orders').select('*')
      .gte('created_at', firstDay).lte('created_at', lastDay)

    if (!monthOrders || monthOrders.length === 0) {
      showMsg('Bu ay hiç sipariş yok')
      return
    }

    const totalRevenue = monthOrders.reduce((s: number, o: any) => s + Number(o.total), 0)

    // Top items
    const itemMap: Record<string, { name: string; count: number; revenue: number }> = {}
    monthOrders.forEach((o: any) => {
      o.items?.forEach((item: any) => {
        if (!itemMap[item.name]) itemMap[item.name] = { name: item.name, count: 0, revenue: 0 }
        itemMap[item.name].count += item.quantity
        itemMap[item.name].revenue += item.subtotal
      })
    })
    const topItems = Object.values(itemMap).sort((a, b) => b.count - a.count).slice(0, 10)

    // Top tables
    const tableMap: Record<string, number> = {}
    monthOrders.forEach((o: any) => { tableMap[o.table_name] = (tableMap[o.table_name] || 0) + Number(o.total) })
    const topTables = Object.entries(tableMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, rev]) => ({ name, revenue: rev }))

    // Daily breakdown
    const dayMap: Record<string, { orders: number; revenue: number }> = {}
    monthOrders.forEach((o: any) => {
      const day = o.created_at.split('T')[0]
      if (!dayMap[day]) dayMap[day] = { orders: 0, revenue: 0 }
      dayMap[day].orders++
      dayMap[day].revenue += Number(o.total)
    })

    await supabase.from('monthly_reports').insert({
      month, year,
      total_orders: monthOrders.length,
      total_revenue: totalRevenue,
      top_items: topItems,
      top_tables: topTables,
      daily_breakdown: dayMap
    })

    showMsg(`✓ ${month} ${year} raporu kaydedildi!`)
    setShowMonthlyReport({ month, year, totalOrders: monthOrders.length, totalRevenue, topItems, topTables, dayMap })
  }

  function exportOrdersPDF() {
    const win = window.open('', '_blank', 'width=900,height=900')
    if (!win) { alert('Pop-up engellendi. Lütfen bu site için pop-up izni verip tekrar deneyin.'); return }
    const label = dateFilter === 'today' ? 'Bugün' : dateFilter === 'week' ? 'Bu Hafta' : 'Bu Ay'
    const totalRevenue = allOrders.reduce((s: number, o: any) => s + Number(o.total), 0)
    const pending = allOrders.filter((o: any) => o.status === 'pending').length
    const statusLabel = (st: string) => st==='pending'?'Bekliyor':st==='accepted'?'Hazırlanıyor':st==='ready'?'Hazır':st==='served'?'Teslim Edildi':'Kapatıldı'
    const rows = allOrders.map((o: any, i: number) => {
      const itemsText = (o.items || []).map((it: any) => `${it.quantity}x ${it.name}`).join(', ')
      return `<tr><td>${i + 1}</td><td>🪑 ${o.table_name}</td><td>${new Date(o.created_at).toLocaleString('tr-TR')}</td><td>${itemsText}</td><td>${statusLabel(o.status)}</td><td style="text-align:right">${o.total} ₺</td></tr>`
    }).join('')
    win.document.write(`
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="utf-8" />
        <title>Kahfe Lounge - ${label} Raporu</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; color:#1A1A1A; padding: 36px; }
          .brand { font-size: 12px; letter-spacing: 3px; color:#8a6d1f; font-weight:700; }
          h1 { font-size: 22px; margin: 4px 0 20px; }
          .stats { display:flex; gap:16px; margin-bottom: 24px; }
          .stat { flex:1; border:1px solid #ddd; border-radius:10px; padding:14px; text-align:center; }
          .stat .num { font-size: 22px; font-weight:800; }
          .stat .label { font-size: 11px; color:#888; margin-top:4px; }
          table { width:100%; border-collapse:collapse; margin-top:10px; }
          th, td { padding:7px 8px; border-bottom:1px solid #eee; font-size:11px; text-align:left; }
          th { color:#888; text-transform:uppercase; font-size:10px; }
          @media print { .no-print { display:none; } }
        </style>
      </head>
      <body>
        <div class="brand">KAHFE LOUNGE</div>
        <h1>${label} Raporu — ${new Date().toLocaleDateString('tr-TR')}</h1>
        <div class="stats">
          <div class="stat"><div class="num">${allOrders.length}</div><div class="label">Toplam Sipariş</div></div>
          <div class="stat"><div class="num">${pending}</div><div class="label">Bekliyor</div></div>
          <div class="stat"><div class="num">${totalRevenue.toFixed(0)} ₺</div><div class="label">Ciro</div></div>
        </div>
        <table>
          <tr><th>#</th><th>Masa</th><th>Saat</th><th>Ürünler</th><th>Durum</th><th style="text-align:right">Toplam</th></tr>
          ${rows || '<tr><td colspan="6">Bu aralıkta sipariş yok</td></tr>'}
        </table>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `)
    win.document.close()
  }

  function exportMonthlyReportPDF(report: any) {
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) { alert('Pop-up engellendi. Lütfen bu site için pop-up izni verip tekrar deneyin.'); return }
    const itemRows = (report.topItems || []).slice(0, 10).map((item: any, i: number) => `
      <tr><td>${i + 1}</td><td>${item.name}</td><td style="text-align:right">${item.count}</td><td style="text-align:right">${item.revenue} ₺</td></tr>
    `).join('')
    const tableRows = (report.topTables || []).slice(0, 10).map((t: any, i: number) => `
      <tr><td>${i + 1}</td><td>${t.name}</td><td style="text-align:right">${t.revenue} ₺</td></tr>
    `).join('')
    win.document.write(`
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="utf-8" />
        <title>Kahfe Lounge - ${report.month} ${report.year} Raporu</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; color:#1A1A1A; padding: 36px; }
          .brand { font-size: 12px; letter-spacing: 3px; color:#8a6d1f; font-weight:700; }
          h1 { font-size: 22px; margin: 4px 0 20px; }
          .stats { display:flex; gap:16px; margin-bottom: 24px; }
          .stat { flex:1; border:1px solid #ddd; border-radius:10px; padding:14px; text-align:center; }
          .stat .num { font-size: 24px; font-weight:800; }
          .stat .label { font-size: 11px; color:#888; margin-top:4px; }
          h2 { font-size:14px; margin-top:28px; border-bottom:2px solid #C9A84C; padding-bottom:8px; }
          table { width:100%; border-collapse:collapse; margin-top:10px; }
          th, td { padding:7px 8px; border-bottom:1px solid #eee; font-size:12px; text-align:left; }
          th { color:#888; text-transform:uppercase; font-size:10px; }
          @media print { .no-print { display:none; } }
        </style>
      </head>
      <body>
        <div class="brand">KAHFE LOUNGE</div>
        <h1>${report.month} ${report.year} Raporu</h1>
        <div class="stats">
          <div class="stat"><div class="num">${report.totalOrders}</div><div class="label">Toplam Sipariş</div></div>
          <div class="stat"><div class="num">${Number(report.totalRevenue).toFixed(0)} ₺</div><div class="label">Toplam Ciro</div></div>
        </div>
        <h2>En Çok Satılan Ürünler</h2>
        <table>
          <tr><th>#</th><th>Ürün</th><th style="text-align:right">Adet</th><th style="text-align:right">Ciro</th></tr>
          ${itemRows || '<tr><td colspan="4">Veri yok</td></tr>'}
        </table>
        <h2>En Yüksek Cirolu Masalar</h2>
        <table>
          <tr><th>#</th><th>Masa</th><th style="text-align:right">Ciro</th></tr>
          ${tableRows || '<tr><td colspan="3">Veri yok</td></tr>'}
        </table>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `)
    win.document.close()
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
  const [items, setItems] = useState<MenuItem[]>([])
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

  // Image crop states
  const [rawImageSrc, setRawImageSrc] = useState('')
  const [showCropper, setShowCropper] = useState(false)
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null)
  const [croppedPreview, setCroppedPreview] = useState('')
  const [existingImageUrl, setExistingImageUrl] = useState('')

  useEffect(() => {
    const savedRole = localStorage.getItem('kahfe_admin_role')
    if (savedRole === 'manager' || savedRole === 'staff') { setRole(savedRole); setAuth(true) }
  }, [])

  // Staff can only ever see the orders tab
  useEffect(() => { if (role === 'staff') setTab('orders') }, [role])
  useEffect(() => { if (role === 'staff' && dateFilter !== 'today') setDateFilter('today') }, [role, dateFilter])

  useEffect(() => { if (auth) loadData() }, [auth])

  async function loadData() {
    const [{ data: cats }, { data: its }] = await Promise.all([
      supabase.from('categories').select('*').order('order_index'),
      supabase.from('menu_items').select('*').order('order_index'),
    ])
    setCategories(cats || [])
    setItems(its || [])
  }

  function login() {
    if (pw === ADMIN_PASSWORD) {
      localStorage.setItem('kahfe_admin_role', 'manager')
      setRole('manager'); setAuth(true)
    } else if (pw === STAFF_PASSWORD) {
      localStorage.setItem('kahfe_admin_role', 'staff')
      setRole('staff'); setAuth(true)
    } else {
      setPwError(true)
    }
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
        showMsg('Ürün güncellendi ✓'); setEditingItem(null)
      } else {
        const maxOrder = items.length ? Math.max(...items.map(i => i.order_index)) + 1 : 0
        await supabase.from('menu_items').insert({ name: itemName, description: itemDesc, price: parseFloat(itemPrice), category_id: itemCat, image_url: imageUrl, available: itemAvail, recommended: itemRec, order_index: maxOrder })
        showMsg('Ürün eklendi ✓')
      }
      resetItemForm(); await loadData()
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
  }

  function resetItemForm() {
    setItemName(''); setItemDesc(''); setItemPrice(''); setItemCat(''); setItemAvail(true); setItemRec(false)
    setEditingItem(null); setCroppedBlob(null); setCroppedPreview(''); setRawImageSrc('')
    setExistingImageUrl(''); setShowCropper(false)
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
    page: { background: '#0D0D0D', minHeight: '100vh', maxWidth: 480, margin: '0 auto', paddingBottom: 40 } as React.CSSProperties,
    header: { background: '#1A1A1A', padding: '16px 20px', borderBottom: '1px solid #2A2A2A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as React.CSSProperties,
    input: { width: '100%', background: '#2A2A2A', border: '1px solid #3A3A3A', borderRadius: 10, padding: '12px 14px', color: '#F0EDE8', fontSize: 14, outline: 'none' } as React.CSSProperties,
    label: { color: '#888', fontSize: 12, fontWeight: 600, marginBottom: 6, display: 'block', letterSpacing: 1 } as React.CSSProperties,
    btn: { background: '#C0392B', border: 'none', borderRadius: 10, padding: '12px 20px', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', width: '100%' } as React.CSSProperties,
    btnSecondary: { background: '#2A2A2A', border: 'none', borderRadius: 10, padding: '10px 16px', color: '#888', fontWeight: 600, fontSize: 13, cursor: 'pointer' } as React.CSSProperties,
    card: { background: '#1A1A1A', borderRadius: 14, padding: '14px 16px', border: '1px solid #2A2A2A', marginBottom: 10 } as React.CSSProperties,
    section: { padding: '16px 20px' } as React.CSSProperties,
  }

  if (!auth) return (
    <div style={{ background: '#0D0D0D', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#1A1A1A', borderRadius: 20, padding: 32, width: '100%', maxWidth: 360, border: '1px solid #2A2A2A' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ color: '#C9A84C', fontSize: 10, letterSpacing: 4, fontWeight: 600 }}>YÖNETİM PANELİ</div>
          <div style={{ color: '#F0EDE8', fontSize: 22, fontWeight: 800 }}>KAHFE LOUNGE</div>
        </div>
        <label style={s.label}>ŞİFRE</label>
        <input type="password" value={pw} onChange={e => { setPw(e.target.value); setPwError(false) }}
          onKeyDown={e => e.key === 'Enter' && login()}
          style={{ ...s.input, borderColor: pwError ? '#C0392B' : '#3A3A3A', marginBottom: 8 }}
          placeholder="Şifrenizi girin" />
        {pwError && <div style={{ color: '#C0392B', fontSize: 12, marginBottom: 12 }}>Hatalı şifre</div>}
        <button onClick={login} style={{ ...s.btn, marginTop: 8 }}>Giriş Yap</button>
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
        body { background: #0D0D0D; color: #F0EDE8; font-family: 'Inter', sans-serif; }
      `}</style>
      <div style={{ background: '#0D0D0D', minHeight: '100vh', maxWidth: 480, margin: '0 auto', paddingBottom: 40 }}>
        <div style={s.header}>
          <div>
            <div style={{ color: '#C9A84C', fontSize: 10, letterSpacing: 3 }}>YÖNETİM</div>
            <div style={{ color: '#F0EDE8', fontSize: 18, fontWeight: 800 }}>KAHFE LOUNGE</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {/* Notification Bell */}
            <button onClick={() => { setShowNotif(!showNotif); setNewOrderAlert(false) }}
              style={{ position: 'relative', background: newOrderAlert ? 'rgba(192,57,43,.2)' : '#2A2A2A', border: newOrderAlert ? '1px solid #C0392B' : '1px solid #3A3A3A', borderRadius: 10, width: 40, height: 40, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, animation: newOrderAlert ? 'bellShake .5s ease infinite' : 'none' }}>
              🔔
              {notifications.length > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, background: '#C0392B', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{notifications.length}</span>
              )}
            </button>
            <button onClick={() => { localStorage.removeItem('kahfe_admin_role'); localStorage.removeItem('kahfe_admin'); setAuth(false); setRole(null) }} style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: 8, padding: '6px 12px', color: '#888', fontSize: 12, cursor: 'pointer' }}>Çıkış</button>
          </div>
        </div>

        {/* Notification Panel */}
        {showNotif && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)' }} onClick={() => setShowNotif(false)}>
            <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 60, right: 0, left: 0, maxWidth: 480, margin: '0 auto', background: '#1A1A1A', borderRadius: '0 0 20px 20px', maxHeight: '80vh', overflowY: 'auto', border: '1px solid #2A2A2A', borderTop: 'none' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #2A2A2A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#C9A84C', fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>🔔 YENİ SİPARİŞLER ({notifications.length})</span>
                <button onClick={() => setShowNotif(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 18, cursor: 'pointer' }}>✕</button>
              </div>
              {notifications.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>Bekleyen sipariş yok</div>
              ) : notifications.map((order: any) => (
                <div key={order.id} style={{ padding: '14px 18px', borderBottom: '1px solid #2A2A2A' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <span style={{ background: '#C0392B', color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 800, marginRight: 8 }}>YENİ</span>
                      <span style={{ color: '#C9A84C', fontWeight: 800, fontSize: 16 }}>🪑 {order.table_name}</span>
                    </div>
                    <span style={{ color: '#888', fontSize: 11 }}>{new Date(order.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    {order.items.map((item: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#F0EDE8', padding: '3px 0', borderBottom: '1px solid rgba(240,237,232,.05)' }}>
                        <span>{item.quantity}x {item.name}</span>
                        <span style={{ color: '#C9A84C' }}>{item.subtotal} ₺</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid rgba(201,168,76,.2)' }}>
                    <span style={{ color: '#C9A84C', fontWeight: 800, fontSize: 15 }}>TOPLAM: {order.total} ₺</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => dismissOrder(order.id)} style={{ background: '#2A2A2A', border: 'none', borderRadius: 8, padding: '6px 12px', color: '#888', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Kapat</button>
                      <button onClick={() => acceptOrder(order.id)} style={{ background: '#27ae60', border: 'none', borderRadius: 8, padding: '6px 14px', color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>✓ Kabul Et</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {msg && <div style={{ background: '#1a3a1a', border: '1px solid #2a5a2a', color: '#4CAF50', padding: '12px 20px', fontSize: 14, fontWeight: 600 }}>{msg}</div>}

        <div style={{ display: 'flex', borderBottom: '1px solid #2A2A2A' }}>
          {(isManager ? (['orders', 'categories', 'items'] as const) : (['orders'] as const)).map(t => (
            <button key={t} onClick={() => { setTab(t); if(t==='orders') loadOrders(dateFilter) }}
              style={{ flex: 1, padding: '12px 4px', background: 'transparent', border: 'none', borderBottom: tab === t ? '2px solid #C0392B' : '2px solid transparent', color: tab === t ? '#F0EDE8' : '#888', fontWeight: 700, fontSize: 12, cursor: 'pointer', position: 'relative' }}>
              {t === 'categories' ? 'Kategoriler' : t === 'items' ? 'Ürünler' : 'Siparişler'}
              {t === 'orders' && notifications.length > 0 && (
                <span style={{ position:'absolute', top:8, right:8, background:'#C0392B', color:'#fff', borderRadius:'50%', width:16, height:16, fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>{notifications.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* CATEGORIES */}
        {/* ORDERS TAB */}
        {tab === 'orders' && (
          <div style={{ padding: '16px 20px' }}>

            {/* Monthly report modal - managers only */}
            {isManager && showMonthlyReport && (
              <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,.9)', backdropFilter:'blur(6px)', display:'flex', alignItems:'flex-end' }} onClick={() => setShowMonthlyReport(null)}>
                <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:480, margin:'0 auto', background:'#141414', borderRadius:'20px 20px 0 0', maxHeight:'85vh', overflowY:'auto', border:'1px solid rgba(201,168,76,.3)', borderBottom:'none' }}>
                  <div style={{ padding:'18px 20px', borderBottom:'1px solid #2A2A2A', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                    <div style={{ color:'#C9A84C', fontWeight:800, fontSize:16 }}>📊 {showMonthlyReport.month} {showMonthlyReport.year} Raporu</div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={() => exportMonthlyReportPDF(showMonthlyReport)} style={{ background:'rgba(201,168,76,.15)', border:'1px solid rgba(201,168,76,.3)', borderRadius:8, padding:'6px 10px', color:'#C9A84C', fontSize:11, cursor:'pointer', fontWeight:700, whiteSpace:'nowrap' }}>📄 PDF İndir</button>
                      <button onClick={() => setShowMonthlyReport(null)} style={{ background:'#2A2A2A', border:'none', borderRadius:8, width:30, height:30, color:'#888', cursor:'pointer', fontSize:16 }}>✕</button>
                    </div>
                  </div>
                  <div style={{ padding:'16px 20px' }}>
                    <div style={{ display:'flex', gap:10, marginBottom:16 }}>
                      <div style={{ flex:1, background:'#1A1A1A', borderRadius:12, padding:'12px', textAlign:'center', border:'1px solid rgba(201,168,76,.2)' }}>
                        <div style={{ color:'#C9A84C', fontWeight:800, fontSize:22 }}>{showMonthlyReport.totalOrders}</div>
                        <div style={{ color:'#888', fontSize:11 }}>Sipariş</div>
                      </div>
                      <div style={{ flex:1, background:'#1A1A1A', borderRadius:12, padding:'12px', textAlign:'center', border:'1px solid rgba(201,168,76,.2)' }}>
                        <div style={{ color:'#C9A84C', fontWeight:800, fontSize:22 }}>{Number(showMonthlyReport.totalRevenue).toFixed(0)} ₺</div>
                        <div style={{ color:'#888', fontSize:11 }}>Ciro</div>
                      </div>
                    </div>
                    <div style={{ color:'#888', fontSize:11, letterSpacing:1, marginBottom:10 }}>EN ÇOK SATILAN ÜRÜNLER</div>
                    {showMonthlyReport.topItems?.slice(0,5).map((item:any, i:number) => (
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #2A2A2A', fontSize:13 }}>
                        <span style={{ color:'#F0EDE8' }}>#{i+1} {item.name}</span>
                        <span style={{ color:'#C9A84C' }}>{item.count} adet · {item.revenue} ₺</span>
                      </div>
                    ))}
                    <div style={{ color:'#888', fontSize:11, letterSpacing:1, margin:'16px 0 10px' }}>EN YÜKSEK CİROLU MASALAR</div>
                    {showMonthlyReport.topTables?.slice(0,5).map((t:any, i:number) => (
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #2A2A2A', fontSize:13 }}>
                        <span style={{ color:'#F0EDE8' }}>#{i+1} {t.name}</span>
                        <span style={{ color:'#C9A84C' }}>{t.revenue} ₺</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Table drilldown modal - tap a table on the map */}
            {activeTableModal && (() => {
              const info = getTableInfo(activeTableModal)
              const activeOrders = info.orders.filter((o:any) => o.status !== 'dismissed')
              const tabTotal = activeOrders.reduce((s:number,o:any)=>s+Number(o.total),0)
              return (
                <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,.9)', backdropFilter:'blur(6px)', display:'flex', alignItems:'flex-end' }} onClick={() => setActiveTableModal(null)}>
                  <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:480, margin:'0 auto', background:'#141414', borderRadius:'20px 20px 0 0', maxHeight:'85vh', overflowY:'auto', border:'1px solid rgba(201,168,76,.3)', borderBottom:'none' }}>
                    <div style={{ padding:'18px 20px', borderBottom:'1px solid #2A2A2A', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                      <div style={{ color:'#C9A84C', fontWeight:800, fontSize:16 }}>🪑 {activeTableModal}</div>
                      <button onClick={() => setActiveTableModal(null)} style={{ background:'#2A2A2A', border:'none', borderRadius:8, width:30, height:30, color:'#888', cursor:'pointer', fontSize:16 }}>✕</button>
                    </div>
                    <div style={{ padding:'16px 20px' }}>
                      {activeOrders.length === 0 && (
                        <div style={{ textAlign:'center', color:'#888', padding:'30px 0' }}>Bu masa şu an boş.</div>
                      )}
                      {activeOrders.map((order:any) => {
                        const statusColor = order.status==='pending'?'#C0392B':order.status==='accepted'?'#f39c12':order.status==='ready'?'#27ae60':'#888'
                        const statusLabel = order.status==='pending'?'Bekliyor':order.status==='accepted'?'Hazırlanıyor':order.status==='ready'?'Hazır':'Teslim Edildi'
                        return (
                          <div key={order.id} style={{ background:'#1A1A1A', border:'1px solid #2A2A2A', borderRadius:14, padding:'14px 16px', marginBottom:10 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                              <span style={{ background:statusColor, color:'#fff', borderRadius:6, padding:'3px 8px', fontSize:10, fontWeight:800 }}>{statusLabel}</span>
                              <span style={{ color:'#888', fontSize:11 }}>{new Date(order.created_at).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'})}</span>
                            </div>
                            {order.items?.map((item:any, i:number) => (
                              <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'rgba(240,237,232,.7)', padding:'3px 0' }}>
                                <span>{item.quantity}x {item.name}</span>
                                <span style={{ color:'#C9A84C' }}>{item.subtotal} ₺</span>
                              </div>
                            ))}
                            {order.note && (
                              <div style={{ marginTop:8, padding:'8px 10px', background:'rgba(201,168,76,.06)', border:'1px solid rgba(201,168,76,.15)', borderRadius:8, fontSize:12, color:'rgba(240,237,232,.7)' }}>📝 {order.note}</div>
                            )}
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10, paddingTop:8, borderTop:'1px solid rgba(201,168,76,.2)' }}>
                              <span style={{ color:'#C9A84C', fontWeight:800, fontSize:14 }}>{order.total} ₺</span>
                              <div style={{ display:'flex', gap:6 }}>
                                {order.status === 'pending' && <button onClick={() => updateOrderStatus(order.id, 'accepted')} style={{ background:'#27ae60', border:'none', borderRadius:8, padding:'6px 12px', color:'#fff', fontSize:11, cursor:'pointer', fontWeight:700 }}>✓ Kabul</button>}
                                {order.status === 'accepted' && <button onClick={() => updateOrderStatus(order.id, 'ready')} style={{ background:'#f39c12', border:'none', borderRadius:8, padding:'6px 12px', color:'#fff', fontSize:11, cursor:'pointer', fontWeight:700 }}>✓ Hazır</button>}
                                {order.status === 'ready' && <button onClick={() => updateOrderStatus(order.id, 'served')} style={{ background:'#2980b9', border:'none', borderRadius:8, padding:'6px 12px', color:'#fff', fontSize:11, cursor:'pointer', fontWeight:700 }}>✓ Teslim</button>}
                              </div>
                            </div>
                          </div>
                        )
                      })}

                      {activeOrders.length > 0 && (
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 2px', marginTop:6, marginBottom:16 }}>
                          <span style={{ color:'#888', fontSize:12, fontWeight:700 }}>MASA TOPLAMI</span>
                          <span style={{ color:'#C9A84C', fontWeight:800, fontSize:18 }}>{tabTotal.toFixed(0)} ₺</span>
                        </div>
                      )}

                      <button onClick={() => openAddOrder(activeTableModal)} style={{ width:'100%', background:'rgba(201,168,76,.15)', border:'1px solid rgba(201,168,76,.4)', borderRadius:10, padding:'12px', color:'#C9A84C', fontSize:13, cursor:'pointer', fontWeight:700, marginBottom:12 }}>➕ Sipariş Ekle</button>

                      {info.tabData && (
                        <div style={{ display:'flex', gap:8 }}>
                          {!info.tabData.bill_requested && (
                            <button onClick={() => requestBill(info.tabData.id)} style={{ flex:1, background:'rgba(52,152,219,.15)', border:'1px solid rgba(52,152,219,.4)', borderRadius:10, padding:'10px', color:'#3498db', fontSize:12, cursor:'pointer', fontWeight:700 }}>🧾 Hesap İstendi</button>
                          )}
                          {isManager && (
                            <button onClick={() => closeTable(info.tabData.id)} style={{ flex:1, background:'rgba(192,57,43,.15)', border:'1px solid rgba(192,57,43,.4)', borderRadius:10, padding:'10px', color:'#e74c3c', fontSize:12, cursor:'pointer', fontWeight:700 }}>Masayı Kapat</button>
                          )}
                        </div>
                      )}
                      {isManager && info.tabData && (
                        <div style={{ color:'#666', fontSize:10, marginTop:10, textAlign:'center' }}>Not: Ödeme takibi henüz yok — bu buton masayı manuel olarak boşaltır.</div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Staff order builder - punch in a walk-in/phone/verbal order */}
            {addOrderTable && (
              <div style={{ position:'fixed', inset:0, zIndex:210, background:'rgba(0,0,0,.92)', backdropFilter:'blur(6px)', display:'flex', flexDirection:'column' }}>
                <div style={{ padding:'16px 20px', borderBottom:'1px solid #2A2A2A', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ color:'#C9A84C', fontWeight:800, fontSize:15 }}>➕ {addOrderTable} — Sipariş Ekle</div>
                  <button onClick={() => { setAddOrderTable(null); setStaffCart({}) }} style={{ background:'#2A2A2A', border:'none', borderRadius:8, width:30, height:30, color:'#888', cursor:'pointer', fontSize:16 }}>✕</button>
                </div>

                <div style={{ display:'flex', gap:6, padding:'12px 16px', overflowX:'auto', borderBottom:'1px solid #2A2A2A' }}>
                  <button onClick={() => setStaffCategoryFilter(null)}
                    style={{ flexShrink:0, background: staffCategoryFilter===null ? 'rgba(201,168,76,.15)' : '#1A1A1A', border: staffCategoryFilter===null ? '1px solid rgba(201,168,76,.4)' : '1px solid #2A2A2A', borderRadius:20, padding:'7px 14px', color: staffCategoryFilter===null ? '#C9A84C' : '#888', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>Tümü</button>
                  {categories.map(cat => (
                    <button key={cat.id} onClick={() => setStaffCategoryFilter(cat.id)}
                      style={{ flexShrink:0, background: staffCategoryFilter===cat.id ? 'rgba(201,168,76,.15)' : '#1A1A1A', border: staffCategoryFilter===cat.id ? '1px solid rgba(201,168,76,.4)' : '1px solid #2A2A2A', borderRadius:20, padding:'7px 14px', color: staffCategoryFilter===cat.id ? '#C9A84C' : '#888', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>{cat.icon} {cat.name}</button>
                  ))}
                </div>

                <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))', gap:10 }}>
                    {items.filter(it => it.available && (staffCategoryFilter === null || it.category_id === staffCategoryFilter)).map(item => {
                      const qty = staffCart[item.id] || 0
                      return (
                        <div key={item.id} style={{ background:'#1A1A1A', border: qty>0 ? '1.5px solid rgba(201,168,76,.5)' : '1px solid #2A2A2A', borderRadius:12, padding:'12px 10px', display:'flex', flexDirection:'column', gap:8 }}>
                          <div>
                            <div style={{ color:'#F0EDE8', fontSize:13, fontWeight:700, marginBottom:2 }}>{item.name}</div>
                            <div style={{ color:'#C9A84C', fontSize:12, fontWeight:700 }}>{item.price} ₺</div>
                          </div>
                          {qty === 0 ? (
                            <button onClick={() => adjustStaffCart(item.id, 1)} style={{ background:'rgba(201,168,76,.15)', border:'1px solid rgba(201,168,76,.4)', borderRadius:8, padding:'8px', color:'#C9A84C', fontSize:13, fontWeight:800, cursor:'pointer' }}>+ Ekle</button>
                          ) : (
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'#0f0f0f', borderRadius:8, padding:'4px 8px' }}>
                              <button onClick={() => adjustStaffCart(item.id, -1)} style={{ background:'#2A2A2A', border:'none', borderRadius:6, width:28, height:28, color:'#fff', fontSize:16, cursor:'pointer', fontWeight:800 }}>−</button>
                              <span style={{ color:'#C9A84C', fontWeight:800, fontSize:14 }}>{qty}</span>
                              <button onClick={() => adjustStaffCart(item.id, 1)} style={{ background:'#C9A84C', border:'none', borderRadius:6, width:28, height:28, color:'#141414', fontSize:16, cursor:'pointer', fontWeight:800 }}>+</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div style={{ padding:'14px 16px', borderTop:'1px solid #2A2A2A', display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ color:'#888', fontSize:11 }}>{staffCartCount} ürün</div>
                    <div style={{ color:'#C9A84C', fontWeight:800, fontSize:18 }}>{staffCartTotal.toFixed(0)} ₺</div>
                  </div>
                  <button onClick={submitStaffOrder} disabled={staffCartCount===0}
                    style={{ background: staffCartCount===0 ? '#2A2A2A' : '#27ae60', border:'none', borderRadius:12, padding:'14px 24px', color: staffCartCount===0 ? '#666' : '#fff', fontSize:14, fontWeight:800, cursor: staffCartCount===0 ? 'not-allowed' : 'pointer' }}>Siparişi Gönder</button>
                </div>
              </div>
            )}

            {/* View toggle - table map vs flat list, both roles see this */}
            <div style={{ display:'flex', gap:6, marginBottom:14 }}>
              <button onClick={() => setViewMode('map')}
                style={{ flex:1, background: viewMode==='map' ? 'rgba(201,168,76,.15)' : '#1A1A1A', border: viewMode==='map' ? '1px solid rgba(201,168,76,.4)' : '1px solid #2A2A2A', borderRadius:10, padding:'9px 4px', color: viewMode==='map' ? '#C9A84C' : '#888', fontWeight:700, fontSize:12, cursor:'pointer' }}>🗺️ Masa Haritası</button>
              <button onClick={() => setViewMode('list')}
                style={{ flex:1, background: viewMode==='list' ? 'rgba(201,168,76,.15)' : '#1A1A1A', border: viewMode==='list' ? '1px solid rgba(201,168,76,.4)' : '1px solid #2A2A2A', borderRadius:10, padding:'9px 4px', color: viewMode==='list' ? '#C9A84C' : '#888', fontWeight:700, fontSize:12, cursor:'pointer' }}>📋 Liste</button>
            </div>

            {viewMode === 'map' && (
              <div style={{ marginBottom: 20 }}>
                {/* Legend */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:16, fontSize:10, color:'#888' }}>
                  <span>🔴 Sipariş Bekliyor</span>
                  <span>🟠 Hazırlanıyor</span>
                  <span>🟢 Hazır</span>
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
                    <div style={{ color:'#888', fontSize:11, letterSpacing:2, marginBottom:8, fontWeight:700 }}>{group.label}</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(84px, 1fr))', gap:8 }}>
                      {group.tables.map(tableName => {
                        const info = getTableInfo(tableName)
                        const palette: Record<string, { bg:string, border:string, text:string, dot:string }> = {
                          empty:     { bg:'#1A1A1A', border:'#2A2A2A', text:'#555', dot:'⚪' },
                          occupied:  { bg:'rgba(201,168,76,.10)', border:'rgba(201,168,76,.3)', text:'#C9A84C', dot:'🟡' },
                          pending:   { bg:'rgba(192,57,43,.15)', border:'#C0392B', text:'#e74c3c', dot:'🔴' },
                          preparing: { bg:'rgba(243,156,18,.15)', border:'#f39c12', text:'#f39c12', dot:'🟠' },
                          ready:     { bg:'rgba(39,174,96,.15)', border:'#27ae60', text:'#27ae60', dot:'🟢' },
                          bill:      { bg:'rgba(52,152,219,.15)', border:'#3498db', text:'#3498db', dot:'🔵' },
                        }
                        const p = palette[info.status]
                        const itemCount = info.orders.reduce((s:number,o:any)=>s + (o.status!=='dismissed' ? 1 : 0), 0)
                        return (
                          <button key={tableName} onClick={() => setActiveTableModal(tableName)}
                            style={{ background:p.bg, border:`1.5px solid ${p.border}`, borderRadius:12, padding:'10px 6px', cursor:'pointer', textAlign:'center', minHeight:64 }}>
                            <div style={{ fontSize:16 }}>{p.dot}</div>
                            <div style={{ color:p.text, fontWeight:700, fontSize:11, marginTop:2 }}>{tableName.replace(/^(MASA|KİTAPLIK|OKEY|KAHFE)-/, '')}</div>
                            {info.status !== 'empty' && <div style={{ color:'#888', fontSize:9, marginTop:2 }}>{itemCount} sipariş</div>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {viewMode === 'list' && (<>
            {/* Date filter - week/month view is manager-only */}
            {isManager && (
              <div style={{ display:'flex', gap:6, marginBottom:14 }}>
                {(['today','week','month'] as const).map(f => (
                  <button key={f} onClick={() => { setDateFilter(f); loadOrders(f) }}
                    style={{ flex:1, background: dateFilter===f ? 'rgba(201,168,76,.15)' : '#1A1A1A', border: dateFilter===f ? '1px solid rgba(201,168,76,.4)' : '1px solid #2A2A2A', borderRadius:10, padding:'8px 4px', color: dateFilter===f ? '#C9A84C' : '#888', fontWeight:700, fontSize:11, cursor:'pointer' }}>
                    {f==='today'?'Bugün':f==='week'?'Bu Hafta':'Bu Ay'}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, gap:8 }}>
              <div style={{ color:'#888', fontSize:12, letterSpacing:1 }}>{allOrders.length} SİPARİŞ</div>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => loadOrders()} style={{ background:'#2A2A2A', border:'none', borderRadius:8, padding:'6px 10px', color:'#C9A84C', fontSize:11, cursor:'pointer', fontWeight:600 }}>↻</button>
                {isManager && (
                  <>
                    <button onClick={() => resetStats(dateFilter)} style={{ background:'#2A2A2A', border:'none', borderRadius:8, padding:'6px 10px', color:'#888', fontSize:11, cursor:'pointer', fontWeight:600 }}>Sıfırla</button>
                    <button onClick={() => exportOrdersPDF()} style={{ background:'#2A2A2A', border:'none', borderRadius:8, padding:'6px 10px', color:'#C9A84C', fontSize:11, cursor:'pointer', fontWeight:600 }}>📄 PDF</button>
                    <button onClick={generateMonthlyReport} style={{ background:'rgba(201,168,76,.15)', border:'1px solid rgba(201,168,76,.3)', borderRadius:8, padding:'6px 10px', color:'#C9A84C', fontSize:11, cursor:'pointer', fontWeight:700 }}>📊 Aylık Rapor</button>
                  </>
                )}
              </div>
            </div>

            {/* Summary bar - revenue stats, managers only */}
            {isManager && allOrders.length > 0 && (
              <div style={{ background:'#1A1A1A', border:'1px solid rgba(201,168,76,.2)', borderRadius:14, padding:'14px 16px', marginBottom:16, display:'flex', justifyContent:'space-around' }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ color:'#C9A84C', fontWeight:800, fontSize:20 }}>{allOrders.length}</div>
                  <div style={{ color:'#888', fontSize:11 }}>Toplam Sipariş</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ color:'#C9A84C', fontWeight:800, fontSize:20 }}>{allOrders.filter(o=>o.status==='pending').length}</div>
                  <div style={{ color:'#888', fontSize:11 }}>Bekliyor</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ color:'#C9A84C', fontWeight:800, fontSize:20 }}>{allOrders.reduce((s:number,o:any)=>s+Number(o.total),0).toFixed(0)} ₺</div>
                  <div style={{ color:'#888', fontSize:11 }}>Ciro</div>
                </div>
              </div>
            )}

            {ordersLoading && <div style={{ textAlign:'center', color:'#888', padding:40 }}>Yükleniyor...</div>}

            {!ordersLoading && allOrders.length === 0 && (
              <div style={{ textAlign:'center', color:'#888', padding:40 }}>Bugün henüz sipariş yok</div>
            )}

            {allOrders.map((order:any) => {
              const statusColor = order.status==='pending'?'#C0392B':order.status==='accepted'?'#f39c12':order.status==='ready'?'#27ae60':'#888'
              const statusLabel = order.status==='pending'?'Bekliyor':order.status==='accepted'?'Hazırlanıyor':order.status==='ready'?'Hazır':order.status==='served'?'Teslim Edildi':'Kapatıldı'
              return (
                <div key={order.id} style={{ background:'#1A1A1A', border:`1px solid ${order.status==='pending'?'rgba(192,57,43,.4)':'#2A2A2A'}`, borderRadius:14, padding:'14px 16px', marginBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ background:statusColor, color:'#fff', borderRadius:6, padding:'3px 8px', fontSize:10, fontWeight:800 }}>{statusLabel}</span>
                      <span style={{ color:'#C9A84C', fontWeight:800, fontSize:15 }}>🪑 {order.table_name}</span>
                    </div>
                    <span style={{ color:'#888', fontSize:11 }}>{new Date(order.created_at).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'})}</span>
                  </div>

                  {order.items?.map((item:any, i:number) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'rgba(240,237,232,.7)', padding:'3px 0', borderBottom:'1px solid rgba(240,237,232,.05)' }}>
                      <span>{item.quantity}x {item.name}</span>
                      <span style={{ color:'#C9A84C' }}>{item.subtotal} ₺</span>
                    </div>
                  ))}

                  {order.note && (
                    <div style={{ marginTop:8, padding:'8px 10px', background:'rgba(201,168,76,.06)', border:'1px solid rgba(201,168,76,.15)', borderRadius:8, fontSize:12, color:'rgba(240,237,232,.7)' }}>
                      📝 {order.note}
                    </div>
                  )}

                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10, paddingTop:8, borderTop:'1px solid rgba(201,168,76,.2)' }}>
                    <span style={{ color:'#C9A84C', fontWeight:800, fontSize:14 }}>TOPLAM: {order.total} ₺</span>
                    <div style={{ display:'flex', gap:6 }}>
                      {order.status === 'pending' && (
                        <button onClick={() => updateOrderStatus(order.id, 'accepted')}
                          style={{ background:'#27ae60', border:'none', borderRadius:8, padding:'6px 12px', color:'#fff', fontSize:11, cursor:'pointer', fontWeight:700 }}>✓ Kabul</button>
                      )}
                      {order.status === 'accepted' && (
                        <button onClick={() => updateOrderStatus(order.id, 'ready')}
                          style={{ background:'#f39c12', border:'none', borderRadius:8, padding:'6px 12px', color:'#fff', fontSize:11, cursor:'pointer', fontWeight:700 }}>✓ Hazır</button>
                      )}
                      {order.status === 'ready' && (
                        <button onClick={() => updateOrderStatus(order.id, 'served')}
                          style={{ background:'#2980b9', border:'none', borderRadius:8, padding:'6px 12px', color:'#fff', fontSize:11, cursor:'pointer', fontWeight:700 }}>✓ Teslim</button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            </>)}
          </div>
        )}

        {isManager && tab === 'categories' && (
          <div style={s.section}>
            <div style={{ background: '#1A1A1A', borderRadius: 16, padding: 16, border: '1px solid #2A2A2A', marginBottom: 20 }}>
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
            <div style={{ color: '#888', fontSize: 12, marginBottom: 12, letterSpacing: 1 }}>MEVCUT KATEGORİLER ({categories.length}) — ⠿ Sürükle ile sırala</div>
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
                      <div style={{ color: '#888', fontSize: 12 }}>{items.filter(i => i.category_id === cat.id).length} ürün · #{idx + 1}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setEditingCat(cat); setCatName(cat.name); setCatIcon(cat.icon || '') }} style={{ background: '#2A2A2A', border: 'none', borderRadius: 8, padding: '6px 12px', color: '#C9A84C', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Düzenle</button>
                    <button onClick={() => deleteCategory(cat.id)} style={{ background: '#2A2A2A', border: 'none', borderRadius: 8, padding: '6px 12px', color: '#C0392B', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Sil</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ITEMS */}
        {isManager && tab === 'items' && (
          <div style={s.section}>
            <div style={{ background: '#1A1A1A', borderRadius: 16, padding: 16, border: '1px solid #2A2A2A', marginBottom: 20 }}>
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
                  <img src={croppedPreview} alt="önizleme" style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 10, border: '2px solid #C9A84C' }} />
                  <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
                    {rawImageSrc && <button onClick={() => setShowCropper(true)} style={{ background: '#C9A84C', border: 'none', borderRadius: 8, padding: '6px 10px', color: '#1A0E06', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>✂️ Düzenle</button>}
                    <button onClick={() => { setCroppedPreview(''); setCroppedBlob(null); setExistingImageUrl('') }} style={{ background: '#C0392B', border: 'none', borderRadius: 8, padding: '6px 10px', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>✕ Sil</button>
                  </div>
                  <div style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(0,0,0,0.7)', borderRadius: 6, padding: '4px 8px', fontSize: 10, color: '#C9A84C' }}>
                    {croppedBlob ? '✓ Kırpıldı' : '📷 Mevcut fotoğraf'}
                  </div>
                </div>
              ) : null}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <input type="checkbox" id="avail" checked={itemAvail} onChange={e => setItemAvail(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#C0392B' }} />
                <label htmlFor="avail" style={{ color: '#F0EDE8', fontSize: 14, cursor: 'pointer' }}>Satışta (aktif)</label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, background: itemRec ? 'rgba(201,168,76,.08)' : 'transparent', border: itemRec ? '1px solid rgba(201,168,76,.3)' : '1px solid #2A2A2A', borderRadius: 10, padding: '10px 12px' }}>
                <input type="checkbox" id="rec" checked={itemRec} onChange={e => setItemRec(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#C9A84C' }} />
                <label htmlFor="rec" style={{ color: '#C9A84C', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>⭐ Öne Çıkan (Önerilen)</label>
              </div>

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
              <div style={{ color: '#888', fontSize: 12, letterSpacing: 1 }}>
                {items.filter(i => !filterCat || i.category_id === filterCat).length} ÜRÜN
                {selectedItems.size > 0 && <span style={{ color: '#C9A84C', marginLeft: 8 }}>· {selectedItems.size} seçildi</span>}
              </div>
              <button onClick={() => { setBulkMode(!bulkMode); setSelectedItems(new Set()) }}
                style={{ background: bulkMode ? 'rgba(201,168,76,.15)' : '#2A2A2A', border: bulkMode ? '1px solid rgba(201,168,76,.4)' : 'none', borderRadius: 8, padding: '6px 12px', color: bulkMode ? '#C9A84C' : '#888', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                {bulkMode ? '✕ İptal' : '↔ Toplu Taşı'}
              </button>
            </div>

            {/* Bulk move action bar */}
            {bulkMode && selectedItems.size > 0 && (
              <div style={{ background: '#1A1A1A', border: '1px solid rgba(201,168,76,.3)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
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
                      <div style={{ width: 24, height: 24, borderRadius: 6, border: isSelected ? 'none' : '2px solid #3A3A3A', background: isSelected ? '#C9A84C' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>
                        {isSelected && '✓'}
                      </div>
                    )}
                    <div style={{ width: 60, height: 60, borderRadius: 10, overflow: 'hidden', background: '#2A2A2A', flexShrink: 0 }}>
                      {item.image_url
                        ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 22 }}>📷</div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{item.recommended && <span style={{ marginRight: 4 }}>⭐</span>}{item.name}</div>
                      <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>{cat?.name || '—'}</div>
                      <div style={{ color: '#C9A84C', fontWeight: 800, fontSize: 14 }}>{item.price} ₺</div>
                    </div>
                    {!bulkMode && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button onClick={() => startEditItem(item)} style={{ background: '#2A2A2A', border: 'none', borderRadius: 7, padding: '6px 10px', color: '#C9A84C', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Düzenle</button>
                      <button onClick={async () => { await supabase.from('menu_items').update({ recommended: !item.recommended }).eq('id', item.id); await loadData() }} style={{ background: item.recommended ? 'rgba(201,168,76,.2)' : '#2A2A2A', border: 'none', borderRadius: 7, padding: '6px 10px', color: item.recommended ? '#C9A84C' : '#888', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>{item.recommended ? '⭐ Öne Çıkan' : 'Öne Çıkar'}</button>
                      <button onClick={() => deleteItem(item.id)} style={{ background: '#2A2A2A', border: 'none', borderRadius: 7, padding: '6px 10px', color: '#C0392B', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Sil</button>
                    </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
