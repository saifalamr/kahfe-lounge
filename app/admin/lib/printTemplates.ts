// Print/export templates for the admin panel. These are pure functions:
// given data, they open a print window and write an HTML document to it.
// Kept separate from app/admin/page.tsx so the main component file isn't
// carrying this much presentational/string-building code.

export function printKitchenTicket(tableName: string, orders: any[]) {
  const win = window.open('', '_blank', 'width=420,height=700')
  if (!win) { alert('Pop-up engellendi. Lütfen bu site için pop-up izni verip tekrar deneyin.'); return }
  const activeItems = orders.filter((o: any) => o.status === 'pending')
  const rows = activeItems.flatMap((o: any) => (o.items || []).map((it: any) => ({ ...it, note: o.note })))
  const itemRows = rows.map((it: any) =>
    `<tr><td class="qty">${it.quantity}x</td><td>${it.name}</td></tr>`
  ).join('')
  const notes = [...new Set(activeItems.filter((o: any) => o.note).map((o: any) => o.note))]
  win.document.write(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="utf-8" />
      <title>Mutfak Fişi - ${tableName}</title>
      <style>
        body { font-family: 'Courier New', monospace; color:#000; padding: 16px; width:300px; margin:0 auto; }
        .center { text-align:center; }
        h1 { font-size:22px; margin:6px 0; }
        .line { border-top:2px dashed #000; margin:10px 0; }
        table { width:100%; border-collapse:collapse; font-size:20px; }
        td { padding:6px 0; }
        .qty { font-weight:bold; width:50px; }
        .note { font-size:14px; margin-top:10px; border:1px solid #000; padding:8px; }
      </style>
    </head>
    <body>
      <div class="center">
        <h1>🍳 ${tableName}</h1>
        <div style="font-size:13px;">${new Date().toLocaleString('tr-TR')}</div>
      </div>
      <div class="line"></div>
      <table>${itemRows}</table>
      ${notes.length > 0 ? `<div class="note">📝 ${notes.join(' · ')}</div>` : ''}
      <div class="line"></div>
      <script>window.onload = function(){ window.print(); };</script>
    </body>
    </html>
  `)
  win.document.close()
}

export function printReceipt(info: { table_name: string, total: number, cash: number, card: number, method: 'cash'|'card'|'mixed', orders: any[], discountAmount?: number, discountReason?: string, originalTotal?: number }) {
  const win = window.open('', '_blank', 'width=420,height=700')
  if (!win) { alert('Pop-up engellendi. Lütfen bu site için pop-up izni verip tekrar deneyin.'); return }
  const itemRows = (info.orders || []).flatMap((o: any) => o.items || []).map((it: any) =>
    `<tr><td>${it.quantity}x ${it.name}</td><td style="text-align:right">${it.subtotal} ₺</td></tr>`
  ).join('')
  const methodLabel = info.method === 'cash' ? 'Nakit' : info.method === 'card' ? 'Kart' : 'Karma (Nakit + Kart)'
  const hasDiscount = (info.discountAmount || 0) > 0
  win.document.write(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="utf-8" />
      <title>Kahfe Lounge - Fiş - ${info.table_name}</title>
      <style>
        body { font-family: 'Courier New', monospace; color:#111; padding: 20px; width:280px; margin:0 auto; }
        .center { text-align:center; }
        h1 { font-size:16px; margin:4px 0; }
        .line { border-top:1px dashed #333; margin:10px 0; }
        table { width:100%; border-collapse:collapse; font-size:12px; }
        td { padding:3px 0; }
        .total-row td { font-weight:bold; font-size:14px; padding-top:8px; }
      </style>
    </head>
    <body>
      <div class="center">
        <h1>KAHFE LOUNGE</h1>
        <div style="font-size:11px;">${new Date().toLocaleString('tr-TR')}</div>
        <div style="font-size:12px; margin-top:6px;">Masa: <b>${info.table_name}</b></div>
      </div>
      <div class="line"></div>
      <table>
        ${itemRows}
      </table>
      <div class="line"></div>
      <table>
        ${hasDiscount ? `<tr><td>Ara Toplam</td><td style="text-align:right">${(info.originalTotal || info.total).toFixed(0)} ₺</td></tr><tr><td>İndirim${info.discountReason ? ` (${info.discountReason})` : ''}</td><td style="text-align:right">-${(info.discountAmount || 0).toFixed(0)} ₺</td></tr>` : ''}
        <tr class="total-row"><td>TOPLAM</td><td style="text-align:right">${info.total.toFixed(0)} ₺</td></tr>
      </table>
      <div class="line"></div>
      <div style="font-size:12px;">
        Ödeme: <b>${methodLabel}</b><br/>
        ${info.method === 'mixed' ? `Nakit: ${info.cash.toFixed(0)} ₺<br/>Kart: ${info.card.toFixed(0)} ₺` : ''}
      </div>
      <div class="line"></div>
      <div class="center" style="font-size:11px; margin-top:10px;">Bizi tercih ettiğiniz için teşekkürler!</div>
      <script>window.onload = function(){ window.print(); };</script>
    </body>
    </html>
  `)
  win.document.close()
}

export function exportOrdersPDF(dateFilter: 'today'|'week'|'month', allOrders: any[], revenueSummary: { revenue: number }) {
  const win = window.open('', '_blank', 'width=900,height=900')
  if (!win) { alert('Pop-up engellendi. Lütfen bu site için pop-up izni verip tekrar deneyin.'); return }
  const label = dateFilter === 'today' ? 'Bugün' : dateFilter === 'week' ? 'Bu Hafta' : 'Bu Ay'
  const totalRevenue = revenueSummary.revenue
  const pending = allOrders.filter((o: any) => o.status === 'pending').length
  const statusLabel = (st: string) => st==='pending'?'Bekliyor':st==='dismissed'?'Reddedildi':'Tamamlandı'
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
        .stat .label { font-size: 11px; color:#8A8A8A; margin-top:4px; }
        table { width:100%; border-collapse:collapse; margin-top:10px; }
        th, td { padding:7px 8px; border-bottom:1px solid #eee; font-size:11px; text-align:left; }
        th { color:#8A8A8A; text-transform:uppercase; font-size:10px; }
        @media print { .no-print { display:none; } }
      </style>
    </head>
    <body>
      <div class="brand">KAHFE LOUNGE</div>
      <h1>${label} Raporu — ${new Date().toLocaleDateString('tr-TR')}</h1>
      <div class="stats">
        <div class="stat"><div class="num">${allOrders.length}</div><div class="label">Toplam Sipariş</div></div>
        <div class="stat"><div class="num">${pending}</div><div class="label">Bekliyor</div></div>
        <div class="stat"><div class="num">${totalRevenue.toFixed(0)} ₺</div><div class="label">Ciro (Tahsil Edilen)</div></div>
      </div>
      <div style="font-size:10px; color:#8A8A8A; margin-bottom:10px;">Not: Ciro yalnızca ödemesi alınıp kapatılmış masaları sayar. Aşağıdaki liste, henüz ödenmemiş olanlar dahil bu aralıktaki tüm siparişleri gösterir.</div>
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

export function exportMonthlyReportPDF(report: any) {
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
        .stat .label { font-size: 11px; color:#8A8A8A; margin-top:4px; }
        h2 { font-size:14px; margin-top:28px; border-bottom:2px solid #C9A84C; padding-bottom:8px; }
        table { width:100%; border-collapse:collapse; margin-top:10px; }
        th, td { padding:7px 8px; border-bottom:1px solid #eee; font-size:12px; text-align:left; }
        th { color:#8A8A8A; text-transform:uppercase; font-size:10px; }
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

export function printStaffReportPDF(staffReportRange: 'today'|'week'|'month', staffReportData: any[]) {
  const win = window.open('', '_blank', 'width=800,height=900')
  if (!win) { alert('Pop-up engellendi. Lütfen bu site için pop-up izni verip tekrar deneyin.'); return }
  const label = staffReportRange === 'today' ? 'Bugün' : staffReportRange === 'week' ? 'Bu Hafta' : 'Bu Ay'
  const rows = staffReportData.map((r: any) => `
    <tr><td>${r.name}</td><td style="text-align:right">${r.ordersCreated}</td><td style="text-align:right">${r.ordersHandled}</td><td style="text-align:right">${r.tabsClosed}</td><td style="text-align:right">${r.revenueClosed.toFixed(0)} ₺</td><td style="text-align:right">${r.voidsCount} (${r.voidsAmount.toFixed(0)} ₺)</td></tr>
  `).join('')
  win.document.write(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="utf-8" />
      <title>Kahfe Lounge - Personel Performansı - ${label}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color:#1A1A1A; padding: 36px; }
        .brand { font-size: 12px; letter-spacing: 3px; color:#8a6d1f; font-weight:700; }
        h1 { font-size: 22px; margin: 4px 0 20px; }
        table { width:100%; border-collapse:collapse; margin-top:10px; }
        th, td { padding:8px 10px; border-bottom:1px solid #eee; font-size:12px; text-align:left; }
        th { color:#888; text-transform:uppercase; font-size:10px; }
      </style>
    </head>
    <body>
      <div class="brand">KAHFE LOUNGE</div>
      <h1>Personel Performansı — ${label}</h1>
      <table>
        <tr><th>Personel</th><th style="text-align:right">Girilen Sipariş</th><th style="text-align:right">Tamamlanan Sipariş</th><th style="text-align:right">Kapatılan Masa</th><th style="text-align:right">Ciro</th><th style="text-align:right">İptal</th></tr>
        ${rows || '<tr><td colspan="6">Bu aralıkta veri yok</td></tr>'}
      </table>
      <script>window.onload = function(){ window.print(); };</script>
    </body>
    </html>
  `)
  win.document.close()
}

export function printDayClosePDF(dayCloseData: any, countedCash: string) {
  if (!dayCloseData) return
  const win = window.open('', '_blank', 'width=800,height=900')
  if (!win) { alert('Pop-up engellendi. Lütfen bu site için pop-up izni verip tekrar deneyin.'); return }
  const counted = parseFloat(countedCash)
  const diff = isNaN(counted) ? null : (counted - dayCloseData.cashTotal)
  const rows = dayCloseData.tabs.map((t: any, i: number) => `
    <tr><td>${i + 1}</td><td>${t.table_name}</td><td>${new Date(t.closed_at).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'})}</td><td>${t.payment_method === 'cash' ? 'Nakit' : t.payment_method === 'card' ? 'Kart' : 'Karma'}</td><td>${t.closed_by || '—'}</td><td style="text-align:right">${Number(t.total).toFixed(0)} ₺</td></tr>
  `).join('')
  win.document.write(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="utf-8" />
      <title>Kahfe Lounge - Gün Sonu - ${new Date().toLocaleDateString('tr-TR')}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color:#1A1A1A; padding: 36px; }
        .brand { font-size: 12px; letter-spacing: 3px; color:#8a6d1f; font-weight:700; }
        h1 { font-size: 22px; margin: 4px 0 20px; }
        .stats { display:flex; gap:16px; margin-bottom: 24px; flex-wrap:wrap; }
        .stat { flex:1; min-width:110px; border:1px solid #ddd; border-radius:10px; padding:14px; text-align:center; }
        .stat .num { font-size: 20px; font-weight:800; }
        .stat .label { font-size: 11px; color:#8A8A8A; margin-top:4px; }
        h2 { font-size:14px; margin-top:28px; border-bottom:2px solid #C9A84C; padding-bottom:8px; }
        table { width:100%; border-collapse:collapse; margin-top:10px; }
        th, td { padding:7px 8px; border-bottom:1px solid #eee; font-size:11px; text-align:left; }
        th { color:#8A8A8A; text-transform:uppercase; font-size:10px; }
      </style>
    </head>
    <body>
      <div class="brand">KAHFE LOUNGE</div>
      <h1>Gün Sonu Raporu — ${new Date().toLocaleDateString('tr-TR')}</h1>
      <div class="stats">
        <div class="stat"><div class="num">${dayCloseData.tabCount}</div><div class="label">Kapanan Masa</div></div>
        <div class="stat"><div class="num">${dayCloseData.totalRevenue.toFixed(0)} ₺</div><div class="label">Toplam Ciro</div></div>
        <div class="stat"><div class="num">${dayCloseData.cashTotal.toFixed(0)} ₺</div><div class="label">Nakit</div></div>
        <div class="stat"><div class="num">${dayCloseData.cardTotal.toFixed(0)} ₺</div><div class="label">Kart</div></div>
        ${diff !== null ? `<div class="stat"><div class="num" style="color:${diff===0?'#27ae60':diff>0?'#3498db':'#e74c3c'}">${diff>=0?'+':''}${diff.toFixed(0)} ₺</div><div class="label">Kasa Farkı</div></div>` : ''}
      </div>
      <h2>Kapanan Masalar</h2>
      <table>
        <tr><th>#</th><th>Masa</th><th>Saat</th><th>Ödeme</th><th>Kapatan</th><th style="text-align:right">Tutar</th></tr>
        ${rows || '<tr><td colspan="6">Bugün kapanan masa yok</td></tr>'}
      </table>
      <script>window.onload = function(){ window.print(); };</script>
    </body>
    </html>
  `)
  win.document.close()
}
