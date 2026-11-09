import { normalizeString } from './helpers.js'

export const DEFAULT_ATTENDANCE_SHIFT = Object.freeze({
  name: 'Ca Hành chính',
  start: '08:30',
  end: '17:30'
})

export const SALE_ATTENDANCE_SHIFT = Object.freeze({
  name: 'Ca Sáng Sale',
  start: '04:00',
  end: '13:30'
})

export const ATTENDANCE_SHIFT_IDS = Object.freeze({
  ADMINISTRATIVE: 'administrative',
  SALE_MORNING: 'saleMorning'
})

const firstValue = (...values) =>
  values.find(value => value !== null && value !== undefined && String(value).trim() !== '')

const normalizeTime = value => {
  const text = String(value || '').trim()
  const meridiem = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP])\.?M\.?$/i)
  if (meridiem) {
    const rawHour = Number(meridiem[1])
    const minutes = Number(meridiem[2])
    if (rawHour < 1 || rawHour > 12 || minutes > 59) return ''
    const hours = (rawHour % 12) + (meridiem[3].toUpperCase() === 'P' ? 12 : 0)
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!match) return ''
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return ''
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const normalizeSessionWorkdays = (value, fallback = 0.5) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(1, Math.max(0, parsed))
}

const normalizeSplitShift = value => {
  const source = value && typeof value === 'object' ? value : {}
  const morning = source.morning && typeof source.morning === 'object' ? source.morning : {}
  const afternoon = source.afternoon && typeof source.afternoon === 'object' ? source.afternoon : {}
  return {
    enabled: source.enabled === true,
    morning: {
      start: normalizeTime(morning.start),
      end: normalizeTime(morning.end),
      workdays: normalizeSessionWorkdays(morning.workdays)
    },
    afternoon: {
      start: normalizeTime(afternoon.start),
      end: normalizeTime(afternoon.end),
      workdays: normalizeSessionWorkdays(afternoon.workdays)
    }
  }
}

const normalizeConfiguredShift = (id, value, fallback) => {
  const source = value && typeof value === 'object' ? value : {}
  return {
    id,
    name: String(source.name || fallback.name).trim() || fallback.name,
    standardCheckIn: normalizeTime(source.standardCheckIn || source.start) || fallback.start,
    standardCheckOut: normalizeTime(source.standardCheckOut || source.end) || fallback.end,
    splitShift: normalizeSplitShift(source.splitShift || source.splitSessions)
  }
}
export const normalizeAttendanceShiftSettings = (settings = {}) => {
  const source = settings && typeof settings === 'object' ? settings : {}
  const storedShifts = source.shifts && typeof source.shifts === 'object'
    ? source.shifts
    : {}
  const findStoredShift = id => Array.isArray(storedShifts)
    ? storedShifts.find(shift => shift?.id === id)
    : storedShifts[id]
  const administrativeSource = findStoredShift(ATTENDANCE_SHIFT_IDS.ADMINISTRATIVE)
  const legacyAdministrative = administrativeSource || {
    standardCheckIn: source.standardCheckIn,
    standardCheckOut: source.standardCheckOut
  }

  const configuredStandardMinutes = Number(
    source.standardWorkMinutes ?? source.standardMinutes ?? 480
  )
  const standardWorkMinutes = Number.isFinite(configuredStandardMinutes) && configuredStandardMinutes > 0
    ? Math.round(configuredStandardMinutes)
    : 480
  const configuredBreakMinutes = Number(source.unpaidBreakMinutes ?? source.breakMinutes ?? 0)
  const unpaidBreakMinutes = Number.isFinite(configuredBreakMinutes) && configuredBreakMinutes >= 0
    ? Math.round(configuredBreakMinutes)
    : 0
  const overtimeSource = source.overtime && typeof source.overtime === 'object'
    ? source.overtime
    : {}
  const holidays = Array.isArray(source.holidays)
    ? source.holidays
      .map(item => {
        if (typeof item === 'string') return { date: item.slice(0, 10), name: '' }
        return {
          date: String(item?.date || item?.day || '').slice(0, 10),
          name: String(item?.name || item?.label || '').trim()
        }
      })
      .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date))
    : []

  return {
    timezone: source.timezone || 'Asia/Ho_Chi_Minh',
    standardWorkMinutes,
    unpaidBreakMinutes,
    // HR vẫn là người duyệt tăng ca. Có thể bật rule tự động cho dữ liệu
    // online/manual, còn import Excel tự đánh dấu tắt ở từng bản ghi.
    overtime: {
      autoCalculate: overtimeSource.autoCalculate !== false
    },
    holidays,
    shifts: {
      ...Object.fromEntries(
        (Array.isArray(storedShifts)
          ? storedShifts.map(shift => [shift?.id, shift])
          : Object.entries(storedShifts))
          .filter(([id, shift]) => id && shift && typeof shift === 'object' &&
            !Object.values(ATTENDANCE_SHIFT_IDS).includes(id))
          .map(([id, shift]) => [id, normalizeConfiguredShift(id, shift, DEFAULT_ATTENDANCE_SHIFT)])
      ),
      [ATTENDANCE_SHIFT_IDS.ADMINISTRATIVE]: normalizeConfiguredShift(
        ATTENDANCE_SHIFT_IDS.ADMINISTRATIVE,
        legacyAdministrative,
        DEFAULT_ATTENDANCE_SHIFT
      ),
      [ATTENDANCE_SHIFT_IDS.SALE_MORNING]: normalizeConfiguredShift(
        ATTENDANCE_SHIFT_IDS.SALE_MORNING,
        findStoredShift(ATTENDANCE_SHIFT_IDS.SALE_MORNING),
        SALE_ATTENDANCE_SHIFT
      )
    }
  }
}

