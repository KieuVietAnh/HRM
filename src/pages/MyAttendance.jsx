import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fbGet, fbGetAttendanceByEmployee } from '../services/firebase'
import { loadAttendanceCorrectionRequests, submitAttendanceCorrection } from '../services/attendanceCorrections'
import { buildAttendanceSummary } from '../utils/attendanceSummary'
import { uploadToCloudinary } from '../utils/cloudinary'
import { todayLocalDate } from '../utils/leaveDays'
import {
  applyCalculatedAttendanceTiming,
  formatAttendanceTime,
  normalizeAttendanceShiftSettings
} from '../utils/attendanceShift'
import './MyAttendance.css'

const dateValue = log => String(log?.date || log?.timestamp || '').slice(0, 10)
const numberValue = value => Number.isFinite(Number(value)) ? Number(value) : 0
const decimalValue = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? '—' : Number(value).toFixed(2)
const timeValue = value => {
  return formatAttendanceTime(value) || '—'
}
const punchesForLog = log => Array.isArray(log?.punchPairs) && log.punchPairs.length
  ? log.punchPairs
  : [{ checkIn: log?.vao || log?.checkIn, checkOut: log?.ra || log?.checkOut }]
const timingForLog = (log, employee, settings) => {
  const pairs = log?.punchPairs
  if (!Array.isArray(pairs) || !pairs.length) return applyCalculatedAttendanceTiming(log, employee, settings)
  const firstPunch = pairs.find(pair => pair.checkIn)
  const lastPunch = [...pairs].reverse().find(pair => pair.checkOut)
  const valueOrFallback = (pair, key, fallback) => pair?.[key] !== null && pair?.[key] !== undefined && pair?.[key] !== ''
    ? numberValue(pair[key])
    : numberValue(fallback)
  const lateMinutes = valueOrFallback(firstPunch, 'lateMinutes', log.lateMinutes ?? log.vaoTre)
  const earlyMinutes = valueOrFallback(lastPunch, 'earlyMinutes', log.earlyMinutes ?? log.raSom)
  return { ...log, lateMinutes, earlyMinutes, vaoTre: lateMinutes, raSom: earlyMinutes }
}
const requestStatusLabels = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Đã từ chối' }
const requestTimeLabel = value => value === '' ? 'Xóa mốc chấm công' : timeValue(value)

