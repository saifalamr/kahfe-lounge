'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, Category, MenuItem } from '@/lib/supabase'

const ADMIN_PASSWORD = 'kahfe2024admin'

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
      .subscribe()

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
  const [showMonthlyReport, setShowMonthlyReport] = useState<any>(null)
  const [dateFilter, setDateFilter] = useState<'today'|'week'|'month'>('today')

  async function loadOrders(filter: 'today'|'week'|'month' = dateFilter) {
    setOrdersLoading(true)
    const now = new Date()
    let fromDate = ''
    if (filter === 'today') {
      fromDate = now.toISOString().split('T')[0]
    } else if (filter === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - 7)
      fromDate = d.toISOString()
    } else {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    }
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

  async function resetDailyStats() {
    if (!confirm('Bugünün istatistiklerini sıfırlamak istediğinizden emin misiniz?\n\nVeriler silinmez, sadece görünüm sıfırlanır.')) return
    await loadOrders()
    showMsg('İstatistikler yenilendi ✓')
  }

  useEffect(() => { if (auth) loadOrders() }, [auth])
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
    const saved = localStorage.getItem('kahfe_admin')
    if (saved === ADMIN_PASSWORD) setAuth(true)
  }, [])

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
    if (pw === ADMIN_PASSWORD) { localStorage.setItem('kahfe_admin', pw); setAuth(true) }
    else setPwError(true)
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
            <button onClick={() => { localStorage.removeItem('kahfe_admin'); setAuth(false) }} style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: 8, padding: '6px 12px', color: '#888', fontSize: 12, cursor: 'pointer' }}>Çıkış</button>
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
          {(['orders', 'categories', 'items'] as const).map(t => (
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

            {/* Monthly report modal */}
            {showMonthlyReport && (
              <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,.9)', backdropFilter:'blur(6px)', display:'flex', alignItems:'flex-end' }} onClick={() => setShowMonthlyReport(null)}>
                <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:480, margin:'0 auto', background:'#141414', borderRadius:'20px 20px 0 0', maxHeight:'85vh', overflowY:'auto', border:'1px solid rgba(201,168,76,.3)', borderBottom:'none' }}>
                  <div style={{ padding:'18px 20px', borderBottom:'1px solid #2A2A2A', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ color:'#C9A84C', fontWeight:800, fontSize:16 }}>📊 {showMonthlyReport.month} {showMonthlyReport.year} Raporu</div>
                    <button onClick={() => setShowMonthlyReport(null)} style={{ background:'#2A2A2A', border:'none', borderRadius:8, width:30, height:30, color:'#888', cursor:'pointer', fontSize:16 }}>✕</button>
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

            {/* Date filter */}
            <div style={{ display:'flex', gap:6, marginBottom:14 }}>
              {(['today','week','month'] as const).map(f => (
                <button key={f} onClick={() => { setDateFilter(f); loadOrders(f) }}
                  style={{ flex:1, background: dateFilter===f ? 'rgba(201,168,76,.15)' : '#1A1A1A', border: dateFilter===f ? '1px solid rgba(201,168,76,.4)' : '1px solid #2A2A2A', borderRadius:10, padding:'8px 4px', color: dateFilter===f ? '#C9A84C' : '#888', fontWeight:700, fontSize:11, cursor:'pointer' }}>
                  {f==='today'?'Bugün':f==='week'?'Bu Hafta':'Bu Ay'}
                </button>
              ))}
            </div>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, gap:8 }}>
              <div style={{ color:'#888', fontSize:12, letterSpacing:1 }}>{allOrders.length} SİPARİŞ</div>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => loadOrders()} style={{ background:'#2A2A2A', border:'none', borderRadius:8, padding:'6px 10px', color:'#C9A84C', fontSize:11, cursor:'pointer', fontWeight:600 }}>↻</button>
                <button onClick={resetDailyStats} style={{ background:'#2A2A2A', border:'none', borderRadius:8, padding:'6px 10px', color:'#888', fontSize:11, cursor:'pointer', fontWeight:600 }}>Sıfırla</button>
                <button onClick={generateMonthlyReport} style={{ background:'rgba(201,168,76,.15)', border:'1px solid rgba(201,168,76,.3)', borderRadius:8, padding:'6px 10px', color:'#C9A84C', fontSize:11, cursor:'pointer', fontWeight:700 }}>📊 Aylık Rapor</button>
              </div>
            </div>

            {/* Summary bar */}
            {allOrders.length > 0 && (
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
                        <button onClick={async()=>{ await supabase.from('orders').update({status:'accepted'}).eq('id',order.id); loadOrders(); setNotifications(prev=>prev.filter(n=>n.id!==order.id)) }}
                          style={{ background:'#27ae60', border:'none', borderRadius:8, padding:'6px 12px', color:'#fff', fontSize:11, cursor:'pointer', fontWeight:700 }}>✓ Kabul</button>
                      )}
                      {order.status === 'accepted' && (
                        <button onClick={async()=>{ await supabase.from('orders').update({status:'ready'}).eq('id',order.id); loadOrders() }}
                          style={{ background:'#f39c12', border:'none', borderRadius:8, padding:'6px 12px', color:'#fff', fontSize:11, cursor:'pointer', fontWeight:700 }}>✓ Hazır</button>
                      )}
                      {order.status === 'ready' && (
                        <button onClick={async()=>{ await supabase.from('orders').update({status:'served'}).eq('id',order.id); loadOrders() }}
                          style={{ background:'#2980b9', border:'none', borderRadius:8, padding:'6px 12px', color:'#fff', fontSize:11, cursor:'pointer', fontWeight:700 }}>✓ Teslim</button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'categories' && (
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
        {tab === 'items' && (
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