export const getAttendanceShiftOptions = settings =>
  Object.values(normalizeAttendanceShiftSettings(settings).shifts)

export const buildAttendanceShiftSettingsPayload = settings => {
  const normalized = normalizeAttendanceShiftSettings(settings)
  const administrative = normalized.shifts[ATTENDANCE_SHIFT_IDS.ADMINISTRATIVE]
  return {
    timezone: normalized.timezone,
    standardWorkMinutes: normalized.standardWorkMinutes,
    unpaidBreakMinutes: normalized.unpaidBreakMinutes,
    overtime: normalized.overtime,
    holidays: normalized.holidays,
    shifts: normalized.shifts,
    // Giữ hai trường cũ để các bản triển khai chưa cập nhật vẫn đọc đúng ca hành chính.
    standardCheckIn: administrative.standardCheckIn,
    standardCheckOut: administrative.standardCheckOut
  }
}

const shiftFromConfiguration = (shift, settings) => {
  const configured = normalizeAttendanceShiftSettings(settings).shifts[shift]
  return configured
    ? {
        name: configured.name,
        start: configured.standardCheckIn,
        end: configured.standardCheckOut,
        ...(configured.splitShift?.enabled ? { splitShift: configured.splitShift } : {})
      }
    : null
}

const nearestConfiguredShift = (checkIn, settings) => {
  const checkInMinutes = attendanceTimeToMinutes(checkIn)
  if (checkInMinutes === null) return null

  const configured = normalizeAttendanceShiftSettings(settings).shifts
  const nearest = Object.values(configured)
    .map(shift => {
      const startMinutes = attendanceTimeToMinutes(shift.standardCheckIn)
      return {
        shift,
        distance: startMinutes === null ? Infinity : Math.abs(checkInMinutes - startMinutes)
      }
    })
    .filter(item => Number.isFinite(item.distance))
    .sort((left, right) => left.distance - right.distance)[0]

  return nearest ? shiftFromConfiguration(nearest.shift.id, settings) : null
}