function MyAttendance() {
  const { user } = useAuth()
  const employeeId = String(user.id)
  const [logs, setLogs] = useState([])
  const [attendanceSettings, setAttendanceSettings] = useState(() => normalizeAttendanceShiftSettings())
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [correctionRequests, setCorrectionRequests] = useState([])
  const [correctionError, setCorrectionError] = useState('')
  const [selectedCorrection, setSelectedCorrection] = useState(null)
  const [correctionPairIndex, setCorrectionPairIndex] = useState(0)
  const [correctionForm, setCorrectionForm] = useState({ checkIn: '', checkOut: '', reason: '' })
  const [correctionDate, setCorrectionDate] = useState('')
  const [correctionEvidence, setCorrectionEvidence] = useState(null)
  const [correctionNotice, setCorrectionNotice] = useState('')
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      fbGetAttendanceByEmployee(user),
      fbGet('hr/attendanceSettings/default')
    ]).then(([data, storedSettings]) => {
      if (!active) return
      setAttendanceSettings(normalizeAttendanceShiftSettings(storedSettings))
      const nextLogs = data ? Object.entries(data).map(([id, value]) => ({ ...value, id })) : []
      setLogs(nextLogs)
      const latest = [...new Set(nextLogs.map(dateValue).map(value => value.slice(0, 7)))].filter(value => /^\d{4}-\d{2}$/.test(value)).sort().at(-1)
      if (latest) setMonth(latest)
    }).catch(requestError => {
      console.error('Không tải được Bảng công cá nhân:', requestError)
      if (active) setError('Không thể tải dữ liệu chấm công.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    loadAttendanceCorrectionRequests()
      .then(requests => {
        if (active) {
          setCorrectionRequests(requests)
          setCorrectionError('')
        }
      })
      .catch(requestError => {
        if (active) setCorrectionError(requestError?.message || 'Không thể tải yêu cầu điều chỉnh công.')
      })
    return () => { active = false }
  }, [employeeId])

  const months = useMemo(() => [...new Set(logs.map(dateValue).map(value => value.slice(0, 7)))].filter(value => /^\d{4}-\d{2}$/.test(value)).sort().reverse(), [logs])
  const monthSummaries = useMemo(() => months.map(value => ({
    month: value,
    summary: buildAttendanceSummary({ attendanceLogs: logs, employees: [user], month: value, attendanceSettings })
      .find(row => String(row.employeeId) === employeeId)
  })), [attendanceSettings, employeeId, logs, months, user])
  const monthLogs = useMemo(() => logs
    .filter(log => dateValue(log).startsWith(month))
    .map(log => timingForLog(log, user, attendanceSettings))
    .sort((a, b) => dateValue(a).localeCompare(dateValue(b))), [attendanceSettings, logs, month, user])
  const summary = useMemo(() => buildAttendanceSummary({ attendanceLogs: logs, employees: [user], month, attendanceSettings }).find(row => String(row.employeeId) === employeeId), [attendanceSettings, employeeId, logs, month, user])

  const openCorrectionForm = log => {
    const pairs = punchesForLog(log)
    const openIndex = pairs.findIndex(pair => pair.checkIn && !pair.checkOut)
    const pairIndex = openIndex >= 0 ? openIndex : pairs.length - 1
    const pair = pairs[pairIndex] || {}
    setSelectedCorrection(log)
    setCorrectionEvidence(null)
    setCorrectionPairIndex(pairIndex)
    setCorrectionForm({
      checkIn: formatAttendanceTime(pair.checkIn) || '',
      checkOut: formatAttendanceTime(pair.checkOut) || '',
      reason: ''
    })
    setCorrectionNotice('')
  }

  const openMissingDayForm = () => {
    if (!correctionDate) return
    if (logs.some(log => dateValue(log) === correctionDate)) {
      setCorrectionNotice('Ngày này đã có chấm công. Hãy chọn yêu cầu sửa ở dòng tương ứng.')
      return
    }
    if (correctionDate > todayLocalDate()) {
      setCorrectionNotice('Không thể yêu cầu cho ngày trong tương lai.')
      return
    }
    setSelectedCorrection({ date: correctionDate, id: null })
    setCorrectionPairIndex(0)
    setCorrectionForm({ checkIn: '', checkOut: '', reason: '' })
    setCorrectionEvidence(null)
    setCorrectionNotice('')
  }

  const submitCorrection = async event => {
    event.preventDefault()
    if (!selectedCorrection || correctionSubmitting) return
    const selectedPair = punchesForLog(selectedCorrection)[correctionPairIndex] || {}
    const originalCheckIn = formatAttendanceTime(selectedPair.checkIn) || ''
    const originalCheckOut = formatAttendanceTime(selectedPair.checkOut) || ''
    const requestedCheckIn = correctionForm.checkIn === originalCheckIn ? null : correctionForm.checkIn
    const requestedCheckOut = correctionForm.checkOut === originalCheckOut ? null : correctionForm.checkOut
    if (!selectedCorrection.id && (!requestedCheckIn || !requestedCheckOut)) {
      setCorrectionNotice('Hãy nhập cả giờ vào và giờ ra cho ngày chưa chấm công.')
      return
    }
    if (requestedCheckIn === null && requestedCheckOut === null) {
      setCorrectionNotice('Hãy thay đổi giờ vào hoặc giờ ra trước khi gửi yêu cầu.')
      return
    }

    setCorrectionSubmitting(true)
    setCorrectionNotice('')
    try {
      let evidenceUrl = ''
      if (correctionEvidence) {
        evidenceUrl = await uploadToCloudinary(correctionEvidence)
        if (!evidenceUrl.startsWith('https://')) throw new Error('Không tải được ảnh minh chứng. Hãy thử lại.')
      }
      await submitAttendanceCorrection({
        date: dateValue(selectedCorrection),
        attendanceLogId: selectedCorrection.id,
        pairIndex: Array.isArray(selectedCorrection.punchPairs) && selectedCorrection.punchPairs.length
          ? correctionPairIndex : null,
        checkIn: requestedCheckIn,
        checkOut: requestedCheckOut,
        reason: correctionForm.reason,
        evidenceUrl
      })
      setSelectedCorrection(null)
      setCorrectionNotice('Yêu cầu đã gửi. Bảng công sẽ cập nhật sau khi được HR hoặc quản lý duyệt.')
      try {
        setCorrectionRequests(await loadAttendanceCorrectionRequests())
        setCorrectionError('')
      } catch (loadError) {
        setCorrectionError(loadError?.message || 'Yêu cầu đã gửi nhưng không tải lại được trạng thái.')
      }
    } catch (requestError) {
      setCorrectionNotice(requestError?.message || 'Không gửi được yêu cầu điều chỉnh công.')
    } finally {
      setCorrectionSubmitting(false)
    }
  }

  const hasPendingCorrection = logId => correctionRequests.some(request =>
    request.attendanceLogId === logId && request.status === 'pending'
  )
  const reviewRole = ['admin', 'hr', 'manager'].includes(String(user?.role || '').toLowerCase())

  return (
    <div className="my-attendance">
      <div className="page-header my-attendance__header">
        <div><h1 className="page-title"><i className="fas fa-calendar-check"></i>Bảng công</h1><p>Thông tin chấm công của {user.ho_va_ten || user.email}</p></div>
        <div className="my-attendance__header-actions"><Link className="btn" to="/cham-cong-online">Chấm công online</Link>{reviewRole && <Link className="btn my-attendance__review-link" to="/yeu-cau-dieu-chinh-cong">Duyệt điều chỉnh công</Link>}<label><span>Tháng</span><select value={month} onChange={event => setMonth(event.target.value)}>{months.length === 0 && <option>{month}</option>}{months.map(value => <option key={value}>{value}</option>)}</select></label></div>
      </div>
      <section className="my-attendance__identity card">
        <div><span>Mã nhân viên</span><strong>{user.employeeId || '—'}</strong></div><div><span>Họ tên</span><strong>{user.ho_va_ten || '—'}</strong></div><div><span>Phòng ban</span><strong>{user.bo_phan || '—'}</strong></div><div><span>Chức vụ</span><strong>{user.vi_tri || '—'}</strong></div>
      </section>
      {loading ? <div className="card my-attendance__state">Đang tải dữ liệu...</div> : error ? <div className="card my-attendance__state is-error">{error}</div> : <>
        <section className="my-attendance__stats">
          <div className="card"><span>Ngày có dữ liệu</span><strong>{summary?.attendanceDays || 0}</strong></div><div className="card"><span>Tổng công</span><strong>{decimalValue(summary?.workdays ?? 0)}</strong></div><div className="card"><span>Tổng giờ</span><strong>{decimalValue(summary?.totalHours ?? 0)}</strong></div><div className="card"><span>Đi muộn</span><strong>{summary?.lateCount || 0} lần</strong><small>{summary?.lateMinutes || 0} phút</small></div><div className="card"><span>Về sớm</span><strong>{summary?.earlyCount || 0} lần</strong><small>{summary?.earlyMinutes || 0} phút</small></div><div className="card"><span>Quên chấm</span><strong>{summary?.missingPunchCount || 0}</strong></div>
        </section>
        <section className="card my-attendance__summary-card">
          <h3>Tổng hợp công theo tháng</h3>
          <div className="my-attendance__summary-table-wrap">
            <table>
              <thead><tr><th>Tháng</th><th>Ngày có dữ liệu</th><th>Tổng công</th><th>Tổng giờ</th><th>Đi muộn</th><th>Về sớm</th><th>Quên chấm</th></tr></thead>
              <tbody>
                {monthSummaries.length ? monthSummaries.map(({ month: summaryMonth, summary: monthlySummary }) => (
                  <tr key={summaryMonth} className={month === summaryMonth ? 'is-selected' : ''}>
                    <td><button type="button" className="my-attendance__month-link" onClick={() => setMonth(summaryMonth)} aria-pressed={month === summaryMonth}>{summaryMonth}</button></td>
                    <td>{monthlySummary?.attendanceDays || 0}</td>
                    <td>{decimalValue(monthlySummary?.workdays ?? 0)}</td>
                    <td>{decimalValue(monthlySummary?.totalHours ?? 0)}</td>
                    <td>{monthlySummary?.lateCount || 0} ({monthlySummary?.lateMinutes || 0} phút)</td>
                    <td>{monthlySummary?.earlyCount || 0} ({monthlySummary?.earlyMinutes || 0} phút)</td>
                    <td>{monthlySummary?.missingPunchCount || 0}</td>
                  </tr>
                )) : <tr><td colSpan="7" className="my-attendance__empty">Chưa có dữ liệu tổng hợp.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card my-attendance__table-card"><h3>Chi tiết chấm công</h3><div className="my-attendance__table-wrap"><table><thead><tr><th>Ngày</th><th>Thứ</th><th>Ca</th><th>Lượt vào/ra</th><th>Công</th><th>Giờ</th><th>Đi muộn</th><th>Về sớm</th><th>Ký hiệu</th><th>Điều chỉnh</th></tr></thead><tbody>
          {monthLogs.length ? monthLogs.map(log => {
            const date = dateValue(log), hours = numberValue(log.tongGio ?? (numberValue(log.hours ?? log.soGio ?? log.gio) + numberValue(log.gioPlus)))
            const pending = hasPendingCorrection(log.id)
            return <tr key={log.id}><td>{date ? new Date(`${date}T00:00:00`).toLocaleDateString('vi-VN') : '—'}</td><td>{log.dayOfWeek || log.thu || '—'}</td><td>{log.shiftName || log.tenCa || '—'}</td><td><div className="my-attendance__punch-list">{punchesForLog(log).map((pair, index) => <span key={`${pair.checkInTimestamp || pair.checkIn}-${index}`}>{timeValue(pair.checkIn)} → {pair.checkOut ? timeValue(pair.checkOut) : 'Đang mở'}</span>)}</div></td><td>{decimalValue(log.cong)}</td><td>{decimalValue(hours)}</td><td className={numberValue(log.lateMinutes ?? log.vaoTre) > 0 ? 'is-warning' : ''}>{numberValue(log.lateMinutes ?? log.vaoTre) || '—'}</td><td className={numberValue(log.earlyMinutes ?? log.raSom) > 0 ? 'is-warning' : ''}>{numberValue(log.earlyMinutes ?? log.raSom) || '—'}</td><td>{log.kyHieu || log.status || '—'}</td><td><button type="button" className="my-attendance__request-button" disabled={pending} onClick={() => openCorrectionForm(log)}>{pending ? 'Đang chờ duyệt' : 'Yêu cầu sửa'}</button></td></tr>
          }) : <tr><td colSpan="10" className="my-attendance__empty">Không có dữ liệu trong tháng này.</td></tr>}
        </tbody></table></div>
        <div className="my-attendance__mobile-list">
          {monthLogs.length ? monthLogs.map(log => {
            const date = dateValue(log)
            const hours = numberValue(log.tongGio ?? (numberValue(log.hours ?? log.soGio ?? log.gio) + numberValue(log.gioPlus)))
            return <article key={log.id} className="my-attendance__mobile-day">
              <div className="my-attendance__mobile-day-head"><strong>{date ? new Date(`${date}T00:00:00`).toLocaleDateString('vi-VN') : '—'}</strong><span>{log.shiftName || log.tenCa || '—'} · {log.kyHieu || log.status || '—'}</span></div>
              <div className="my-attendance__punch-list">{punchesForLog(log).map((pair, index) => <span key={`${pair.checkInTimestamp || pair.checkIn}-${index}`}>Lượt {index + 1}: {timeValue(pair.checkIn)} → {pair.checkOut ? timeValue(pair.checkOut) : 'Đang mở'}</span>)}</div>
              <div className="my-attendance__mobile-day-grid">
                <div><span>Ca</span><strong>{log.shiftName || log.tenCa || '—'}</strong></div>
                <div><span>Công</span><strong>{decimalValue(log.cong)}</strong></div>
                <div><span>Giờ</span><strong>{decimalValue(hours)}</strong></div>
              </div>
              <button type="button" className="my-attendance__request-button" disabled={hasPendingCorrection(log.id)} onClick={() => openCorrectionForm(log)}>{hasPendingCorrection(log.id) ? 'Yêu cầu đang chờ duyệt' : 'Báo chấm công sai hoặc quên chấm ra'}</button>
              {(numberValue(log.lateMinutes ?? log.vaoTre) > 0 || numberValue(log.earlyMinutes ?? log.raSom) > 0) && (
                <p className="my-attendance__mobile-day-warning">
                  {numberValue(log.lateMinutes ?? log.vaoTre) > 0 && `Đi muộn ${numberValue(log.lateMinutes ?? log.vaoTre)} phút`}
                  {numberValue(log.lateMinutes ?? log.vaoTre) > 0 && numberValue(log.earlyMinutes ?? log.raSom) > 0 && ' · '}
                  {numberValue(log.earlyMinutes ?? log.raSom) > 0 && `Về sớm ${numberValue(log.earlyMinutes ?? log.raSom)} phút`}
                </p>
              )}
            </article>
          }) : <p className="my-attendance__mobile-empty">Không có dữ liệu trong tháng này.</p>}
        </div></section>
        <section className="card my-attendance__requests-card">
          <div className="my-attendance__requests-heading"><label>Ngày chưa chấm công <input type="date" value={correctionDate} max={todayLocalDate()} onChange={event => setCorrectionDate(event.target.value)} /></label><button type="button" onClick={openMissingDayForm}>Yêu cầu điều chỉnh</button></div>
          <div className="my-attendance__requests-heading"><div><h3>Yêu cầu điều chỉnh công</h3><p>HR hoặc quản lý sẽ xem xét trước khi cập nhật bảng công.</p></div>{reviewRole && <Link to="/yeu-cau-dieu-chinh-cong">Mở hàng chờ duyệt</Link>}</div>
          {correctionError && <p className="my-attendance__correction-error" role="alert">{correctionError}</p>}
          {correctionNotice && !selectedCorrection && <p className="my-attendance__correction-notice" role="status">{correctionNotice}</p>}
          {correctionRequests.length ? <div className="my-attendance__requests-list">{correctionRequests.slice(0, 8).map(request => (
            <article key={request.id} className="my-attendance__request-row">
              <div><strong>{new Date(`${request.date}T00:00:00`).toLocaleDateString('vi-VN')}{request.pairIndex !== null && request.pairIndex !== undefined ? ` · Lượt ${Number(request.pairIndex) + 1}` : ''}</strong><span>Vào: {request.requestedCheckIn !== null && request.requestedCheckIn !== undefined ? requestTimeLabel(request.requestedCheckIn) : timeValue(request.originalCheckIn)} · Ra: {request.requestedCheckOut !== null && request.requestedCheckOut !== undefined ? requestTimeLabel(request.requestedCheckOut) : timeValue(request.originalCheckOut)}</span></div>
              <span className={`my-attendance__request-status is-${request.status}`}>{requestStatusLabels[request.status] || request.status}</span>
              {request.comment && <small>Phản hồi: {request.comment}</small>}
            </article>
          ))}</div> : !correctionError ? <p className="my-attendance__requests-empty">Bạn chưa gửi yêu cầu điều chỉnh nào.</p> : null}
        </section>
      </>}
      {selectedCorrection && <div className="my-attendance__modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !correctionSubmitting) setSelectedCorrection(null) }}>
        <section className="my-attendance__correction-modal" role="dialog" aria-modal="true" aria-labelledby="my-attendance-correction-title">
          <div className="my-attendance__correction-modal-head"><div><h2 id="my-attendance-correction-title">Yêu cầu điều chỉnh chấm công</h2><p>{new Date(`${dateValue(selectedCorrection)}T00:00:00`).toLocaleDateString('vi-VN')}</p></div><button type="button" aria-label="Đóng" disabled={correctionSubmitting} onClick={() => setSelectedCorrection(null)}>×</button></div>
          <form onSubmit={submitCorrection}>
            <p className="my-attendance__correction-help">Nhập giờ chấm công đúng. Để xóa một mốc bị ghi nhầm, hãy xóa nội dung ô tương ứng.</p>
            {Array.isArray(selectedCorrection.punchPairs) && selectedCorrection.punchPairs.length > 1 && <label>Lượt chấm
              <select value={correctionPairIndex} onChange={event => {
                const index = Number(event.target.value)
                const pair = selectedCorrection.punchPairs[index] || {}
                setCorrectionPairIndex(index)
                setCorrectionForm(current => ({ ...current,
                  checkIn: formatAttendanceTime(pair.checkIn) || '',
                  checkOut: formatAttendanceTime(pair.checkOut) || ''
                }))
              }}>
                {selectedCorrection.punchPairs.map((pair, index) => <option key={index} value={index}>Lượt {index + 1}: {timeValue(pair.checkIn)} → {pair.checkOut ? timeValue(pair.checkOut) : 'Đang mở'}</option>)}
              </select>
            </label>}
            <label>Giờ vào<input type="time" value={correctionForm.checkIn} onChange={event => setCorrectionForm(current => ({ ...current, checkIn: event.target.value }))} /></label>
            <label>Giờ ra<input type="time" value={correctionForm.checkOut} onChange={event => setCorrectionForm(current => ({ ...current, checkOut: event.target.value }))} /><small>Nếu quên chấm công khi kết thúc ca, nhập giờ ra thực tế tại đây.</small></label>
            <label>Lý do<textarea required minLength="5" maxLength="1000" rows="3" value={correctionForm.reason} onChange={event => setCorrectionForm(current => ({ ...current, reason: event.target.value }))} placeholder="Ví dụ: Tôi đã kết thúc ca lúc 17:35 nhưng quên bấm chấm công ra." /></label>
            <label>Ảnh minh chứng (tùy chọn)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
              const file = event.target.files?.[0] || null
              if (file && (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
                setCorrectionEvidence(null)
                setCorrectionNotice('Chỉ nhận ảnh JPG, PNG hoặc WebP tối đa 5 MB.')
              } else { setCorrectionEvidence(file); setCorrectionNotice('') }
            }} /></label>
            {correctionNotice && <p className="my-attendance__correction-error" role="alert">{correctionNotice}</p>}
            <div className="my-attendance__correction-actions"><button type="button" disabled={correctionSubmitting} onClick={() => setSelectedCorrection(null)}>Hủy</button><button type="submit" disabled={correctionSubmitting}>{correctionSubmitting ? 'Đang gửi…' : 'Gửi yêu cầu duyệt'}</button></div>
          </form>
        </section>
      </div>}
    </div>
  )
}

export default MyAttendance
