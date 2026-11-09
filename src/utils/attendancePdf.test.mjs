import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAttendancePrintHtml } from './attendancePdf.js'

test('PDF print HTML preserves Vietnamese report data and escapes untrusted text', () => {
  const html = buildAttendancePrintHtml({
    title: 'Bảng chấm công tháng 09/2026',
    companyName: 'Công ty Demo 22 & <script>alert(1)</script>',
    month: '2026-09',
    filterLabel: 'Nhân sự: Nguyễn Thị Ánh',
    exportedAt: '14/09/2026 10:30',
    headers: ['Họ tên', 'Công ty'],
    rows: [['Nguyễn Thị Ánh', 'Công ty Demo 22 & <img src=x>']],
    tableMode: 'list'
  })

  assert.match(html, /<meta charset="utf-8">/)
  assert.match(html, /@page\s*\{\s*size:\s*A3 landscape;/)
  assert.match(html, /thead\s*\{\s*display:\s*table-header-group;/)
  assert.match(html, /Bảng chấm công tháng 09\/2026/)
  assert.match(html, /Công ty Demo 22 &amp; &lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /Công ty Demo 22 &amp; &lt;img src=x&gt;/)
  assert.match(html, /<th>Họ tên<\/th><th>Công ty<\/th>/)
  assert.match(html, /<td>Nguyễn Thị Ánh<\/td>/)
  assert.match(html, /<span>Tháng: 2026-09<\/span>/)
  assert.match(html, /<span>Ngày xuất: 14\/09\/2026 10:30<\/span>/)
  assert.doesNotMatch(html, /<script>/)
  assert.doesNotMatch(html, /<img src=x>/)
})
