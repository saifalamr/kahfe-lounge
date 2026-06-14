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
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)
  const [tab, setTab] = useState<'categories' | 'items'>('categories')
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [filterCat, setFilterCat] = useState('')

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
        await supabase.from('menu_items').update({ name: itemName, description: itemDesc, price: parseFloat(itemPrice), category_id: itemCat, image_url: imageUrl, available: itemAvail }).eq('id', editingItem.id)
        showMsg('Ürün güncellendi ✓'); setEditingItem(null)
      } else {
        const maxOrder = items.length ? Math.max(...items.map(i => i.order_index)) + 1 : 0
        await supabase.from('menu_items').insert({ name: itemName, description: itemDesc, price: parseFloat(itemPrice), category_id: itemCat, image_url: imageUrl, available: itemAvail, order_index: maxOrder })
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

  async function toggleAvail(item: MenuItem) {
    await supabase.from('menu_items').update({ available: !item.available }).eq('id', item.id)
    await loadData()
  }

  function startEditItem(item: MenuItem) {
    setEditingItem(item); setItemName(item.name); setItemDesc(item.description || '')
    setItemPrice(item.price.toString()); setItemCat(item.category_id); setItemAvail(item.available)
    setExistingImageUrl(item.image_url || ''); setCroppedBlob(null); setCroppedPreview(item.image_url || '')
    setRawImageSrc(''); setShowCropper(false)
  }

  function resetItemForm() {
    setItemName(''); setItemDesc(''); setItemPrice(''); setItemCat(''); setItemAvail(true)
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

      <div style={s.page}>
        <div style={s.header}>
          <div>
            <div style={{ color: '#C9A84C', fontSize: 10, letterSpacing: 3 }}>YÖNETİM</div>
            <div style={{ color: '#F0EDE8', fontSize: 18, fontWeight: 800 }}>KAHFE LOUNGE</div>
          </div>
          <button onClick={() => { localStorage.removeItem('kahfe_admin'); setAuth(false) }} style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: 8, padding: '6px 12px', color: '#888', fontSize: 12, cursor: 'pointer' }}>Çıkış</button>
        </div>

        {msg && <div style={{ background: '#1a3a1a', border: '1px solid #2a5a2a', color: '#4CAF50', padding: '12px 20px', fontSize: 14, fontWeight: 600 }}>{msg}</div>}

        <div style={{ display: 'flex', borderBottom: '1px solid #2A2A2A' }}>
          {(['categories', 'items'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: 14, background: 'transparent', border: 'none', borderBottom: tab === t ? '2px solid #C0392B' : '2px solid transparent', color: tab === t ? '#F0EDE8' : '#888', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              {t === 'categories' ? 'Kategoriler' : 'Ürünler'}
            </button>
          ))}
        </div>

        {/* CATEGORIES */}
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

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <input type="checkbox" id="avail" checked={itemAvail} onChange={e => setItemAvail(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#C0392B' }} />
                <label htmlFor="avail" style={{ color: '#F0EDE8', fontSize: 14, cursor: 'pointer' }}>Satışta (aktif)</label>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveItem} disabled={loading} style={{ ...s.btn, flex: 1 }}>{loading ? 'Kaydediliyor...' : editingItem ? 'Güncelle' : 'Ekle'}</button>
                {editingItem && <button onClick={resetItemForm} style={s.btnSecondary}>İptal</button>}
              </div>
            </div>

            {/* Filter */}
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...s.input, marginBottom: 14 }}>
              <option value="">Tüm Kategoriler ({items.length})</option>
              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.icon} {cat.name} ({items.filter(i => i.category_id === cat.id).length})</option>)}
            </select>

            <div style={{ color: '#888', fontSize: 12, marginBottom: 12, letterSpacing: 1 }}>
              {items.filter(i => !filterCat || i.category_id === filterCat).length} ÜRÜN GÖSTERİLİYOR
            </div>

            {items.filter(i => !filterCat || i.category_id === filterCat).map(item => {
              const cat = categories.find(c => c.id === item.category_id)
              return (
                <div key={item.id} style={{ ...s.card, opacity: item.available ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 60, height: 60, borderRadius: 10, overflow: 'hidden', background: '#2A2A2A', flexShrink: 0 }}>
                      {item.image_url
                        ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 22 }}>📷</div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{item.name}</div>
                      <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>{cat?.name || '—'}</div>
                      <div style={{ color: '#C9A84C', fontWeight: 800, fontSize: 14 }}>{item.price} ₺</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button onClick={() => startEditItem(item)} style={{ background: '#2A2A2A', border: 'none', borderRadius: 7, padding: '6px 10px', color: '#C9A84C', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Düzenle</button>
                      <button onClick={() => toggleAvail(item)} style={{ background: '#2A2A2A', border: 'none', borderRadius: 7, padding: '6px 10px', color: item.available ? '#4CAF50' : '#888', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>{item.available ? 'Aktif' : 'Pasif'}</button>
                      <button onClick={() => deleteItem(item.id)} style={{ background: '#2A2A2A', border: 'none', borderRadius: 7, padding: '6px 10px', color: '#C0392B', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Sil</button>
                    </div>
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
