const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

export const buildAttendancePrintHtml = ({
  title,
  companyName,
  month,
  filterLabel,
  exportedAt,
  headers = [],
  rows = [],
  tableMode = 'list'
}) => `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title || 'Bảng chấm công')}</title>
    <style>
      @page { size: A3 landscape; margin: 11mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #172033; font-family: Arial, "Segoe UI", sans-serif; font-size: 9pt; }
      .toolbar { display: flex; justify-content: flex-end; padding: 14px 0; }
      .toolbar button { border: 0; border-radius: 5px; padding: 9px 16px; background: #0d427a; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
      h1 { margin: 0 0 6px; color: #0d427a; font-size: 19pt; }
      .company { margin: 0 0 8px; font-size: 12pt; font-weight: 700; }
      .meta { display: flex; flex-wrap: wrap; gap: 6px 22px; margin-bottom: 14px; color: #3d4a5c; font-size: 9pt; }
      table { width: 100%; border-collapse: collapse; table-layout: auto; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      th, td { border: 1px solid #98a5b6; padding: 4px 5px; text-align: center; vertical-align: middle; }
      th { background: #e8f1fb; color: #0d427a; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      td { overflow-wrap: anywhere; }
      .is-matrix th, .is-matrix td { padding: 3px 2px; font-size: 7pt; }
      .is-matrix td:nth-child(3), .is-matrix td:nth-child(4), .is-matrix th:nth-child(3), .is-matrix th:nth-child(4) { min-width: 24mm; text-align: left; }
      .is-list th, .is-list td { font-size: 7.5pt; }
      .empty { padding: 18px; text-align: center; color: #667085; }
      @media print {
        .toolbar { display: none; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>
  </head>
  <body>
    <div class="toolbar"><button type="button" onclick="window.print()">In / Lưu PDF</button></div>
    <h1>${escapeHtml(title || 'Bảng chấm công')}</h1>
    <p class="company">Công ty: ${escapeHtml(companyName || 'Công ty chưa khai báo')}</p>
    <div class="meta">
      <span>Tháng: ${escapeHtml(month || '')}</span>
      <span>Bộ lọc: ${escapeHtml(filterLabel || 'Tất cả dữ liệu')}</span>
      <span>Ngày xuất: ${escapeHtml(exportedAt || '')}</span>
    </div>
    <table class="is-${tableMode === 'matrix' ? 'matrix' : 'list'}">
      <thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.length
          ? rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')
          : `<tr><td class="empty" colspan="${Math.max(headers.length, 1)}">Không có dữ liệu phù hợp với bộ lọc hiện tại.</td></tr>`}
      </tbody>
    </table>
  </body>
</html>`

export const openAttendancePrintWindow = report => {
  if (typeof window === 'undefined') return false
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    window.alert('Trình duyệt đang chặn cửa sổ in. Hãy cho phép cửa sổ bật lên rồi bấm “Tải PDF” lại.')
    return false
  }

  try {
    printWindow.document.open()
    printWindow.document.write(buildAttendancePrintHtml(report))
    printWindow.document.close()
    printWindow.setTimeout(() => {
      if (printWindow.closed) return
      printWindow.focus()
      printWindow.print()
    }, 400)
    return true
  } catch (error) {
    printWindow.close()
    window.alert(`Không thể mở bản PDF: ${error.message || error}`)
    return false
  }
}
