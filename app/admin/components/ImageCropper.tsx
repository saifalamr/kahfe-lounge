'use client'
import { useEffect, useState, useRef, useCallback } from 'react'

/* ── Image Cropper Component ── */
export default function ImageCropper({ src, onCrop, onCancel }: { src: string; onCrop: (blob: Blob) => void; onCancel: () => void }) {
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
      <div style={{ color: '#8A8A8A', fontSize: 12, marginBottom: 16 }}>Sürükle · Zoom ile boyutlandır · Kırp</div>

      {/* Canvas crop area */}
      <div ref={containerRef} style={{ position: 'relative', border: '2px solid #C9A84C', borderRadius: 8, overflow: 'hidden', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}>
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
        <span style={{ color: '#8A8A8A', fontSize: 12 }}>🔍</span>
        <input type="range" min={0.1} max={3} step={0.01} value={zoom}
          onChange={e => setZoom(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: '#C9A84C' }} />
        <span style={{ color: '#C9A84C', fontSize: 12, minWidth: 36 }}>{Math.round(zoom * 100)}%</span>
        <button onClick={resetPos} style={{ background: '#2A2A2A', border: 'none', borderRadius: 8, padding: '6px 12px', color: '#8A8A8A', fontSize: 12, cursor: 'pointer' }}>Sıfırla</button>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 12, marginTop: 16, width: '100%', maxWidth: CROP_W }}>
        <button onClick={onCancel} style={{ flex: 1, background: 'transparent', border: '1px solid #2A2A2A', borderRadius: 8, padding: 14, color: '#8A8A8A', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>İptal</button>
        <button onClick={handleCrop} style={{ flex: 2, background: '#C9A84C', border: 'none', borderRadius: 8, padding: 14, color: '#1A0E06', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>✓ Fotoğrafı Kaydet</button>
      </div>
    </div>
  )
}
