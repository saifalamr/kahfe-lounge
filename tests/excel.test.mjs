import {test} from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
test('Excel export dependency roundtrips Turkish text, numbers and formula-like strings as text',async()=>{
 const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('Ödemeler');sheet.addRow(['İşlem','Tutar']);sheet.addRow(['=HYPERLINK("bad")',12.5]);
 const bytes=await workbook.xlsx.writeBuffer();const restored=new ExcelJS.Workbook();await restored.xlsx.load(bytes)
 assert.equal(restored.getWorksheet('Ödemeler').getCell('A2').value,'=HYPERLINK("bad")');assert.equal(restored.getWorksheet('Ödemeler').getCell('B2').value,12.5)
})
