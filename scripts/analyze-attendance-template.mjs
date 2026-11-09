import fs from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'

const [, , sourceArg, outputArg] = process.argv
if (!sourceArg || !outputArg) {
  throw new Error('Usage: node scripts/analyze-attendance-template.mjs <source.xlsx> <output.json>')
}

const source = path.resolve(sourceArg)
const output = path.resolve(outputArg)
const workbook = new ExcelJS.Workbook()
await workbook.xlsx.readFile(source)

const color = (value) => value ? { ...value } : null
const side = (value) => value ? { style: value.style || null, color: color(value.color) } : null
const mergedRangeFor = (worksheet, address) => {
  const master = worksheet.getCell(address).master
  if (!worksheet.getCell(address).isMerged) return null
  const found = Object.keys(worksheet._merges || {}).find(range => {
    const model = worksheet._merges[range]?.model
    return model &&
      master.row >= model.top && master.row <= model.bottom &&
      master.col >= model.left && master.col <= model.right
  })
  return found || master.address
}

const analysis = {
  source,
  creator: workbook.creator,
  sheetCount: workbook.worksheets.length,
  sheetNames: workbook.worksheets.map(sheet => sheet.name),
  activeSheet: workbook.views?.[0]?.activeTab ?? 0,
  worksheets: workbook.worksheets.map((worksheet) => {
    const cells = []
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (cell.value === null && cell.styleId === 0 && !cell.isMerged) return
        cells.push({
          address: cell.address,
          value: cell.value,
          formula: cell.formula || null,
          result: cell.result ?? null,
          type: cell.type,
          styleId: cell.styleId,
          font: cell.font ? {
            name: cell.font.name,
            size: cell.font.size,
            bold: cell.font.bold,
            italic: cell.font.italic,
            color: color(cell.font.color)
          } : null,
          fill: cell.fill ? {
            type: cell.fill.type,
            pattern: cell.fill.pattern,
            fgColor: color(cell.fill.fgColor),
            bgColor: color(cell.fill.bgColor)
          } : null,
          border: cell.border ? {
            top: side(cell.border.top),
            bottom: side(cell.border.bottom),
            left: side(cell.border.left),
            right: side(cell.border.right)
          } : null,
          alignment: cell.alignment ? { ...cell.alignment } : null,
          numberFormat: cell.numFmt || null,
          protection: cell.protection ? { ...cell.protection } : null,
          mergedRange: mergedRangeFor(worksheet, cell.address)
        })
      })
    })
    return {
      name: worksheet.name,
      state: worksheet.state,
      rowCount: worksheet.rowCount,
      actualRowCount: worksheet.actualRowCount,
      columnCount: worksheet.columnCount,
      actualColumnCount: worksheet.actualColumnCount,
      usedRange: `A1:${worksheet.getCell(worksheet.rowCount, worksheet.columnCount).address}`,
      views: worksheet.views,
      autoFilter: worksheet.autoFilter || null,
      pageSetup: worksheet.pageSetup,
      pageMargins: worksheet.pageMargins,
      printArea: worksheet.pageSetup?.printArea || null,
      merges: Object.keys(worksheet._merges || {}),
      hiddenRows: worksheet._rows.filter(Boolean).filter(row => row.hidden).map(row => row.number),
      hiddenColumns: worksheet.columns.filter(column => column.hidden).map(column => column.letter),
      rowHeights: Object.fromEntries(worksheet._rows.filter(Boolean).filter(row => row.height).map(row => [row.number, row.height])),
      columnWidths: Object.fromEntries(worksheet.columns.map(column => [column.letter, column.width]).filter(([, width]) => width !== undefined)),
      cells
    }
  })
}

await fs.writeFile(output, JSON.stringify(analysis, null, 2), 'utf8')
console.log(output)
