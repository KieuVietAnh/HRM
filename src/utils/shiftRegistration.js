export const DAY_OFF_SHIFT = Object.freeze({ id: 'off', name: 'Nghỉ', start: '', end: '' })

const WEEKDAY_LABELS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

export const SHIFT_STATUS_LABELS = Object.freeze({
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối'
})

const pad = value => String(value).padStart(2, '0')

export const toDateKey = date =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export const parseDateKey = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return toDateKey(date) === value ? date : null
}

// Tuần làm việc bắt đầu từ thứ 2.
export const weekStartKey = value => {
  const date = parseDateKey(value) || new Date()
  const offset = (date.getDay() + 6) % 7
  return toDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset))
}

export const shiftWeekKey = (weekStart, weeks) => {
  const date = parseDateKey(weekStart)
  if (!date) return weekStartKey()
  return toDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + weeks * 7))
}

export const weekDays = weekStart => {
  const start = parseDateKey(weekStart)
  if (!start) return []
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    return { date: toDateKey(date), label: WEEKDAY_LABELS[date.getDay()] }
  })
}

export const formatShortDate = value => {
  const date = parseDateKey(value)
  return date ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}` : '—'
}

export const formatWeekRange = weekStart => {
  const days = weekDays(weekStart)
  if (days.length === 0) return '—'
  const last = parseDateKey(days[6].date)
  return `${formatShortDate(days[0].date)} – ${formatShortDate(days[6].date)}/${last.getFullYear()}`
}

// Danh sách ca cho form lấy từ cấu hình chấm công (đã normalize), thêm lựa chọn Nghỉ.
export const buildShiftOptions = settings => {
  const shifts = Object.values(settings?.shifts || {})
    .filter(shift => shift?.id && shift.standardCheckIn && shift.standardCheckOut)
    .map(shift => ({
      id: shift.id,
      name: shift.name,
      start: shift.standardCheckIn,
      end: shift.standardCheckOut
    }))
  return [...shifts, DAY_OFF_SHIFT]
}

export const describeShift = shift => {
  if (!shift) return '—'
  const name = shift.shift_name || shift.name || ''
  const start = shift.start_time ?? shift.start
  const end = shift.end_time ?? shift.end
  return start && end ? `${name} (${start}–${end})` : name
}

// Từ ô chọn ca của từng ngày -> các dòng cần ghi. Bỏ qua ngày chưa chọn hoặc
// ngày đã được duyệt (không sửa được) hoặc không đổi so với dữ liệu hiện có.
export const buildRegistrationChanges = ({ days, selections, existingByDate, options }) => {
  const upserts = []
  const removals = []
  days.forEach(({ date }) => {
    const existingValue = existingByDate[date]
    const existing = Array.isArray(existingValue) ? existingValue : existingValue ? [existingValue] : []
    const selectionValue = selections[date]
    const selectedIds = new Set(Array.isArray(selectionValue) ? selectionValue : selectionValue ? [selectionValue] : [])
    const approvedIds = new Set(existing.filter(row => row.status === 'approved').map(row => row.shift_id))
    if (approvedIds.has('off')) {
      selectedIds.clear()
      selectedIds.add('off')
    }
    else if (approvedIds.size) selectedIds.delete('off')
    else if (selectedIds.has('off')) {
      selectedIds.clear()
      selectedIds.add('off')
    }
    const retainedIds = new Set([...selectedIds, ...approvedIds])

    existing.forEach(row => {
      if (row.status !== 'approved' && !retainedIds.has(row.shift_id)) removals.push(row.id)
    })

    selectedIds.forEach(shiftId => {
      const row = existing.find(item => item.shift_id === shiftId)
      if (row && row.status !== 'rejected') return
      const option = options.find(item => item.id === shiftId)
      if (!option) return
      upserts.push({
        work_date: date,
        shift_id: option.id,
        shift_name: option.name,
        start_time: option.start || null,
        end_time: option.end || null
      })
    })
  })
  return { upserts, removals }
}
