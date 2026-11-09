import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadEmployeeLeaveSettings, loadLeaveEmployees, saveEmployeeLeaveSettings } from '../services/employeeLeave'
import { parseLeaveAmount } from '../utils/employeeLeave'
import '../pages/EmployeeLeave.css'

const currentYear = String(new Date().getFullYear())

function LeaveSettingsPanel({ companyId }) {
  const [employees, setEmployees] = useState([])
  const [saved, setSaved] = useState({})
  const [drafts, setDrafts] = useState({})
  const [openEmployeeId, setOpenEmployeeId] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [people, settings] = await Promise.all([
        loadLeaveEmployees(companyId),
        loadEmployeeLeaveSettings(companyId)
      ])
      setEmployees(people)
      setSaved(settings)
      setDrafts(settings)
    } catch (requestError) {
      setError(requestError.message || 'Không tải được cài đặt phép.')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { load() }, [load])

  const visibleEmployees = useMemo(() => employees.filter(employee => {
    const query = search.trim().toLocaleLowerCase('vi')
    return !query || `${employee.ho_va_ten} ${employee.employeeId}`.toLocaleLowerCase('vi').includes(query)
  }), [employees, search])

  const updateYear = (employeeId, year, update) => {
    setError('')
    setNotice('')
    setDrafts(current => {
      const leaveData = current[employeeId] || {}
      const entry = leaveData[year] || { total_leave: 0 }
      return { ...current, [employeeId]: { ...leaveData, [year]: update(entry) } }
    })
  }

  const save = async employeeId => {
    const invalidYear = Object.entries(drafts[employeeId] || {}).find(([, entry]) =>
      entry.total_leave !== '' && parseLeaveAmount(entry.total_leave) === null
    )
    if (invalidYear) {
      setError(`Năm ${invalidYear[0]} có số phép không hợp lệ. Hãy nhập số từ 0 trở lên; có thể dùng dấu phẩy hoặc dấu chấm cho số lẻ.`)
      return
    }
    setSavingId(employeeId)
    setError('')
    setNotice('')
    try {
      const next = await saveEmployeeLeaveSettings(companyId, employeeId, drafts[employeeId] || {})
      setSaved(current => ({ ...current, [employeeId]: next }))
      setDrafts(current => ({ ...current, [employeeId]: next }))
      setNotice('Đã lưu phép. Bảng phép sẽ hiển thị dữ liệu mới khi mở hoặc tải lại.')
    } catch (requestError) {
      setError(requestError.message || 'Không lưu được cài đặt phép.')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <section className="leave-settings-panel" role="tabpanel" aria-label="Cài đặt phép">
      <div className="leave-settings-toolbar">
        <div>
          <h2>Cài đặt phép nhân sự</h2>
          <p>Chọn nhân sự và nhập tổng số ngày phép năm.</p>
        </div>
        <Link className="btn" to="/bang-phep">Xem Bảng phép</Link>
      </div>
      <label className="leave-search">
        <span>Tìm nhân sự</span>
        <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tên hoặc mã nhân sự" />
      </label>
      {error && <div className="holiday-settings-alert is-error" role="alert">{error}</div>}
      {notice && <div className="holiday-settings-alert is-success" role="status">{notice}</div>}
      {loading ? <p className="leave-empty">Đang tải nhân sự và cài đặt phép...</p> : visibleEmployees.length === 0 ? (
        <p className="leave-empty">Không tìm thấy nhân sự.</p>
      ) : (
        <div className="leave-employee-list">
          {visibleEmployees.map(employee => {
            const employeeId = employee.id
            const isOpen = openEmployeeId === employeeId
            const leaveData = drafts[employeeId] || {}
            const years = Object.keys(leaveData).sort((a, b) => Number(b) - Number(a))
            const dirty = JSON.stringify(leaveData) !== JSON.stringify(saved[employeeId] || {})
            return (
              <article className="leave-employee" key={employeeId}>
                <button type="button" className="leave-employee-toggle" aria-expanded={isOpen} onClick={() => {
                  setOpenEmployeeId(isOpen ? null : employeeId)
                  setError('')
                  setNotice('')
                }}>
                  <span><strong>{employee.ho_va_ten || employee.employeeId}</strong><small>{employee.employeeId || 'Chưa có mã nhân sự'} · {years.length} năm đã cài</small></span>
                  <i className={`fas fa-chevron-${isOpen ? 'up' : 'down'}`} aria-hidden="true" />
                </button>
                {isOpen && (
                  <div className="leave-employee-content">
                    {[...new Set([currentYear, ...years])].sort((a, b) => Number(b) - Number(a)).map(year => {
                      const entry = leaveData[year] || { total_leave: '' }
                      return (
                        <fieldset className="leave-year-body" key={year} disabled={savingId === employeeId}>
                          <label className="leave-total-field">Tổng phép năm {year}
                            <input type="text" inputMode="decimal" value={entry.total_leave ?? ''} onChange={event => updateYear(employeeId, year, current => ({ ...current, total_leave: event.target.value }))} />
                          </label>
                        </fieldset>
                      )
                    })}
                    <div className="leave-actions">
                      {dirty && <span>Chưa lưu thay đổi</span>}
                      <button type="button" className="btn btn-primary" disabled={!dirty || savingId === employeeId} onClick={() => save(employeeId)}>
                        <i className="fas fa-save" aria-hidden="true" /> {savingId === employeeId ? 'Đang lưu...' : 'Lưu phép nhân sự'}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default LeaveSettingsPanel
