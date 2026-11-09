import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fbGet, fbGetAttendanceByEmployee, fbGetAttendanceLogsByMonth } from '../services/firebase'
import {
  applyCalculatedAttendanceTiming,
  normalizeAttendanceShiftSettings
} from '../utils/attendanceShift'
import './AttendanceHistory.css'

const formatTime = value => {
  if (!value) return '—'
  const text = String(value)
  const direct = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (direct) {
    const hh = direct[1].padStart(2, '0')
    return direct[3] ? `${hh}:${direct[2]}:${direct[3]}` : `${hh}:${direct[2]}`
  }
  const date = new Date(value)
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleTimeString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    })
  }
  return text
}

const displayDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return value || '—'
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

const initialsOf = name => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

const isOnlineAttendanceLog = log =>
  String(log?.source || '') === 'employee-online' ||
  String(log?.workMode || '').toLowerCase() === 'online'

const punchPairsForLog = log => Array.isArray(log?.punchPairs) && log.punchPairs.length
  ? log.punchPairs
  : [{
      checkIn: log?.vao || log?.checkIn,
      checkOut: log?.ra || log?.checkOut,
      checkInLocation: log?.checkInLocation,
      checkOutLocation: log?.checkOutLocation,
      checkInPhoto: log?.checkInPhoto,
      checkOutPhoto: log?.checkOutPhoto
    }]

const withAttendanceTiming = (log, employee, settings) => {
  const pairs = log?.punchPairs
  if (!Array.isArray(pairs) || !pairs.length) return applyCalculatedAttendanceTiming(log, employee || {}, settings)
  const firstPunch = pairs.find(pair => pair.checkIn)
  const lastPunch = [...pairs].reverse().find(pair => pair.checkOut)
  const valueOrFallback = (pair, field, fallback) => pair?.[field] !== null && pair?.[field] !== undefined && pair?.[field] !== ''
    ? Number(pair[field]) || 0
    : Number(fallback) || 0
  const lateMinutes = valueOrFallback(firstPunch, 'lateMinutes', log.lateMinutes ?? log.vaoTre)
  const earlyMinutes = valueOrFallback(lastPunch, 'earlyMinutes', log.earlyMinutes ?? log.raSom)
  return {
    ...log,
    checkInLocation: log.checkInLocation || firstPunch?.checkInLocation,
    checkOutLocation: log.checkOutLocation || lastPunch?.checkOutLocation,
    checkInPhoto: log.checkInPhoto || firstPunch?.checkInPhoto,
    checkOutPhoto: log.checkOutPhoto || lastPunch?.checkOutPhoto,
    lateMinutes,
    earlyMinutes,
    vaoTre: lateMinutes,
    raSom: earlyMinutes
  }
}

