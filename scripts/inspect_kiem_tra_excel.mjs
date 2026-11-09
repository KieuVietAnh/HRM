import XLSX from 'xlsx'

const wb = XLSX.readFile('d:/hr/TONG_CONG_THANG_8_2026_KIEM_TRA.xlsx')
console.log('SheetNames:', wb.SheetNames)

wb.SheetNames.forEach(name => {
  console.log(`\n=== SHEET: ${name} ===`)
  const sheet = wb.Sheets[name]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })
  console.log(`Total rows: ${rows.length}`)
  rows.slice(0, 15).forEach((r, i) => {
    console.log(`Row ${i + 1}:`, JSON.stringify(r))
  })
})
