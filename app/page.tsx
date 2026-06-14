'use client'
import { useEffect, useState } from 'react'
import { supabase, Category, MenuItem } from '@/lib/supabase'

type CartItem = MenuItem & { quantity: number }

export default function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  const [showCart, setShowCart] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: cats }, { data: its }] = await Promise.all([
        supabase.from('categories').select('*').order('order_index'),
        supabase.from('menu_items').select('*').eq('available', true).order('order_index'),
      ])
      setCategories(cats || [])
      setItems(its || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = activeCategory === 'all' ? items : items.filter(i => i.category_id === activeCategory)
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0)
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0)

  function addToCart(item: MenuItem) {
    setCart(prev => {
      const ex = prev.find(i => i.id === item.id)
      if (ex) return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { ...item, quantity: 1 }]
    })
  }

  function updateQty(id: string, delta: number) {
    setCart(prev => {
      const updated = prev.map(i => i.id === id ? { ...i, quantity: i.quantity + delta } : i).filter(i => i.quantity > 0)
      return updated
    })
  }

  function getQty(id: string) {
    return cart.find(i => i.id === id)?.quantity || 0
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0D0D0D' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#C9A84C', fontSize: 28, fontWeight: 700, letterSpacing: 3, marginBottom: 8 }}>KAHFE</div>
        <div style={{ color: '#888', fontSize: 13 }}>Menü yükleniyor...</div>
      </div>
    </div>
  )

  return (
    <div style={{ background: '#0D0D0D', minHeight: '100vh', maxWidth: 480, margin: '0 auto', position: 'relative' }}>
      {/* HEADER */}
      <div style={{ background: '#0D0D0D', borderBottom: '1px solid #2A2A2A', padding: '16px 20px', position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: '#C9A84C', fontSize: 10, letterSpacing: 4, fontWeight: 600 }}>COFFEE</div>
          <div style={{ color: '#F0EDE8', fontSize: 20, fontWeight: 800, letterSpacing: 2, lineHeight: 1 }}>KAHFE LOUNGE</div>
        </div>
        <button onClick={() => setShowCart(true)} style={{ position: 'relative', background: '#C0392B', border: 'none', borderRadius: 12, padding: '10px 16px', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          🛒 Sipariş
          {cartCount > 0 && <span style={{ background: '#C9A84C', color: '#0D0D0D', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{cartCount}</span>}
        </button>
      </div>

      {/* CATEGORY TABS */}
      <div style={{ overflowX: 'auto', padding: '12px 20px', display: 'flex', gap: 8, scrollbarWidth: 'none', borderBottom: '1px solid #1A1A1A' }}>
        <button
          onClick={() => setActiveCategory('all')}
          style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: activeCategory === 'all' ? '#C0392B' : '#1A1A1A', color: activeCategory === 'all' ? '#fff' : '#888', transition: 'all 0.2s' }}
        >
          Tümü
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: activeCategory === cat.id ? '#C0392B' : '#1A1A1A', color: activeCategory === cat.id ? '#fff' : '#888', transition: 'all 0.2s' }}
          >
            {cat.icon && <span style={{ marginRight: 4 }}>{cat.icon}</span>}{cat.name}
          </button>
        ))}
      </div>

      {/* ITEMS GRID */}
      <div style={{ padding: '16px 16px 120px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {filtered.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#888', padding: 40 }}>Bu kategoride henüz ürün yok.</div>
        )}
        {filtered.map(item => {
          const qty = getQty(item.id)
          return (
            <div key={item.id} style={{ background: '#1A1A1A', borderRadius: 16, overflow: 'hidden', border: qty > 0 ? '1px solid #C9A84C' : '1px solid #2A2A2A', cursor: 'pointer', transition: 'all 0.2s' }}
              onClick={() => setSelectedItem(item)}>
              <div style={{ width: '100%', height: 130, background: '#2A2A2A', overflow: 'hidden' }}>
                {item.image_url
                  ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>☕</div>
                }
              </div>
              <div style={{ padding: '10px 10px 12px' }}>
                <div style={{ color: '#F0EDE8', fontSize: 13, fontWeight: 700, marginBottom: 4, lineHeight: 1.3 }}>{item.name}</div>
                <div style={{ color: '#C9A84C', fontSize: 15, fontWeight: 800, marginBottom: 8 }}>{item.price} ₺</div>
                {qty === 0 ? (
                  <button onClick={e => { e.stopPropagation(); addToCart(item) }}
                    style={{ width: '100%', background: '#C0392B', border: 'none', borderRadius: 8, padding: '7px 0', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    + Ekle
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#2A2A2A', borderRadius: 8, padding: '4px 8px' }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => updateQty(item.id, -1)} style={{ background: '#C0392B', border: 'none', color: '#fff', width: 26, height: 26, borderRadius: 6, cursor: 'pointer', fontWeight: 800, fontSize: 16 }}>−</button>
                    <span style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 14 }}>{qty}</span>
                    <button onClick={() => updateQty(item.id, 1)} style={{ background: '#C0392B', border: 'none', color: '#fff', width: 26, height: 26, borderRadius: 6, cursor: 'pointer', fontWeight: 800, fontSize: 16 }}>+</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* FLOATING CART BUTTON */}
      {cartCount > 0 && !showCart && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 40, width: 'calc(100% - 32px)', maxWidth: 448 }}>
          <button onClick={() => setShowCart(true)} style={{ width: '100%', background: '#C0392B', border: 'none', borderRadius: 16, padding: '16px 24px', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 24px rgba(192,57,43,0.4)' }}>
            <span style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, padding: '2px 10px', fontSize: 14 }}>{cartCount} ürün</span>
            <span>Siparişi Görüntüle</span>
            <span style={{ color: '#C9A84C', fontWeight: 800 }}>{total.toFixed(2)} ₺</span>
          </button>
        </div>
      )}

      {/* ITEM DETAIL MODAL */}
      {selectedItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 60, display: 'flex', alignItems: 'flex-end', maxWidth: 480, margin: '0 auto' }} onClick={() => setSelectedItem(null)}>
          <div style={{ background: '#1A1A1A', borderRadius: '24px 24px 0 0', width: '100%', overflow: 'hidden', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            {selectedItem.image_url
              ? <img src={selectedItem.image_url} alt={selectedItem.name} style={{ width: '100%', height: 240, objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: 180, background: '#2A2A2A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64 }}>☕</div>
            }
            <div style={{ padding: '20px 24px 32px' }}>
              <div style={{ color: '#F0EDE8', fontSize: 22, fontWeight: 800, marginBottom: 6 }}>{selectedItem.name}</div>
              {selectedItem.description && <div style={{ color: '#888', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>{selectedItem.description}</div>}
              <div style={{ color: '#C9A84C', fontSize: 26, fontWeight: 800, marginBottom: 20 }}>{selectedItem.price} ₺</div>
              {getQty(selectedItem.id) === 0 ? (
                <button onClick={() => { addToCart(selectedItem); setSelectedItem(null) }}
                  style={{ width: '100%', background: '#C0392B', border: 'none', borderRadius: 14, padding: '16px', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>
                  Siparişe Ekle
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#2A2A2A', borderRadius: 14, padding: '8px 16px' }}>
                  <button onClick={() => updateQty(selectedItem.id, -1)} style={{ background: '#C0392B', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 20 }}>−</button>
                  <span style={{ color: '#F0EDE8', fontWeight: 800, fontSize: 20 }}>{getQty(selectedItem.id)}</span>
                  <button onClick={() => updateQty(selectedItem.id, 1)} style={{ background: '#C0392B', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 20 }}>+</button>
                </div>
              )}
              <button onClick={() => setSelectedItem(null)} style={{ width: '100%', background: 'transparent', border: '1px solid #2A2A2A', borderRadius: 14, padding: '12px', color: '#888', fontWeight: 600, fontSize: 14, cursor: 'pointer', marginTop: 12 }}>Kapat</button>
            </div>
          </div>
        </div>
      )}

      {/* CART / ORDER SUMMARY MODAL */}
      {showCart && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 70, display: 'flex', alignItems: 'flex-end', maxWidth: 480, margin: '0 auto' }}>
          <div style={{ background: '#1A1A1A', borderRadius: '24px 24px 0 0', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #2A2A2A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#C9A84C', fontSize: 11, letterSpacing: 3, fontWeight: 600 }}>SİPARİŞ ÖZETİ</div>
                <div style={{ color: '#F0EDE8', fontSize: 18, fontWeight: 800 }}>Siparişiniz</div>
              </div>
              <button onClick={() => setShowCart(false)} style={{ background: '#2A2A2A', border: 'none', color: '#888', borderRadius: 10, width: 36, height: 36, cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            {cart.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Henüz ürün eklenmedi.</div>
            ) : (
              <>
                <div style={{ padding: '16px 24px' }}>
                  {cart.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #2A2A2A' }}>
                      <div style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', background: '#2A2A2A', flexShrink: 0 }}>
                        {item.image_url ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>☕</div>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#F0EDE8', fontWeight: 700, fontSize: 14 }}>{item.name}</div>
                        <div style={{ color: '#C9A84C', fontWeight: 700, fontSize: 13 }}>{item.price} ₺</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={() => updateQty(item.id, -1)} style={{ background: '#C0392B', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: 7, cursor: 'pointer', fontWeight: 800, fontSize: 16 }}>−</button>
                        <span style={{ color: '#F0EDE8', fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{item.quantity}</span>
                        <button onClick={() => updateQty(item.id, 1)} style={{ background: '#C0392B', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: 7, cursor: 'pointer', fontWeight: 800, fontSize: 16 }}>+</button>
                      </div>
                      <div style={{ color: '#F0EDE8', fontWeight: 800, minWidth: 60, textAlign: 'right', fontSize: 14 }}>{(item.price * item.quantity).toFixed(2)} ₺</div>
                    </div>
                  ))}
                </div>

                <div style={{ padding: '0 24px 32px' }}>
                  <div style={{ background: '#0D0D0D', borderRadius: 16, padding: '16px 20px', marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ color: '#888', fontSize: 14 }}>Ara toplam</span>
                      <span style={{ color: '#F0EDE8', fontWeight: 600 }}>{total.toFixed(2)} ₺</span>
                    </div>
                    <div style={{ borderTop: '1px solid #2A2A2A', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#C9A84C', fontWeight: 700, fontSize: 16 }}>TOPLAM</span>
                      <span style={{ color: '#C9A84C', fontWeight: 800, fontSize: 20 }}>{total.toFixed(2)} ₺</span>
                    </div>
                  </div>

                  <div style={{ background: '#2A2A2A', borderRadius: 12, padding: '12px 16px', marginBottom: 16, textAlign: 'center' }}>
                    <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Bu ekranı garsona gösterin</div>
                    <div style={{ color: '#F0EDE8', fontSize: 13, fontWeight: 600 }}>Garson siparişinizi onaylayacak</div>
                  </div>

                  <button onClick={() => { setCart([]); setShowCart(false) }}
                    style={{ width: '100%', background: 'transparent', border: '1px solid #C0392B', borderRadius: 14, padding: '14px', color: '#C0392B', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                    Siparişi Temizle
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
