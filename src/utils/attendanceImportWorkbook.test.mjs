import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import XLSX from 'xlsx-js-style'
import { analyzeAttendanceSheet, expandAttendanceMergedCells } from './attendanceImport.js'

const { read, utils } = XLSX

for (const [fileName, expectedDays] of [
  ['BANG_CONG_THANG_7_2026_TEST.xlsx', 31],
  ['BANG_CONG_THANG_8_2026_TEST.xlsx', 31]
]) {
  test(`recognizes the real matrix in ${fileName}`, () => {
    const bytes = readFileSync(new URL(`../../${fileName}`, import.meta.url))
    const workbook = read(bytes, { type: 'buffer', cellNF: true, cellDates: false })
    const candidates = workbook.SheetNames.map(sheetName => {
      const worksheet = workbook.Sheets[sheetName]
      const rawRows = utils.sheet_to_json(worksheet, {
        header: 1,
        raw: true,
        defval: ''
      })
      const rows = expandAttendanceMergedCells(rawRows, worksheet['!merges'] || [])
      return { sheetName, analysis: analyzeAttendanceSheet(rows) }
    }).sort((left, right) => right.analysis.score - left.analysis.score)

    assert.ok(candidates[0].analysis.score > 0)
    assert.equal(candidates[0].analysis.kind, 'matrix')
    assert.equal(candidates[0].analysis.matrix.days.length, expectedDays)
  })
}