const configuredShiftFromName = (value, settings) => {
  const normalizedName = normalizeString(value)
  if (!normalizedName) return null
  const configured = normalizeAttendanceShiftSettings(settings).shifts

  const exact = Object.values(configured).find(shift =>
    normalizeString(shift.id) === normalizedName ||
    normalizeString(shift.name) === normalizedName
  )
  if (exact) {
    return {
      name: exact.name,
      start: exact.standardCheckIn,
      end: exact.standardCheckOut,
      ...(exact.splitShift?.enabled ? { splitShift: exact.splitShift } : {})
    }
  }

  if (/\b(sale|sales)\b/.test(normalizedName) || normalizedName.includes('kinh doanh')) {
    return shiftFromConfiguration(ATTENDANCE_SHIFT_IDS.SALE_MORNING, settings)
  }
  if (['ca hanh chinh', 'hanh chinh', 'ca full', 'ca ngay', 'ngay'].includes(normalizedName)) {
    return shiftFromConfiguration(ATTENDANCE_SHIFT_IDS.ADMINISTRATIVE, settings)
  }
  return null
}

const attachConfiguredSplitShift = (shift, sourceName, settings) => {
  const namedShift = configuredShiftFromName(sourceName, settings)
  const matchedShift = namedShift || Object.values(
    normalizeAttendanceShiftSettings(settings).shifts
  ).find(configured =>
    configured.standardCheckIn === shift.start &&
    configured.standardCheckOut === shift.end
  )

  return matchedShift?.splitShift?.enabled
    ? { ...shift, splitShift: matchedShift.splitShift }
    : shift
}

const rangeFromText = value => {
  const match = String(value || '').match(
    /(\d{1,2}:\d{2})\s*(?:-|–|—|đến|tới)\s*(\d{1,2}:\d{2})/i
  )
  if (!match) return null
  const start = normalizeTime(match[1])
  const end = normalizeTime(match[2])
  return start && end ? { start, end } : null
}

const employeeShiftFields = employee => [
  employee?.ca_lam_viec,
  employee?.shift,
  employee?.shiftName,
  employee?.tenCa
]

const employeeIsSale = (employee, log) => {
  const position = normalizeString(
    employee?.vi_tri || employee?.position || log?.position || log?.chucVu || ''
  )
  if (/xuat nhap khau|thu mua|ke toan|van hanh|admin|nhan su|\bhr\b|designer|content|media|leader/.test(position)) {
    return false
  }

  const department = normalizeString(
    employee?.bo_phan || employee?.department || log?.department || log?.phongBan || ''
  )
  const identity = normalizeString([
    employee?.bo_phan,
    employee?.department,
    employee?.vi_tri,
    employee?.position,
    ...employeeShiftFields(employee),
    log?.department,
    log?.phongBan,
    log?.position,
    log?.chucVu
  ].filter(Boolean).join(' '))

  const isSaleRole = department === 'trang' ||
    /(^|\s)(sale|sales)(\s|$)/.test(identity) ||
    identity.includes('kinh doanh')

  if (!isSaleRole) return false

  return true
}

