import ExcelJS from 'exceljs'

async function inspect() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile('BANG_CONG_THANG_8_2026_TEST.xlsx')
  console.log('Worksheet names:', wb.worksheets.map(w => w.name))
  const sheet = wb.worksheets[0]
  console.log('Title AJ2:', sheet.getCell('AJ2').value)
  console.log('Date range AL4:', sheet.getCell('AL4').value)
  console.log('Day 1 weekday AJ5:', sheet.getCell('AJ5').value)
  console.log('Day 31 number BN6:', sheet.getCell('BN6').value)
  console.log('Total rows in sheet:', sheet.rowCount)

  console.log('\nSample employee rows in exported Excel:')
  for (let r = 7; r <= 15; r++) {
    const stt = sheet.getCell(r, 1).value
    const name = sheet.getCell(r, 3).value
    const dept = sheet.getCell(r, 4).value
    const totalCong = sheet.getCell(r, 35).value // Tổng công column
    console.log(`Row ${r}: STT ${stt} | ${name} | ${dept} | Tổng công cell value:`, totalCong)
  }
}

inspect().catch(console.error)