const buildMapsUrl = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`

const formatLocationLabel = location => {
  if (!location) return '—'
  if (location.error) {
    if (location.error === 'denied') return 'Không có vị trí (bị từ chối)'
    if (location.error === 'unsupported') return 'Thiết bị không hỗ trợ GPS'
    if (location.error === 'timeout') return 'Hết thời gian lấy vị trí'
    return 'Không lấy được vị trí'
  }
  if (location.lat == null || location.lng == null) return '—'
  if (location.address) return location.address
  const lat = Number(location.lat).toFixed(5)
  const lng = Number(location.lng).toFixed(5)
  return `${lat}, ${lng}`
}

const LocationCell = ({ location }) => {
  if (!location || location.error || location.lat == null || location.lng == null) {
    return <span className="ah-loc ah-loc--empty">{formatLocationLabel(location)}</span>
  }
  const text = formatLocationLabel(location)
  const href = location.mapsUrl || buildMapsUrl(location.lat, location.lng)
  return (
    <div className="ah-loc">
      <a href={href} target="_blank" rel="noreferrer" title="Mở Google Maps">
        <i className="fas fa-location-dot" aria-hidden="true"></i> {text}
      </a>
      {location.accuracy != null && Number.isFinite(Number(location.accuracy)) ? (
        <small>±{Math.round(Number(location.accuracy))}m</small>
      ) : null}
      {location.device ? <small className="ah-loc__device">{location.device}</small> : null}
    </div>
  )
}

function AttendanceHistory() {
  const { user } = useAuth()
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'hr' || user?.role === 'manager'
  const [attendanceSettings, setAttendanceSettings] = useState(() => normalizeAttendanceShiftSettings())
  const [historyLogs, setHistoryLogs] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const initialMonthResolved = useRef(false)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  useEffect(() => {
    fbGet('hr/attendanceSettings/default')
      .then(settings => setAttendanceSettings(normalizeAttendanceShiftSettings(settings)))
      .catch(() => {})
  }, [])

  const loadHistory = useCallback(async () => {
    if (!user?.id && !user?.auth_user_id) return
    setHistoryLoading(true)
    setHistoryError('')
    try {
      if (isAdminOrManager) {
        const month = selectedMonth || new Date().toISOString().slice(0, 7)
        const data = await fbGetAttendanceLogsByMonth(month)
        const list = Object.entries(data || {})
          .map(([id, val]) => withAttendanceTiming({ ...val, id }, null, attendanceSettings))
          .filter(isOnlineAttendanceLog)
        list.sort((a, b) => {
          const byDate = String(b.date || '').localeCompare(String(a.date || ''))
          if (byDate) return byDate
          return String(a.employeeName || '').localeCompare(String(b.employeeName || ''), 'vi')
        })
        setHistoryLogs(list)
      } else {
        const data = await fbGetAttendanceByEmployee(user)
        if (data) {
          const list = Object.entries(data).map(([id, val]) =>
            withAttendanceTiming({ ...val, id }, user, attendanceSettings)
          )
          list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
          setHistoryLogs(list)
          if (!initialMonthResolved.current) {
            initialMonthResolved.current = true
            setSelectedMonth(current => list.some(log => String(log.date || '').startsWith(current))
              ? current
              : String(list[0]?.date || '').slice(0, 7) || current)
          }
        } else {
          setHistoryLogs([])
        }
      }
    } catch (error) {
      console.warn('Lỗi tải lịch sử chấm công:', error)
      setHistoryError(error?.message || 'Không thể tải lịch sử chấm công.')
    } finally {
      setHistoryLoading(false)
    }
  }, [attendanceSettings, isAdminOrManager, selectedMonth, user])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const availableMonths = useMemo(() => {
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
    const set = new Set([currentMonth, selectedMonth].filter(Boolean))
    historyLogs.forEach(log => {
      const ym = String(log.date || '').slice(0, 7)
      if (/^\d{4}-\d{2}$/.test(ym)) set.add(ym)
    })
    if (isAdminOrManager) {
      const now = new Date()
      for (let i = 0; i < 6; i += 1) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }
    }
    return Array.from(set).sort().reverse()
  }, [historyLogs, isAdminOrManager, selectedMonth])

  const filteredLogs = useMemo(() => {
    if (isAdminOrManager) return historyLogs
    if (!selectedMonth) return historyLogs
    return historyLogs.filter(log => String(log.date || '').startsWith(selectedMonth))
  }, [historyLogs, isAdminOrManager, selectedMonth])

  const stats = useMemo(() => {
    let late = 0
    let early = 0
    let onTime = 0
    filteredLogs.forEach(log => {
      const isLate = Number(log.lateMinutes || log.vaoTre || 0) > 0
      const isEarly = Number(log.earlyMinutes || log.raSom || 0) > 0
      if (isLate) late += 1
      if (isEarly) early += 1
      if (!isLate && !isEarly) onTime += 1
    })
    const attendanceDays = new Set(filteredLogs.map(log => `${log.employeeId || user.id}::${String(log.date || '').slice(0, 10)}`))
    return { total: attendanceDays.size, late, early, onTime }
  }, [filteredLogs, user.id])

  const monthLabel = `${selectedMonth.split('-')[1]}/${selectedMonth.split('-')[0]}`

  return (
    <div className="ah-page">
      <header className="ah-header">
        <div>
          <h1 className="ah-title">Lịch sử chấm công</h1>
          <p className="ah-subtitle">
            {user.ho_va_ten || user.name || user.email}
            {isAdminOrManager ? ' · Toàn bộ nhân sự' : ''}
          </p>
        </div>
        <div className="ah-actions">
          <Link className="ah-link-btn" to="/cham-cong-online">
            <i className="fas fa-camera" aria-hidden="true"></i> Chấm công online
          </Link>
          <Link
            className="ah-link-btn ah-link-btn--primary"
            to={isAdminOrManager ? '/bang-cong-preview' : '/bang-cong'}
          >
            <i className="fas fa-calendar-check" aria-hidden="true"></i> Xem bảng công
          </Link>
        </div>
      </header>

      <div className="ah-toolbar">
        <div className="ah-kpis">
          <div className="ah-kpi">
            <span className="ah-kpi__value">{stats.total}</span>
            <span className="ah-kpi__label">Ngày công</span>
          </div>
          <div className="ah-kpi ah-kpi--ok">
            <span className="ah-kpi__value">{stats.onTime}</span>
            <span className="ah-kpi__label">Đúng giờ</span>
          </div>
          <div className="ah-kpi ah-kpi--late">
            <span className="ah-kpi__value">{stats.late}</span>
            <span className="ah-kpi__label">Đi muộn</span>
          </div>
          <div className="ah-kpi ah-kpi--early">
            <span className="ah-kpi__value">{stats.early}</span>
            <span className="ah-kpi__label">Về sớm</span>
          </div>
        </div>

        <div className="ah-toolbar__right">
          <label className="ah-month">
            <span>Tháng</span>
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
              {availableMonths.map(m => (
                <option key={m} value={m}>
                  Tháng {m.split('-')[1]}/{m.split('-')[0]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ah-refresh"
            onClick={loadHistory}
            disabled={historyLoading}
            title="Tải lại dữ liệu"
            aria-label="Tải lại dữ liệu"
          >
            <i className={`fas fa-rotate${historyLoading ? ' fa-spin' : ''}`} aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <section className="ah-card">
        {historyError && <p role="alert" className="ah-error">{historyError}</p>}
        <div className="ah-card__head">
          <h2 className="ah-card__title">Bảng danh sách chấm công</h2>
          <span className="ah-card__meta">
            {historyLoading ? 'Đang tải…' : `Tháng ${monthLabel} · ${filteredLogs.length} bản ghi`}
          </span>
        </div>

        <div className="ah-table-scroll">
          <table className="ah-table">
            <thead>
              <tr>
                <th className="ah-col-index">STT</th>
                {isAdminOrManager && <th>Nhân viên</th>}
                <th>Ngày</th>
                <th>Thứ</th>
                <th>Giờ vào</th>
                <th>Vị trí vào</th>
                <th>Ảnh vào</th>
                <th>Giờ ra</th>
                <th>Vị trí ra</th>
                <th>Ảnh ra</th>
                <th className="ah-col-num">Tổng giờ</th>
                <th className="ah-col-num">Đi muộn</th>
                <th className="ah-col-num">Về sớm</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={isAdminOrManager ? 14 : 13} className="ah-empty">
                    {historyLoading ? (
                      <>
                        <i className="fas fa-spinner fa-spin" aria-hidden="true"></i>
                        <span>Đang tải lịch sử chấm công…</span>
                      </>
                    ) : (
                      <>
                        <i className="fas fa-calendar-xmark" aria-hidden="true"></i>
                        <span>Chưa có lịch sử chấm công nào trong tháng {monthLabel}.</span>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, idx) => {
                  const punchPairs = punchPairsForLog(log)
                  const isLate = Number(log.lateMinutes || log.vaoTre || 0) > 0
                  const isEarly = Number(log.earlyMinutes || log.raSom || 0) > 0
                  const status = log.status || (isLate ? 'Đi muộn' : 'Đúng giờ')
                  return (
                    <tr key={log.id || idx}>
                      <td className="ah-col-index">{idx + 1}</td>
                      {isAdminOrManager && (
                        <td data-label="Nhân viên">
                          <div className="ah-emp">
                            <span className="ah-emp__avatar">{initialsOf(log.employeeName || log.name)}</span>
                            <span className="ah-emp__info">
                              <span className="ah-emp__name">{log.employeeName || log.name || '—'}</span>
                              {log.employeeCode ? <span className="ah-emp__code">{log.employeeCode}</span> : null}
                            </span>
                          </div>
                        </td>
                      )}
                      <td data-label="Ngày">
                        <strong className="ah-date">{displayDate(log.date)}</strong>
                        {log.shiftName || log.tenCa ? <small className="ah-shift-name">{log.shiftName || log.tenCa}</small> : null}
                      </td>
                      <td data-label="Thứ">{log.dayOfWeek || '—'}</td>
                      <td data-label="Giờ vào">
                        <div className="ah-punch-list">{punchPairs.map((pair, pairIndex) => <span className="ah-time" key={`in-${pairIndex}`}>{formatTime(pair.checkIn)}</span>)}</div>
                      </td>
                      <td data-label="Vị trí vào">
                        <LocationCell location={log.checkInLocation} />
                      </td>
                      <td data-label="Ảnh vào">
                        {log.checkInPhoto ? (
                          <a href={log.checkInPhoto} target="_blank" rel="noreferrer" title="Bấm xem ảnh">
                            <img src={log.checkInPhoto} alt="Ảnh check-in" className="ah-thumb" />
                          </a>
                        ) : (
                          <span className="ah-loc--empty">—</span>
                        )}
                      </td>
                      <td data-label="Giờ ra">
                        <div className="ah-punch-list">{punchPairs.map((pair, pairIndex) => <span className="ah-time" key={`out-${pairIndex}`}>{formatTime(pair.checkOut)}</span>)}</div>
                      </td>
                      <td data-label="Vị trí ra">
                        <LocationCell location={log.checkOutLocation} />
                      </td>
                      <td data-label="Ảnh ra">
                        {log.checkOutPhoto ? (
                          <a href={log.checkOutPhoto} target="_blank" rel="noreferrer" title="Bấm xem ảnh">
                            <img src={log.checkOutPhoto} alt="Ảnh check-out" className="ah-thumb" />
                          </a>
                        ) : (
                          <span className="ah-loc--empty">—</span>
                        )}
                      </td>
                      <td data-label="Tổng giờ" className="ah-col-num">
                        <strong>{log.hours || log.gio || 0}h</strong>
                      </td>
                      <td data-label="Đi muộn" className="ah-col-num">
                        {isLate ? (
                          <span className="ah-min ah-min--late">{log.lateMinutes || log.vaoTre}p</span>
                        ) : (
                          <span className="ah-min ah-min--ok">0p</span>
                        )}
                      </td>
                      <td data-label="Về sớm" className="ah-col-num">
                        {isEarly ? (
                          <span className="ah-min ah-min--early">{log.earlyMinutes || log.raSom}p</span>
                        ) : (
                          <span className="ah-min ah-min--ok">0p</span>
                        )}
                      </td>
                      <td data-label="Trạng thái">
                        <span className={`ah-status ${isLate ? 'ah-status--late' : 'ah-status--ok'}`}>
                          <span className="ah-status__dot" aria-hidden="true"></span>
                          {status}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default AttendanceHistory
