import { useEffect, useMemo, useState } from 'react'
import { fbGet, fbSet, fbGetEmployeesDirectory } from '../services/firebase'
import { getPenaltiesByMonth } from '../services/attendancePenaltiesDb'
import { loadEmployeeLeaveSettings } from '../services/employeeLeave'
import { calculatePayrollSalary, calculatePayrollKpi } from '../utils/payrollSalary'
import { hydrateAttendanceSummaryRows, serializeAttendanceSummaryRows } from '../utils/attendanceSummary'
import PayrollTable from './PayrollTable'
import PayrollSummary from './PayrollSummary'

export default function PayrollSheet({ rows, month, companyId, search = '' }) {
  const [loaded, setLoaded] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [standardWorkdays, setStandardWorkdays] = useState(26)
  const [legacyVerified, setLegacyVerified] = useState(false)
  const [saving, setSaving] = useState(false)
  const [summaryState, setSummaryState] = useState({ ready: false, dirty: false, saving: false })

  useEffect(() => {
    let cancelled = false
    setLoaded(null)
    setError('')
    setLegacyVerified(false)
    setStandardWorkdays(26)
    const load = async () => {
      const snapshot = await fbGet(`hr/payrollMonthSnapshots/${month}`)
      if (snapshot) {
        if (!cancelled) setLoaded({ month, snapshot })
        return
      }
      const [employees, historyRecords, penalties, leave, kpis] = await Promise.all([
        fbGetEmployeesDirectory(), fbGet('hr/employeeSalaryHistory'), getPenaltiesByMonth(month),
        loadEmployeeLeaveSettings(companyId), fbGet('hr/kpiResults')
      ])
      const salaryHistory = Object.fromEntries(Object.values(historyRecords || {}).map(record => [record.employeeId, record.entries]))
      if (!cancelled) setLoaded({ month, employees: employees || {}, salaryHistory,
        penalties: penalties || [], leave: leave || {}, kpis: Object.values(kpis || {}) })
    }
    load().catch(cause => { if (!cancelled) setError(cause.message || 'Không tải được dữ liệu lương.') })
    return () => { cancelled = true }
  }, [month, companyId, retry])

  const kpis = useMemo(() => new Map((loaded?.kpis || []).filter(result =>
    result.employeeId && (!result.month || result.month === month)
  ).map(result => [String(result.employeeId), result])), [loaded, month])

  const payrollRows = useMemo(() => {
    if (!loaded || loaded.month !== month) return []
    if (loaded.snapshot) return hydrateAttendanceSummaryRows(loaded.snapshot.rows)
    return rows.map(row => {
      const employee = loaded.employees[String(row.employeeId)] || {}
      const payroll = calculatePayrollSalary(row, loaded.salaryHistory[String(row.employeeId)] || [], employee, month, Number(standardWorkdays))
      return { ...row,
        officialDate: employee.ngay_lam_chinh_thuc ?? row.officialDate,
        payroll, payrollKpi: calculatePayrollKpi(kpis.get(String(row.employeeId)), payroll.amount) }
    })
  }, [loaded, rows, month, standardWorkdays, kpis])

  if (error && !loaded) return <div role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Tải lại dữ liệu lương</button></div>
  if (!loaded || loaded.month !== month) return <p role="status">Đang tải bảng lương...</p>
  const snapshot = loaded.snapshot
  const hasLegacy = payrollRows.some(row => row.payroll.legacy)
  const hasErrors = payrollRows.some(row => row.payroll.amount === null || row.payroll.error || row.payrollKpi.error)
  const summaryBusy = !summaryState.ready || summaryState.dirty || summaryState.saving

  const lockPayroll = async () => {
    if (saving || snapshot || hasErrors || summaryBusy || !payrollRows.length || (hasLegacy && !legacyVerified)) return
    setSaving(true)
    setError('')
    try {
      // Chỉ giữ các trường hồ sơ đang hiển thị, không sao chép thông tin cá nhân khác.
      const employees = Object.fromEntries(payrollRows.map(row => {
        const employee = loaded.employees[String(row.employeeId)] || {}
        return [String(row.employeeId), Object.fromEntries([
          'ca_lam_viec', 'loai_hop_dong', 'trang_thai', 'ngay_vao_lam', 'ngay_lam_chinh_thuc', 'ngay_nghi_viec'
        ].map(key => [key, employee[key] || '']))]
      }))
      const nextSnapshot = {
        month, lockedAt: new Date().toISOString(), standardWorkdays: Number(standardWorkdays),
        rows: serializeAttendanceSummaryRows(payrollRows), employees,
        penalties: loaded.penalties, leave: loaded.leave, salaryHistory: loaded.salaryHistory,
        legacyVerified: hasLegacy && legacyVerified, payrollSummary: summaryState.data
      }
      await fbSet(`hr/payrollMonthSnapshots/${month}`, nextSnapshot)
      setLoaded(current => current?.month === month ? { month, snapshot: nextSnapshot } : current)
    } catch (cause) {
      setError(cause.message || 'Không chốt được bảng lương.')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <div className="attendance-preview-views">
      {snapshot ? <p role="status">Đã chốt tháng {month} · {new Date(snapshot.lockedAt).toLocaleString('vi-VN')} · Công chuẩn: {snapshot.standardWorkdays}</p> : <>
        <label>Công chuẩn tháng <input aria-label="Công chuẩn tháng" type="number" min="0.5" max="31" step="0.5"
          value={standardWorkdays} disabled={saving} onChange={event => setStandardWorkdays(event.target.value)} /></label>
        <button type="button" disabled={saving || summaryBusy || hasErrors || !payrollRows.length || (hasLegacy && !legacyVerified)} onClick={lockPayroll}>
          {saving ? 'Đang chốt...' : `Chốt bảng lương tháng ${month}`}
        </button>
        <button type="button" disabled={saving} onClick={() => setRetry(value => value + 1)}>Tải lại dữ liệu lương</button>
      </>}
    </div>
    {!snapshot && <p>Lương theo công = tổng (mức lương có hiệu lực × tỷ lệ hưởng × công trong giai đoạn / công chuẩn tháng). Lương KPIs = lương theo công × tỷ lệ KPI. Sau khi chốt, bảng này không thể sửa hoặc xóa.</p>}
    {!snapshot && hasLegacy && <label><input type="checkbox" checked={legacyVerified} disabled={saving}
      onChange={event => setLegacyVerified(event.target.checked)} /> Tôi đã đối chiếu mức lương cũ: hệ thống chỉ có mức tại thời điểm chuyển đổi, chưa có lịch sử trước đó.</label>}
    {hasErrors && <p role="alert">Có nhân viên thiếu mức lương hoặc dữ liệu công hợp lệ. Bổ sung ngày hiệu lực trong hồ sơ nhân sự rồi tải lại trước khi chốt.</p>}
    {!snapshot && summaryState.dirty && <p role="alert">Lưu hoặc bỏ các ô phân bổ lương đang nhập trước khi chốt tháng.</p>}
    {error && <p role="alert">{error}</p>}
    <PayrollTable rows={payrollRows} employeesById={new Map(Object.entries(snapshot?.employees || loaded.employees))}
      penalties={snapshot?.penalties || loaded.penalties} leaveSettings={snapshot?.leave || loaded.leave} month={month} />
    <PayrollSummary key={`${companyId}:${month}`} rows={payrollRows} month={month} companyId={companyId}
      search={search} frozen={snapshot} readOnly={Boolean(snapshot) || saving} onStateChange={setSummaryState} />
  </>
}
