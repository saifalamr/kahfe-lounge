import ExcelJS from 'exceljs'

export async function exportAccountingWorkbook(sheets: [string, Record<string, unknown>[]][], filename: string) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Kahfe Lounge'
  for (const [name, data] of sheets) {
    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
    const keys = [...new Set(data.flatMap(row => Object.keys(row)))]
    sheet.columns = keys.map(key => ({ header: key, key, width: Math.min(42, Math.max(16, key.length + 3)) }))
    for (const row of data) {
      // Plain strings are written as text, never Excel formula objects.
      sheet.addRow(Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
        typeof value === 'number' || typeof value === 'string' ? value : String(value ?? ''),
      ])))
    }
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF24382C' } }
    sheet.getRow(1).height = 25
    sheet.eachRow((row, index) => {
      if (index > 1 && index % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F1E6' } }
      row.eachCell(cell => { if (typeof cell.value === 'number') cell.numFmt = '#,##0.00' })
    })
    if (keys.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: keys.length } }
  }
  const bytes = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
