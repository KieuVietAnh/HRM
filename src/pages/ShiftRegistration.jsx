import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { fbGet } from '../services/firebase'
import { fetchUsersDirectory } from '../services/employeeDirectory'
import { assignEmployeeShifts, decideShiftRegistrations, loadShiftRegistrations, saveShiftRegistrations } from '../services/shiftRegistrations'
import { getCompanyIdForUser } from '../utils/companyContext'
import { normalizeAttendanceShiftSettings } from '../utils/attendanceShift'
import {
  buildRegistrationChanges,
  buildShiftOptions,
  describeShift,
  formatShortDate,
  formatWeekRange,
  SHIFT_STATUS_LABELS,
  shiftWeekKey,
  toDateKey,
  weekDays,
  weekStartKey
} from '../utils/shiftRegistration'
import './ShiftRegistration.css'

function ShiftRegistration() {
  const { user } = useAuth()
  const companyId = user?.company_id || user?.companyId || getCompanyIdForUser(user)
  const canApprove = user?.role === 'admin' || user?.role === 'hr'
  const canAssign = user?.role === 'admin'
  const [weekStart, setWeekStart] = useState(() => weekStartKey(toDateKey(new Date())))
  const [options, setOptions] = useState(() => buildShiftOptions(normalizeAttendanceShiftSettings()))
  const [records, setRecords] = useState([])
  const [selections, setSelections] = useState({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [employees, setEmployees] = useState([])
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [assignmentEmployeeId, setAssignmentEmployeeId] = useState('')
  const [assignmentDate, setAssignmentDate] = useState('')
  const [assignmentShiftIds, setAssignmentShiftIds] = useState([])
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const days = useMemo(() => weekDays(weekStart), [weekStart])

  useEffect(() => {
    if (!canAssign) return
    fetchUsersDirectory()
      .then(rows => setEmployees((rows || []).filter(row => row.id && row.name)
        .sort((left, right) => left.name.localeCompare(right.name, 'vi'))))
      .catch(requestError => setError(requestError.message || 'Không tải được danh sách nhân viên.'))
  }, [canAssign])

  useEffect(() => {
    const today = toDateKey(new Date())
    setAssignmentDate(current => days.some(day => day.date === current)
      ? current : days.find(day => day.date === today)?.date || days[0]?.date || '')
  }, [days])

  useEffect(() => {
    fbGet('hr/attendanceSettings/default')
      .then(settings => setOptions(buildShiftOptions(normalizeAttendanceShiftSettings(settings))))
      .catch(() => {})
  }, [])

  const reload = useCallback(async () => {
    if (days.length === 0) return
    setLoading(true)
    setError('')
    try {
      const rows = await loadShiftRegistrations({
        companyId,
        employeeId: canApprove ? null : user.id,
        from: days[0].date,
        to: days[6].date
      })
      setRecords(rows)
      setSelectedIds(new Set())
    } catch (requestError) {
      setError(requestError.message || 'Không tải được đăng ký ca.')
    } finally {
      setLoading(false)
    }
  }, [companyId, canApprove, days, user.id])

  useEffect(() => { reload() }, [reload])

  const myByDate = useMemo(() => {
    const map = {}
    records.filter(record => record.employee_id === user.id).forEach(record => {
      map[record.work_date] = [...(map[record.work_date] || []), record]
    })
    return map
  }, [records, user.id])

  // Giữ nhiều ca đã đăng ký cho từng ngày; ca đã duyệt luôn được giữ lại.
  useEffect(() => {
    const next = {}
    days.forEach(({ date }) => { next[date] = (myByDate[date] || []).map(record => record.shift_id) })
    setSelections(next)
  }, [days, myByDate])

  const changes = useMemo(
    () => buildRegistrationChanges({ days, selections, existingByDate: myByDate, options }),
    [days, selections, myByDate, options]
  )
  const hasChanges = changes.upserts.length > 0 || changes.removals.length > 0

  const changeWeek = weeks => {
    setWeekStart(current => shiftWeekKey(current, weeks))
    setNotice('')
  }

  const save = async event => {
    event.preventDefault()
    setError('')
    setNotice('')
    setSaving(true)
    try {
      await saveShiftRegistrations({ companyId, employeeId: user.id, ...changes })
      setNotice('Đã gửi đăng ký ca. Trạng thái: Chờ duyệt.')
      await reload()
    } catch (requestError) {
      setError(requestError.message || 'Không lưu được đăng ký ca.')
    } finally {
      setSaving(false)
    }
  }

  const decide = async (ids, status) => {
    if (!ids.length || deciding) return
    setError('')
    setNotice('')
    setDeciding(true)
    try {
      const updated = await decideShiftRegistrations({ companyId, ids, status })
      const byId = new Map(updated.map(row => [row.id, row]))
      setRecords(current => current.map(row => byId.get(row.id) || row))
      setSelectedIds(new Set())
      setNotice(`${status === 'approved' ? 'Đã duyệt' : 'Đã từ chối'} ${updated.length} ca.`)
    } catch (requestError) {
      setError(requestError.message || 'Không xử lý được đăng ký ca.')
    } finally {
      setDeciding(false)
    }
  }

  const employeeRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi')
    const grouped = new Map()
    records.forEach(record => {
      if (query && !record.employee_name.toLocaleLowerCase('vi').includes(query)) return
      if (!grouped.has(record.employee_id)) grouped.set(record.employee_id, { id: record.employee_id, name: record.employee_name, byDate: {} })
      const row = grouped.get(record.employee_id)
      row.byDate[record.work_date] = [...(row.byDate[record.work_date] || []), record]
    })
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  }, [records, search])

  const pendingIds = useMemo(
    () => employeeRows.flatMap(row => Object.values(row.byDate).flat()).filter(record => record.status === 'pending').map(record => record.id),
    [employeeRows]
  )
  const selectedPending = pendingIds.filter(id => selectedIds.has(id))

  const assignmentRecords = useMemo(() => records.filter(record =>
    record.employee_id === assignmentEmployeeId && record.work_date === assignmentDate
  ), [records, assignmentEmployeeId, assignmentDate])
  const approvedShiftIds = useMemo(() => assignmentRecords
    .filter(record => record.status === 'approved')
    .map(record => record.shift_id), [assignmentRecords])
  useEffect(() => { setAssignmentShiftIds(approvedShiftIds) }, [approvedShiftIds])
  const visibleEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLocaleLowerCase('vi')
    return query ? employees.filter(employee =>
      `${employee.name} ${employee.employee_id || ''}`.toLocaleLowerCase('vi').includes(query)
    ) : employees
  }, [employees, employeeSearch])
  const newAssignmentShiftIds = assignmentShiftIds.filter(id => !approvedShiftIds.includes(id))

  const assign = async event => {
    event.preventDefault()
    if (assigning || !newAssignmentShiftIds.length) return
    setAssigning(true)
    setError('')
    setNotice('')
    try {
      await assignEmployeeShifts({
        employeeId: assignmentEmployeeId,
        workDate: assignmentDate,
        shiftIds: newAssignmentShiftIds
      })
      setNotice(`Đã gán và duyệt ${newAssignmentShiftIds.length} ca cho ${employees.find(employee => employee.id === assignmentEmployeeId)?.name || 'nhân viên'}.`)
      await reload()
    } catch (requestError) {
      setError(requestError.message || 'Không gán được ca cho nhân viên.')
    } finally {
      setAssigning(false)
    }
  }

  const toggleId = id => setSelectedIds(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return <div className="shift-reg-page">
    <header className="shift-reg-header">
      <div>
        <h1>Đăng ký ca làm việc</h1>
        <p>Chọn một hoặc nhiều ca cho từng ngày trong tuần; ca đêm được tính công vào ngày hôm sau.</p>
      </div>
      <div className="shift-reg-week" role="group" aria-label="Chọn tuần">
        <button type="button" className="btn" onClick={() => changeWeek(-1)} aria-label="Tuần trước"><i className="fas fa-chevron-left" aria-hidden="true" /></button>
        <strong>{formatWeekRange(weekStart)}</strong>
        <button type="button" className="btn" onClick={() => changeWeek(1)} aria-label="Tuần sau"><i className="fas fa-chevron-right" aria-hidden="true" /></button>
        <button type="button" className="btn" onClick={() => setWeekStart(weekStartKey(toDateKey(new Date())))}>Tuần này</button>
      </div>
    </header>

    {error && <div className="shift-reg-message is-error" role="alert">{error}</div>}
    {notice && <div className="shift-reg-message is-success" role="status">{notice}</div>}

    {!canAssign && <form className="shift-reg-card" onSubmit={save}>
      <h2>Ca của tôi</h2>
      <div className="shift-reg-table-wrap">
        <table>
          <thead><tr><th scope="col">Ngày</th><th scope="col">Ca đăng ký</th><th scope="col">Trạng thái</th></tr></thead>
          <tbody>{days.map(day => {
            const existing = myByDate[day.date] || []
            return <tr key={day.date}>
              <td data-label="Ngày">{day.label} · {formatShortDate(day.date)}</td>
              <td data-label="Ca đăng ký">
                <div className="shift-reg-options" aria-label={`Ca ngày ${day.label} ${formatShortDate(day.date)}`}>
                  {options.map(option => {
                    const existingShift = (myByDate[day.date] || []).find(record => record.shift_id === option.id)
                    const checked = (selections[day.date] || []).includes(option.id) || existingShift?.status === 'approved'
                    const hasApprovedWorkShift = (myByDate[day.date] || []).some(record => record.status === 'approved' && record.shift_id !== 'off')
                    const hasApprovedDayOff = (myByDate[day.date] || []).some(record => record.status === 'approved' && record.shift_id === 'off')
                    return <label key={option.id} className="shift-reg-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={loading || existingShift?.status === 'approved' || (option.id === 'off' && hasApprovedWorkShift) || (option.id !== 'off' && hasApprovedDayOff)}
                        onChange={event => setSelections(current => {
                          const selected = new Set(current[day.date] || [])
                          if (event.target.checked) {
                            if (option.id === 'off') selected.clear()
                            else selected.delete('off')
                            selected.add(option.id)
                          }
                          else selected.delete(option.id)
                          return { ...current, [day.date]: [...selected] }
                        })}
                      />
                      <span>{describeShift(option)}</span>
                      {existingShift && <span className={`shift-reg-status is-${existingShift.status}`}>{SHIFT_STATUS_LABELS[existingShift.status]}</span>}
                    </label>
                  })}
                  {options.length === 0 && <span>Chưa có ca được cấu hình.</span>}
                </div>
              </td>
              <td data-label="Trạng thái">{existing.length
                ? <div className="shift-reg-status-list">{existing.map(record => <span key={record.id} className={`shift-reg-status is-${record.status}`}>{record.shift_name}: {SHIFT_STATUS_LABELS[record.status]}</span>)}</div>
                : '—'}</td>
            </tr>
          })}</tbody>
        </table>
      </div>
      <div className="shift-reg-actions">
        <button type="submit" className="btn btn-primary" disabled={saving || loading || !hasChanges}>
          {saving ? 'Đang gửi...' : 'Gửi đăng ký'}
        </button>
      </div>
    </form>}

    {canAssign && <form className="shift-reg-card shift-reg-assignment" onSubmit={assign}>
      <div><h2>Admin gán ca cho nhân viên</h2><p>Ca được duyệt ngay sau khi gán.</p></div>
      <div className="shift-reg-assignment__fields">
        <label>Tìm nhân viên
          <input type="search" value={employeeSearch} onChange={event => setEmployeeSearch(event.target.value)} placeholder="Tên hoặc mã nhân viên" />
        </label>
        <label>Nhân viên
          <select required value={assignmentEmployeeId} onChange={event => setAssignmentEmployeeId(event.target.value)}>
            <option value="">Chọn nhân viên</option>
            {visibleEmployees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}{employee.employee_id ? ` · ${employee.employee_id}` : ''}</option>)}
            {assignmentEmployeeId && !visibleEmployees.some(employee => employee.id === assignmentEmployeeId) &&
              <option value={assignmentEmployeeId}>{employees.find(employee => employee.id === assignmentEmployeeId)?.name || 'Nhân viên đã chọn'}</option>}
          </select>
        </label>
        <label>Ngày trong tuần đang xem
          <select required value={assignmentDate} onChange={event => setAssignmentDate(event.target.value)}>
            {days.map(day => <option key={day.date} value={day.date}>{day.label} · {formatShortDate(day.date)}</option>)}
          </select>
        </label>
      </div>
      <div className="shift-reg-assignment__options">
        {options.map(option => {
          const approved = approvedShiftIds.includes(option.id)
          const hasApprovedWork = approvedShiftIds.some(id => id !== 'off')
          const hasApprovedOff = approvedShiftIds.includes('off')
          return <label key={option.id} className="shift-reg-option">
            <input type="checkbox" checked={assignmentShiftIds.includes(option.id)}
              disabled={!assignmentEmployeeId || approved || (option.id === 'off' && hasApprovedWork) || (option.id !== 'off' && hasApprovedOff)}
              onChange={event => setAssignmentShiftIds(current => {
                const next = new Set(current)
                if (event.target.checked) {
                  if (option.id === 'off') next.clear()
                  else next.delete('off')
                  next.add(option.id)
                } else next.delete(option.id)
                return [...next]
              })} />
            <span>{describeShift(option)}</span>
            {approved && <span className="shift-reg-status is-approved">Đã duyệt</span>}
            {!approved && assignmentRecords.some(record => record.shift_id === option.id && record.status === 'pending') &&
              <span className="shift-reg-status is-pending">Chờ duyệt</span>}
          </label>
        })}
      </div>
      <div className="shift-reg-actions"><button type="submit" className="btn btn-primary"
        disabled={assigning || loading || !assignmentEmployeeId || !assignmentDate || !newAssignmentShiftIds.length}>
        {assigning ? 'Đang gán...' : 'Gán và duyệt ca'}
      </button></div>
    </form>}

    {canApprove && <section className="shift-reg-card">
      <div className="shift-reg-list-head">
        <h2>Đăng ký ca của nhân sự</h2>
        <div className="shift-reg-tools">
          <label>Tìm nhân sự
            <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tên nhân sự" />
          </label>
          <button type="button" className="btn btn-primary" disabled={deciding || selectedPending.length === 0} onClick={() => decide(selectedPending, 'approved')}>
            Duyệt đã chọn ({selectedPending.length})
          </button>
          <button type="button" className="btn btn-danger" disabled={deciding || selectedPending.length === 0} onClick={() => decide(selectedPending, 'rejected')}>
            Từ chối
          </button>
          <button type="button" className="btn" disabled={deciding || pendingIds.length === 0} onClick={() => decide(pendingIds, 'approved')}>
            Duyệt tất cả ({pendingIds.length})
          </button>
        </div>
      </div>
      {loading ? <p className="shift-reg-empty">Đang tải...</p> : employeeRows.length === 0 ? (
        <p className="shift-reg-empty">Chưa có đăng ký ca nào trong tuần này.</p>
      ) : <div className="shift-reg-table-wrap">
        <table className="shift-reg-board">
          <thead><tr>
            <th scope="col">Nhân sự</th>
            {days.map(day => <th key={day.date} scope="col">{day.label}<small>{formatShortDate(day.date)}</small></th>)}
          </tr></thead>
          <tbody>{employeeRows.map(row => <tr key={row.id}>
            <th scope="row">{row.name}</th>
            {days.map(day => {
              const dateRecords = row.byDate[day.date] || []
              return <td key={day.date} data-label={`${day.label} ${formatShortDate(day.date)}`}>{dateRecords.length ? dateRecords.map(record => <div className="shift-reg-cell" key={record.id}>
                {record.status === 'pending' && <input
                  type="checkbox"
                  checked={selectedIds.has(record.id)}
                  onChange={() => toggleId(record.id)}
                  aria-label={`Chọn ca ${row.name} ${record.shift_name} ${day.label}`}
                />}
                <span>{record.shift_name}</span>
                <span className={`shift-reg-status is-${record.status}`}>{SHIFT_STATUS_LABELS[record.status]}</span>
              </div>) : '—'}</td>
            })}
          </tr>)}</tbody>
        </table>
      </div>}
    </section>}
  </div>
}

export default ShiftRegistration
