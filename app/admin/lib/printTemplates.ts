import { formatTL } from './format'
import { buildKitchenTicketEscPos, buildReceiptEscPos, printViaRawBT } from './escpos'

// Print/export templates for the admin panel. These are pure functions:
// given data, they open a print window and write an HTML document to it.
// Kept separate from app/admin/page.tsx so the main component file isn't
// carrying this much presentational/string-building code.
//
// `autoPrint` (Ayarlar toggle, Touchscreen role only) switches the two
// thermal-ticket functions (kitchen ticket + receipt) from "open an HTML
// preview + browser print dialog" to "send raw ESC/POS bytes to RawBT",
// which prints silently with no dialog. Everything else (reports, day
// close) stays as a normal browser print — those go to a regular printer,
// not the thermal one, so a dialog there is fine/expected.

export function printKitchenTicket(tableName: string, orders: any[], autoPrint: boolean = false) {
  if (autoPrint) {
    printViaRawBT(buildKitchenTicketEscPos(tableName, orders))
    return
  }
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

export function printReceipt(info: { table_name: string, total: number, cash: number, card: number, transfer?: number, method: 'cash'|'card'|'transfer'|'mixed'|'debt', orders: any[], discountAmount?: number, discountReason?: string, originalTotal?: number, faturaNo?: number }, autoPrint: boolean = false) {
  if (autoPrint) {
    printViaRawBT(buildReceiptEscPos(info))
    return
  }
  const win = window.open('', '_blank', 'width=460,height=750')
  if (!win) { alert('Pop-up engellendi. Lütfen bu site için pop-up izni verip tekrar deneyin.'); return }
  const itemRows = (info.orders || []).flatMap((o: any) => o.items || []).map((it: any) =>
    `<tr><td>${it.quantity}x ${it.name}</td><td style="text-align:right">${it.subtotal} ₺</td></tr>`
  ).join('')
  const methodLabel = info.method === 'cash' ? 'Nakit' : info.method === 'card' ? 'Kart' : info.method === 'transfer' ? 'Havale/EFT' : info.method === 'debt' ? 'BORÇ (Veresiye)' : 'Karma (Nakit + Kart)'
  const hasDiscount = (info.discountAmount || 0) > 0
  win.document.write(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="utf-8" />
      <title>Kahfe Lounge - Fiş - ${info.table_name}</title>
      <style>
        body { font-family: 'Courier New', monospace; font-weight: 700; color:#000; padding: 22px; width:320px; margin:0 auto; }
        .center { text-align:center; }
        h1 { font-size:22px; margin:6px 0; font-weight:900; letter-spacing:1px; }
        .fatura-no { font-size:16px; font-weight:900; margin-top:4px; }
        .line { border-top:3px dashed #000; margin:14px 0; }
        table { width:100%; border-collapse:collapse; font-size:16px; }
        td { padding:5px 0; }
        .total-row td { font-weight:900; font-size:20px; padding-top:12px; }
        .method { font-size:16px; font-weight:900; }
      </style>
    </head>
    <body>
      <div class="center">
        <h1>KAHFE LOUNGE</h1>
        <div style="font-size:14px;">${new Date().toLocaleString('tr-TR')}</div>
        ${info.faturaNo ? `<div class="fatura-no">FİŞ NO: ${String(info.faturaNo).padStart(6, '0')}</div>` : ''}
        <div style="font-size:16px; margin-top:8px;">Masa: <b>${info.table_name}</b></div>
      </div>
      <div class="line"></div>
      <table>
        ${itemRows}
      </table>
      <div class="line"></div>
      <table>
        ${hasDiscount ? `<tr><td>Ara Toplam</td><td style="text-align:right">${formatTL(info.originalTotal || info.total)} ₺</td></tr><tr><td>İndirim${info.discountReason ? ` (${info.discountReason})` : ''}</td><td style="text-align:right">-${formatTL(info.discountAmount || 0)} ₺</td></tr>` : ''}
        <tr class="total-row"><td>TOPLAM</td><td style="text-align:right">${formatTL(info.total)} ₺</td></tr>
      </table>
      <div class="line"></div>
      <div class="method">
        Ödeme: ${methodLabel}<br/>
        ${info.method === 'mixed' ? `Nakit: ${formatTL(info.cash)} ₺<br/>Kart: ${formatTL(info.card)} ₺` : ''}
      </div>
      <div class="line"></div>
      <div class="center" style="font-size:14px; margin-top:14px;">Bizi tercih ettiğiniz için teşekkürler!</div>
      <script>window.onload = function(){ window.print(); };</script>
    </body>
    </html>
  `)
  win.document.close()
}

export function exportOrdersPDF(dateFilter: 'today'|'week'|'month'|'custom', allOrders: any[], revenueSummary: { revenue: number, debt?: number }) {
  const win = window.open('', '_blank', 'width=900,height=900')
  if (!win) { alert('Pop-up engellendi. Lütfen bu site için pop-up izni verip tekrar deneyin.'); return }
  const label = dateFilter === 'today' ? 'Bugün' : dateFilter === 'week' ? 'Bu Hafta' : dateFilter === 'custom' ? 'Özel Aralık' : 'Bu Ay'
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
        <div class="stat"><div class="num">${formatTL(totalRevenue)} ₺</div><div class="label">Ciro (Tahsil Edilen)</div></div>
        <div class="stat"><div class="num">${formatTL(revenueSummary.debt || 0)} ₺</div><div class="label">Borç (Tahsil Edilmeyen)</div></div>
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
  const title = report.title || `${report.month} ${report.year} Raporu`
  const itemRows = (report.topItems || []).slice(0, 10).map((item: any, i: number) => `
    <tr><td>${i + 1}</td><td>${item.name}</td><td style="text-align:right">${item.count}</td><td style="text-align:right">${item.revenue} ₺</td></tr>
  `).join('')
  const categoryRows = (report.categoryStats || []).map((c: any) => `
    <tr><td>${c.icon} ${c.categoryName}</td><td style="text-align:right">${c.qty}</td><td style="text-align:right">${formatTL(c.revenue)} ₺</td></tr>
  `).join('')
  const tableRows = (report.topTables || []).slice(0, 10).map((t: any, i: number) => `
    <tr><td>${i + 1}</td><td>${t.name}</td><td style="text-align:right">${t.revenue} ₺</td></tr>
  `).join('')
  win.document.write(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="utf-8" />
      <title>Kahfe Lounge - ${title}</title>
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
      <h1>${title}</h1>
      <div class="stats">
        <div class="stat"><div class="num">${report.totalOrders}</div><div class="label">Toplam Sipariş</div></div>
        <div class="stat"><div class="num">${formatTL(Number(report.totalRevenue))} ₺</div><div class="label">Toplam Ciro</div></div>
        <div class="stat"><div class="num">${formatTL(Number(report.totalDebt || 0))} ₺</div><div class="label">Toplam Borç</div></div>
      </div>
      ${categoryRows ? `
      <h2>Kategori Bazında Ciro</h2>
      <table>
        <tr><th>Kategori</th><th style="text-align:right">Adet</th><th style="text-align:right">Ciro</th></tr>
        ${categoryRows}
      </table>` : ''}
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

export function printItemReportPDF(itemReportRange: 'today'|'month'|'year'|'custom', itemReportData: any[]) {
  const win = window.open('', '_blank', 'width=800,height=900')
  if (!win) { alert('Pop-up engellendi. Lütfen bu site için pop-up izni verip tekrar deneyin.'); return }
  const label = itemReportRange === 'today' ? 'Bugün' : itemReportRange === 'month' ? 'Bu Ay' : itemReportRange === 'custom' ? 'Özel Aralık' : 'Bu Yıl'
  const totalRevenue = itemReportData.reduce((s: number, c: any) => s + c.revenue, 0)
  const sections = itemReportData.map((cat: any) => {
    const rows = cat.items.map((r: any) => `
      <tr><td style="padding-left:20px">${r.name}</td><td style="text-align:right">${r.qty}</td><td style="text-align:right">${formatTL(r.revenue)} ₺</td></tr>
    `).join('')
    return `
      <tr style="background:#f7f2e2;"><td><b>${cat.icon} ${cat.categoryName}</b></td><td style="text-align:right"><b>${cat.qty}</b></td><td style="text-align:right"><b>${formatTL(cat.revenue)} ₺</b></td></tr>
      ${rows}
    `
  }).join('')
  win.document.write(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="utf-8" />
      <title>Kahfe Lounge - Ürün Raporu - ${label}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color:#1A1A1A; padding: 36px; }
        .brand { font-size: 12px; letter-spacing: 3px; color:#8a6d1f; font-weight:700; }
        h1 { font-size: 22px; margin: 4px 0 20px; }
        .stat { display:inline-block; border:1px solid #ddd; border-radius:10px; padding:14px 24px; margin-bottom:20px; }
        .stat .num { font-size: 20px; font-weight:800; }
        .stat .label { font-size: 11px; color:#8A8A8A; margin-top:4px; }
        table { width:100%; border-collapse:collapse; margin-top:10px; }
        th, td { padding:8px 10px; border-bottom:1px solid #eee; font-size:12px; text-align:left; }
        th { color:#888; text-transform:uppercase; font-size:10px; }
      </style>
    </head>
    <body>
      <div class="brand">KAHFE LOUNGE</div>
      <h1>Ürün Raporu — ${label}</h1>
      <div class="stat"><div class="num">${formatTL(totalRevenue)} ₺</div><div class="label">Toplam Ciro (Ürün Bazlı)</div></div>
      <table>
        <tr><th>Ürün / Kategori</th><th style="text-align:right">Adet</th><th style="text-align:right">Ciro</th></tr>
        ${sections || '<tr><td colspan="3">Bu aralıkta veri yok</td></tr>'}
      </table>
      <script>window.onload = function(){ window.print(); };</script>
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
    <tr><td>${r.name}</td><td style="text-align:right">${r.ordersCreated}</td><td style="text-align:right">${r.ordersHandled}</td><td style="text-align:right">${r.tabsClosed}</td><td style="text-align:right">${formatTL(r.revenueClosed)} ₺</td><td style="text-align:right">${r.voidsCount} (${formatTL(r.voidsAmount)} ₺)</td></tr>
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
  const diff = isNaN(counted) ? null : (counted - dayCloseData.expectedCash)
  const rows = dayCloseData.tabs.map((t: any, i: number) => `
    <tr><td>${i + 1}</td><td>${t.table_name}</td><td>${new Date(t.closed_at).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'})}</td><td>${t.payment_method === 'cash' ? 'Nakit' : t.payment_method === 'card' ? 'Kart' : t.payment_method === 'transfer' ? 'Havale' : t.payment_method === 'debt' ? 'Borç' : 'Karma'}</td><td>${t.closed_by || '—'}</td><td style="text-align:right">${formatTL(Number(t.total))} ₺</td></tr>
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
        <div class="stat"><div class="num">${formatTL(dayCloseData.totalRevenue)} ₺</div><div class="label">Toplam Ciro</div></div>
        <div class="stat"><div class="num">${formatTL(dayCloseData.cashTotal)} ₺</div><div class="label">Nakit (Satış)</div></div>
        <div class="stat"><div class="num" style="color:#C9A84C">${formatTL(dayCloseData.expectedCash)} ₺</div><div class="label">Beklenen Kasa</div></div>
        <div class="stat"><div class="num">${formatTL(dayCloseData.cardTotal)} ₺</div><div class="label">Kart</div></div>
        <div class="stat"><div class="num">${formatTL(dayCloseData.transferTotal || 0)} ₺</div><div class="label">Havale</div></div>
        <div class="stat"><div class="num">${formatTL(dayCloseData.debtTotal || 0)} ₺</div><div class="label">Borç</div></div>
        ${diff !== null ? `<div class="stat"><div class="num" style="color:${diff===0?'#27ae60':diff>0?'#3498db':'#e74c3c'}">${diff>=0?'+':''}${formatTL(diff)} ₺</div><div class="label">Kasa Farkı</div></div>` : ''}
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
