/**
 * Parser chuyên dụng cho định dạng Excel ma trận chấm công ngày 01-31 (Ảnh 2)
 */

export const normalizeString = (str) =>
  String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

/**
 * Phân tích sheet Excel dạng ma trận ngày
 * @param {Array<Array<any>>} sheetData - Mảng 2 chiều các dòng từ sheet Excel
 * @param {string} yearMonth - Chuỗi 'YYYY-MM' (VD: '2026-08')
 */
export function parseMatrixSheet(sheetData, yearMonth = '2026-08') {
  if (!sheetData || sheetData.length === 0) {
    throw new Error('Dữ liệu bảng tính trống.')
  }

  const [yearStr, monthStr] = yearMonth.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  const daysInMonth = new Date(year, month, 0).getDate()

  // 1. Tìm dòng tiêu đề chứa "Mã nhân viên"
  let headerRowIndex = -1
  let colMaNV = -1
  let colHoTen = -1
  let colChucVu = -1
  const dayColMap = new Map() // day (1..31) -> colIndex

  for (let r = 0; r < Math.min(sheetData.length, 15); r++) {
    const row = sheetData[r]
    if (!row) continue

    for (let c = 0; c < row.length; c++) {
      const cell = normalizeString(row[c])
      if (cell.includes('ma nhan vien') || cell === 'ma nv') {
        colMaNV = c
        headerRowIndex = r
      } else if (cell.includes('ho va ten') || cell.includes('ho ten') || cell === 'ten nv') {
        colHoTen = c
      } else if (cell.includes('chuc vu') || cell.includes('vi tri')) {
        colChucVu = c
      }
    }

    if (headerRowIndex !== -1 && colMaNV !== -1) {
      break
    }
  }

  if (headerRowIndex === -1 || colMaNV === -1) {
    throw new Error('Không tìm thấy cột "Mã nhân viên" trong file Excel. Vui lòng kiểm tra tiêu đề bảng tính.')
  }

  // Quét các cột ngày (01 .. 31) ở dòng headerRowIndex hoặc headerRowIndex - 1 / + 1
  const headerRow = sheetData[headerRowIndex] || []
  const subHeaderRow = sheetData[headerRowIndex + 1] || []

  for (let c = 0; c < Math.max(headerRow.length, subHeaderRow.length); c++) {
    const valH = String(headerRow[c] || '').trim()
    const valSub = String(subHeaderRow[c] || '').trim()

    // Thử nhận diện số ngày 1..31
    const matchDay = parseInt(valH, 10) || parseInt(valSub, 10)
    if (matchDay >= 1 && matchDay <= daysInMonth && !dayColMap.has(matchDay)) {
      dayColMap.set(matchDay, c)
    }
  }

  // Nếu dòng tiêu đề ghi "01", "02"...
  if (dayColMap.size === 0) {
    // Quét dòng tiêu đề row 4 hoặc 5
    for (let r = Math.max(0, headerRowIndex - 2); r <= Math.min(sheetData.length - 1, headerRowIndex + 2); r++) {
      const row = sheetData[r] || []
      for (let c = 0; c < row.length; c++) {
        const txt = String(row[c] || '').trim()
        const d = parseInt(txt, 10)
        if (d >= 1 && d <= daysInMonth && (txt === String(d) || txt === String(d).padStart(2, '0'))) {
          if (!dayColMap.has(d)) {
            dayColMap.set(d, c)
          }
        }
      }
      if (dayColMap.size >= 28) break
    }
  }

  // Bắt đầu đọc dữ liệu nhân sự và chấm công từ sau dòng tiêu đề (thường là r >= headerRowIndex + 1 hoặc + 2)
  const startRow = headerRowIndex + 2 <= sheetData.length ? headerRowIndex + 2 : headerRowIndex + 1
  const employees = []
  const attendanceRecords = []
  const summaries = []
  const matrixRows = []

  for (let r = startRow; r < sheetData.length; r++) {
    const row = sheetData[r]
    if (!row) continue

    const rawMaNV = row[colMaNV]
    if (rawMaNV === undefined || rawMaNV === null || String(rawMaNV).trim() === '') {
      continue
    }

    const maNV = String(rawMaNV).trim()
    // Bỏ qua dòng tổng cộng nếu có
    if (normalizeString(maNV).includes('tong') || normalizeString(maNV).includes('cong')) {
      continue
    }

    const hoTen = colHoTen !== -1 && row[colHoTen] ? String(row[colHoTen]).trim() : `Nhân viên ${maNV}`
    const chucVu = colChucVu !== -1 && row[colChucVu] ? String(row[colChucVu]).trim() : 'Nhân viên'

    const employee = {
      ma_nhan_vien: maNV,
      ho_ten: hoTen,
      chuc_vu: chucVu,
      bo_phan: 'Nhân sự',
      ca_lam: 'Ca ngày',
      // File chấm công không phải nguồn xác nhận trạng thái nhân sự.
      trang_thai: ''
    }
    employees.push(employee)

    const dailyValues = {}
    let totalCong = 0
    let totalPhep = 0
    let totalTangCa = 0

    // Đọc từng ngày trong tháng
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = String(d).padStart(2, '0')
      const dateStr = `${yearMonth}-${dayStr}`
      const c = dayColMap.get(d)
      let rawVal = c !== undefined && row[c] !== undefined ? String(row[c]).trim() : ''

      dailyValues[dayStr] = rawVal

      // Tính toán công dựa trên giá trị gốc
      let congValue = 0
      const upperVal = rawVal.toUpperCase()

      if (upperVal === '1' || upperVal === 'X') {
        congValue = 1.0
      } else if (upperVal === '0.5') {
        congValue = 0.5
      } else if (upperVal === 'P') {
        // Nghỉ phép có lương
        congValue = 1.0
        totalPhep += 1.0
      } else if (upperVal === '0' || upperVal === '') {
        congValue = 0
      } else {
        const num = parseFloat(rawVal)
        if (!isNaN(num)) {
          congValue = num
        }
      }

      totalCong += congValue

      attendanceRecords.push({
        ma_nhan_vien: maNV,
        ho_ten: hoTen,
        ngay: dateStr,
        gia_tri_goc: rawVal,
        tong_cong: congValue,
        ca_lam: 'Ca ngày',
        phep_su_dung: upperVal === 'P' ? 1.0 : 0
      })
    }

    const summary = {
      ma_nhan_vien: maNV,
      ho_ten: hoTen,
      chuc_vu: chucVu,
      thang: yearMonth,
      tong_cong: Math.round(totalCong * 100) / 100,
      tang_ca: totalTangCa,
      phep_su_dung: totalPhep,
      cong_lam_le: 0,
      cong_le: 0,
      xac_nhan: false
    }
    summaries.push(summary)

    matrixRows.push({
      ma_nhan_vien: maNV,
      ho_ten: hoTen,
      chuc_vu: chucVu,
      days: dailyValues,
      summary
    })
  }

  return {
    yearMonth,
    daysInMonth,
    employees,
    attendanceRecords,
    summaries,
    matrixRows
  }
}