export const resolveAttendanceShift = (employee = {}, log = {}, settings = {}) => {
  employee = employee && typeof employee === 'object' ? employee : {}
  log = log && typeof log === 'object' ? log : {}
  // A punch belongs to the shift explicitly stored with that attendance row.
  // In particular, the registered shift id must win over a role-based fallback.
  const logShiftId = configuredShiftFromName(log.shiftId, settings)
  if (logShiftId) return logShiftId

  const employeeStart = normalizeTime(firstValue(
    employee.standardCheckIn,
    employee.shiftStart,
    employee.shift_start,
    employee.gio_vao_ca
  ))
  const employeeEnd = normalizeTime(firstValue(
    employee.standardCheckOut,
    employee.shiftEnd,
    employee.shift_end,
    employee.gio_ra_ca
  ))
  if (employeeStart && employeeEnd) {
    const name = firstValue(...employeeShiftFields(employee)) || 'Ca nhân viên'
    return attachConfiguredSplitShift({
      name,
      start: employeeStart,
      end: employeeEnd
    }, name, settings)
  }

  const employeeRange = employeeShiftFields(employee)
    .map(rangeFromText)
    .find(Boolean)
  if (employeeRange) {
    const name = firstValue(...employeeShiftFields(employee)) || 'Ca nhân viên'
    return attachConfiguredSplitShift({
      name,
      ...employeeRange
    }, name, settings)
  }

  const logStart = normalizeTime(firstValue(
    log.standardCheckIn,
    log.shiftStart,
    log.shift_start,
    log.gio_vao_ca
  ))
  const logEnd = normalizeTime(firstValue(
    log.standardCheckOut,
    log.shiftEnd,
    log.shift_end,
    log.gio_ra_ca
  ))
  if (logStart && logEnd) {
    const name = firstValue(log.shiftName, log.tenCa) || 'Ca chấm công'
    return attachConfiguredSplitShift({
      name,
      start: logStart,
      end: logEnd
    }, name, settings)
  }

  const logRange = [log.shiftName, log.tenCa]
    .map(rangeFromText)
    .find(Boolean)
  if (logRange) {
    const name = firstValue(log.shiftName, log.tenCa) || 'Ca chấm công'
    return attachConfiguredSplitShift({
      name,
      ...logRange
    }, name, settings)
  }

  const logConfiguredShift = [log.shiftName, log.tenCa]
    .map(value => configuredShiftFromName(value, settings))
    .find(Boolean)
  if (logConfiguredShift) return logConfiguredShift

  // When a punch has no row-specific shift, choose the closest configured start.
  // Profile role/name fallbacks are only used when no punch time is available.
  const nearestShift = nearestConfiguredShift(firstValue(log.vao, log.checkIn), settings)
  if (nearestShift) return nearestShift

  if (employeeIsSale(employee, log)) {
    return configuredShiftFromName('Ca Sáng Sale', settings) || SALE_ATTENDANCE_SHIFT
  }

  const employeeConfiguredShift = configuredShiftFromName(
    firstValue(...employeeShiftFields(employee)),
    settings
  )
  if (employeeConfiguredShift) return employeeConfiguredShift

  return shiftFromConfiguration(ATTENDANCE_SHIFT_IDS.ADMINISTRATIVE, settings) || DEFAULT_ATTENDANCE_SHIFT
}

export const attendanceTimeToMinutes = value => {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number' && value > 0 && value < 1) {
    return Math.round(value * 24 * 60) % (24 * 60)
  }

  const direct = normalizeTime(value)
  if (direct) {
    const [hours, minutes] = direct.split(':').map(Number)
    return hours * 60 + minutes
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)
  const hours = Number(parts.find(part => part.type === 'hour')?.value)
  const minutes = Number(parts.find(part => part.type === 'minute')?.value)
  return Number.isFinite(hours) && Number.isFinite(minutes)
    ? hours * 60 + minutes
    : null
}

