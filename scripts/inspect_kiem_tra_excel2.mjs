import XLSX from 'xlsx'

const wb = XLSX.readFile('d:/hr/TONG_CONG_THANG_8_2026_KIEM_TRA.xlsx')
const sheet = wb.Sheets['DoiSoatMaNV']
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })
rows.slice(15, 34).forEach((r, i) => {
  console.log(`Row ${i + 16}:`, JSON.stringify(r))
})
