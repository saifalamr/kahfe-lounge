'use client'
import { useEffect, useState } from 'react'
import { supabase, Category, MenuItem } from '@/lib/supabase'

const ADMIN_PASSWORD = 'kahfe2024admin'

export default function AdminPage() {
  const [auth, setAuth] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)
  const [tab, setTab] = useState<'categories' | 'items'>('categories')
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  // Category form
  const [catName, setCatName] = useState('')
  const [catIcon, setCatIcon] = useState('')
  const [editingCat, setEditingCat] = useState<Category | null>(null)

  // Item form
  const [itemName, setItemName] = useState('')
  const [itemDesc, setItemDesc] = useState('')
  const [itemPrice, setItemPrice] = useState('')
  const [itemCat, setItemCat] = useState('')
  const [itemImage, setItemImage] = useState<File | null>(null)
  const [itemAvail, setItemAvail] = useState(true)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [imagePreview, setImagePreview] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('kahfe_admin')
    if (saved === ADMIN_PASSWORD) setAuth(true)
  }, [])

  useEffect(() => {
    if (auth) loadData()
  }, [auth])

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
      localStorage.setItem('kahfe_admin', pw)
      setAuth(true)
    } else {
      setPwError(true)
    }
  }

  function showMsg(m: string) {
    setMsg(m)
    setTimeout(() => setMsg(''), 3000)
  }

  // CATEGORY CRUD
  async function saveCategory() {
    if (!catName.trim()) return
    setLoading(true)
    if (editingCat) {
      await supabase.from('categories').update({ name: catName, icon: catIcon }).eq('id', editingCat.id)
      showMsg('Kategori güncellendi ✓')
      setEditingCat(null)
    } else {
      const maxOrder = categories.length ? Math.max(...categories.map(c => c.order_index)) + 1 : 0
      await supabase.from('categories').insert({ name: catName, icon: catIcon, order_index: maxOrder })
      showMsg('Kategori eklendi ✓')
    }
    setCatName(''); setCatIcon('')
    await loadData()
    setLoading(false)
  }

  async function deleteCategory(id: string) {
    if (!confirm('Bu kategoriyi silmek istediğinizden emin misiniz?')) return
    await supabase.from('categories').delete().eq('id', id)
    showMsg('Kategori silindi')
    await loadData()
  }

  function startEditCat(cat: Category) {
    setEditingCat(cat); setCatName(cat.name); setCatIcon(cat.icon || '')
  }

  // ITEM CRUD
  async function uploadImage(file: File): Promise<string> {
    const ext = file.name.split('.').pop()
    const path = `items/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('menu-images').upload(path, file, { upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from('menu-images').getPublicUrl(path)
    return data.publicUrl
  }

  async function saveItem() {
    if (!itemName.trim() || !itemPrice || !itemCat) { showMsg('Ad, fiyat ve kategori zorunludur'); return }
    setLoading(true)
    try {
      let imageUrl = editingItem?.image_url || ''
      if (itemImage) imageUrl = await uploadImage(itemImage)

      if (editingItem) {
        await supabase.from('menu_items').update({
          name: itemName, description: itemDesc, price: parseFloat(itemPrice),
          category_id: itemCat, image_url: imageUrl, available: itemAvail
        }).eq('id', editingItem.id)
        showMsg('Ürün güncellendi ✓')
        setEditingItem(null)
      } else {
        const maxOrder = items.length ? Math.max(...items.map(i => i.order_index)) + 1 : 0
        await supabase.from('menu_items').insert({
          name: itemName, description: itemDesc, price: parseFloat(itemPrice),
          category_id: itemCat, image_url: imageUrl, available: itemAvail, order_index: maxOrder
        })
        showMsg('Ürün eklendi ✓')
      }
      resetItemForm()
      await loadData()
    } catch (e) {
      showMsg('Hata: ' + (e as Error).message)
    }
    setLoading(false)
  }

  async function deleteItem(id: string) {
    if (!confirm('Bu ürünü silmek istediğinizden emin misiniz?')) return
    await supabase.from('menu_items').delete().eq('id', id)
    showMsg('Ürün silindi')
    await loadData()
  }

  async function toggleAvail(item: MenuItem) {
    await supabase.from('menu_items').update({ available: !item.available }).eq('id', item.id)
    await loadData()
  }

  function startEditItem(item: MenuItem) {
    setEditingItem(item); setItemName(item.name); setItemDesc(item.description || '');
    setItemPrice(item.price.toString()); setItemCat(item.category_id); setItemAvail(item.available)
    setImagePreview(item.image_url || ''); setItemImage(null)
  }

  function resetItemForm() {
    setItemName(''); setItemDesc(''); setItemPrice(''); setItemCat(''); setItemImage(null); setItemAvail(true); setEditingItem(null); setImagePreview('')
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setItemImage(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const s = {
    page: { background: '#0D0D0D', minHeight: '100vh', maxWidth: 480, margin: '0 auto', padding: '0 0 40px' } as React.CSSProperties,
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
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={{ color: '#C9A84C', fontSize: 10, letterSpacing: 3 }}>YÖNETİM</div>
          <div style={{ color: '#F0EDE8', fontSize: 18, fontWeight: 800 }}>KAHFE LOUNGE</div>
        </div>
        <button onClick={() => { localStorage.removeItem('kahfe_admin'); setAuth(false) }} style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: 8, padding: '6px 12px', color: '#888', fontSize: 12, cursor: 'pointer' }}>Çıkış</button>
      </div>

      {msg && <div style={{ background: '#1a3a1a', border: '1px solid #2a5a2a', color: '#4CAF50', padding: '12px 20px', fontSize: 14, fontWeight: 600 }}>{msg}</div>}

      {/* TABS */}
      <div style={{ display: 'flex', borderBottom: '1px solid #2A2A2A' }}>
        {(['categories', 'items'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '14px', background: 'transparent', border: 'none', borderBottom: tab === t ? '2px solid #C0392B' : '2px solid transparent', color: tab === t ? '#F0EDE8' : '#888', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            {t === 'categories' ? 'Kategoriler' : 'Ürünler'}
          </button>
        ))}
      </div>

      {/* CATEGORIES TAB */}
      {tab === 'categories' && (
        <div style={s.section}>
          <div style={{ background: '#1A1A1A', borderRadius: 16, padding: 16, border: '1px solid #2A2A2A', marginBottom: 20 }}>
            <div style={{ color: '#C9A84C', fontSize: 11, letterSpacing: 2, fontWeight: 700, marginBottom: 14 }}>
              {editingCat ? 'KATEGORİ DÜZENLE' : 'YENİ KATEGORİ EKLE'}
            </div>
            <label style={s.label}>KATEGORİ ADI *</label>
            <input value={catName} onChange={e => setCatName(e.target.value)} style={{ ...s.input, marginBottom: 12 }} placeholder="örn. Kahveler" />
            <label style={s.label}>EMOJİ / İKON (opsiyonel)</label>
            <input value={catIcon} onChange={e => setCatIcon(e.target.value)} style={{ ...s.input, marginBottom: 16 }} placeholder="örn. ☕" />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveCategory} disabled={loading} style={{ ...s.btn, flex: 1 }}>{loading ? 'Kaydediliyor...' : editingCat ? 'Güncelle' : 'Ekle'}</button>
              {editingCat && <button onClick={() => { setEditingCat(null); setCatName(''); setCatIcon('') }} style={s.btnSecondary}>İptal</button>}
            </div>
          </div>

          <div style={{ color: '#888', fontSize: 12, marginBottom: 12, letterSpacing: 1 }}>MEVCUT KATEGORİLER ({categories.length})</div>
          {categories.map(cat => (
            <div key={cat.id} style={s.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {cat.icon && <span style={{ fontSize: 22 }}>{cat.icon}</span>}
                  <div>
                    <div style={{ color: '#F0EDE8', fontWeight: 700 }}>{cat.name}</div>
                    <div style={{ color: '#888', fontSize: 12 }}>{items.filter(i => i.category_id === cat.id).length} ürün</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => startEditCat(cat)} style={{ background: '#2A2A2A', border: 'none', borderRadius: 8, padding: '6px 12px', color: '#C9A84C', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Düzenle</button>
                  <button onClick={() => deleteCategory(cat.id)} style={{ background: '#2A2A2A', border: 'none', borderRadius: 8, padding: '6px 12px', color: '#C0392B', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Sil</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ITEMS TAB */}
      {tab === 'items' && (
        <div style={s.section}>
          <div style={{ background: '#1A1A1A', borderRadius: 16, padding: 16, border: '1px solid #2A2A2A', marginBottom: 20 }}>
            <div style={{ color: '#C9A84C', fontSize: 11, letterSpacing: 2, fontWeight: 700, marginBottom: 14 }}>
              {editingItem ? 'ÜRÜN DÜZENLE' : 'YENİ ÜRÜN EKLE'}
            </div>

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
            <input type="file" accept="image/*" onChange={handleImageChange} style={{ ...s.input, marginBottom: 12, padding: '10px 14px' }} />
            {imagePreview && <img src={imagePreview} alt="önizleme" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 10, marginBottom: 12 }} />}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <input type="checkbox" id="avail" checked={itemAvail} onChange={e => setItemAvail(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#C0392B' }} />
              <label htmlFor="avail" style={{ color: '#F0EDE8', fontSize: 14, cursor: 'pointer' }}>Satışta (aktif)</label>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveItem} disabled={loading} style={{ ...s.btn, flex: 1 }}>{loading ? 'Kaydediliyor...' : editingItem ? 'Güncelle' : 'Ekle'}</button>
              {editingItem && <button onClick={resetItemForm} style={s.btnSecondary}>İptal</button>}
            </div>
          </div>

          <div style={{ color: '#888', fontSize: 12, marginBottom: 12, letterSpacing: 1 }}>MEVCUT ÜRÜNLER ({items.length})</div>
          {items.map(item => {
            const cat = categories.find(c => c.id === item.category_id)
            return (
              <div key={item.id} style={{ ...s.card, opacity: item.available ? 1 : 0.5 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', background: '#2A2A2A', flexShrink: 0 }}>
                    {item.image_url ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>☕</div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{item.name}</div>
                    <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>{cat?.name || '—'}</div>
                    <div style={{ color: '#C9A84C', fontWeight: 800, fontSize: 14 }}>{item.price} ₺</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button onClick={() => startEditItem(item)} style={{ background: '#2A2A2A', border: 'none', borderRadius: 7, padding: '5px 10px', color: '#C9A84C', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Düzenle</button>
                    <button onClick={() => toggleAvail(item)} style={{ background: '#2A2A2A', border: 'none', borderRadius: 7, padding: '5px 10px', color: item.available ? '#4CAF50' : '#888', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>{item.available ? 'Aktif' : 'Pasif'}</button>
                    <button onClick={() => deleteItem(item.id)} style={{ background: '#2A2A2A', border: 'none', borderRadius: 7, padding: '5px 10px', color: '#C0392B', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Sil</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