export const formatAttendanceTime = value => {
  const minutes = attendanceTimeToMinutes(value)
  if (minutes === null) return ''
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export const calculateAttendanceTiming = ({
  employee = {},
  log = {},
  checkIn,
  checkOut,
  attendanceSettings = {}
} = {}) => {
  log = log && typeof log === 'object' ? log : {}
  const shift = resolveAttendanceShift(employee, {
    ...log,
    vao: firstValue(checkIn, log.vao, log.checkIn)
  }, attendanceSettings)
  const actualCheckIn = firstValue(checkIn, log.vao, log.checkIn)
  const actualCheckOut = firstValue(checkOut, log.ra, log.checkOut)
  const checkInMinutes = attendanceTimeToMinutes(actualCheckIn)
  const checkOutMinutes = attendanceTimeToMinutes(actualCheckOut)
  const shiftStartMinutes = attendanceTimeToMinutes(shift.start)
  const shiftEndMinutes = attendanceTimeToMinutes(shift.end)

  // Ca đêm có giờ kết thúc nhỏ hơn giờ bắt đầu. Quy đổi mốc kết thúc và
  // giờ ra sang ngày kế tiếp trước khi tính về sớm để không sinh số âm.
  const overnightShift =
    shiftStartMinutes !== null &&
    shiftEndMinutes !== null &&
    shiftEndMinutes <= shiftStartMinutes
  const adjustedShiftEndMinutes = overnightShift
    ? shiftEndMinutes + 24 * 60
    : shiftEndMinutes
  const adjustedCheckInMinutes =
    overnightShift && checkInMinutes !== null && checkInMinutes <= shiftEndMinutes
      ? checkInMinutes + 24 * 60
      : checkInMinutes
  const adjustedCheckOutMinutes =
    overnightShift && checkOutMinutes !== null && checkOutMinutes < shiftStartMinutes
      ? checkOutMinutes + 24 * 60
      : checkOutMinutes

  let effectiveStartMinutes = shiftStartMinutes
  let effectiveEndMinutes = adjustedShiftEndMinutes
  const splitShift = shift.splitShift
  if (splitShift?.enabled && !overnightShift) {
    const sessions = [splitShift.morning, splitShift.afternoon]
      .map(session => ({
        start: attendanceTimeToMinutes(session?.start),
        end: attendanceTimeToMinutes(session?.end)
      }))
    if (sessions.every(session =>
      session.start !== null && session.end !== null && session.start < session.end
    )) {
      if (checkInMinutes !== null && checkOutMinutes !== null) {
        const attended = sessions.filter(session =>
          checkInMinutes < session.end && checkOutMinutes > session.start
        )
        if (attended.length) {
          effectiveStartMinutes = attended[0].start
          effectiveEndMinutes = attended[attended.length - 1].end
        } else {
          // Chấm hoàn toàn trong khoảng nghỉ/ngoài ca không tạo phạt giả.
          effectiveStartMinutes = checkInMinutes
          effectiveEndMinutes = checkOutMinutes
        }
      } else if (checkInMinutes !== null) {
        effectiveStartMinutes =
          sessions.find(session => checkInMinutes < session.end)?.start ??
          sessions[sessions.length - 1].start
      } else if (checkOutMinutes !== null) {
        effectiveEndMinutes =
          [...sessions].reverse().find(session => checkOutMinutes > session.start)?.end ??
          sessions[0].end
      }
    }
  }

  return {
    shift,
    hasCheckIn: checkInMinutes !== null,
    hasCheckOut: checkOutMinutes !== null,
    lateMinutes: checkInMinutes === null
      ? null
      : Math.max(0, adjustedCheckInMinutes - effectiveStartMinutes),
    earlyMinutes: adjustedCheckOutMinutes === null
      ? null
      : Math.max(0, effectiveEndMinutes - adjustedCheckOutMinutes)
  }
}

const numericValue = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const applyCalculatedAttendanceTiming = (log = {}, employee = {}, attendanceSettings = {}) => {
  const timing = calculateAttendanceTiming({ employee, log, attendanceSettings })
  const lateMinutes = timing.hasCheckIn
    ? timing.lateMinutes
    : numericValue(log.lateMinutes ?? log.vaoTre)
  const earlyMinutes = timing.hasCheckOut
    ? timing.earlyMinutes
    : numericValue(log.earlyMinutes ?? log.raSom)

  return {
    ...log,
    shiftName: log.shiftName || log.tenCa || timing.shift.name,
    tenCa: log.tenCa || log.shiftName || timing.shift.name,
    lateMinutes,
    earlyMinutes,
    vaoTre: lateMinutes,
    raSom: earlyMinutes
  }
}
