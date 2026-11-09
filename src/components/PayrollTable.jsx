import { formatDateDisplay, formatMoney } from '../utils/helpers'

const dash = value => {
  const text = String(value ?? '').trim()
  return text || '—'
}

const moneyOrDash = value => {
  if (value === null || value === undefined || value === '') return '—'
  const number = Number(String(value).replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(number)) return dash(value)
  return formatMoney(number)
}

const workdaysText = value => Number(value || 0).toFixed(2)

const holidayWorkdaysFor = row => {
  const days = row?.days
  if (!days) return 0
  let total = 0
  const entries = typeof days.values === 'function' ? days.values() : Object.values(days)
  for (const day of entries) {
    if (!day?.isHoliday) continue
    total += Number(day.holidayWorkdays || day.workdays || 0)
  }
  return Math.round(total * 100) / 100
}

const lateText = row => {
  const count = Number(row?.lateCount || 0)
  const minutes = Number(row?.lateMinutes || 0)
  if (!count && !minutes) return '0'
  if (minutes > 0) return `${count} lần · ${minutes} phút`
  return `${count} lần`
}

const yearLeaveFor = (leaveSettings, employeeId, month, paidLeaveWorkdays) => {
  const year = String(month || '').slice(0, 4)
  const entry = leaveSettings?.[String(employeeId)]?.[year]
  if (!entry) {
    return {
      used: paidLeaveWorkdays > 0 ? workdaysText(paidLeaveWorkdays) : '—',
      remaining: '—'
    }
  }
  const used = Object.values(entry.months || {}).reduce((sum, amount) => sum + Number(amount || 0), 0)
  const total = Number(entry.total_leave || 0)
  return {
    used: workdaysText(used),
    remaining: workdaysText(Math.max(0, total - used))
  }
}

const penaltiesForEmployee = (penalties, row) => {
  const id = String(row.employeeId || '')
  const code = String(row.employeeCode || row.displayEmployeeCode || '').trim().toLowerCase()
  const name = String(row.employeeName || '').trim().toLowerCase()
  const items = (penalties || []).filter(item => {
    if (item.employeeId && String(item.employeeId) === id) return true
    if (code && String(item.employeeCode || '').trim().toLowerCase() === code) return true
    return name && String(item.employeeName || '').trim().toLowerCase() === name
  }).map(item => ({
    content: item.content || item.category || 'Phạt',
    amount: Number(item.amount || 0)
  }))
  const total = items.reduce((sum, item) => sum + item.amount, 0)
  return { total, items }
}

const kpiSalaryFor = (kpiByEmployee, employeeId, salary) => {
  const result = kpiByEmployee.get(String(employeeId))
  if (!result) return { amount: null, percent: null }
  const percent = Number(result.totalKPI ?? result.kpiTong)
  if (!Number.isFinite(percent)) return { amount: null, percent: null }
  const base = Number(String(salary ?? '').replace(/[^\d.-]/g, ''))
  const amount = Number.isFinite(base) ? Math.round(base * percent / 100) : null
  return { amount, percent }
}

export default function PayrollTable({ rows, employeesById, penalties, leaveSettings, kpiByEmployee, month }) {
  return (
    <>
      <div className="attendance-preview-scroll">
        <table className="attendance-preview-table payroll-table">
          <thead>
            <tr className="groups">
              <th rowSpan={2}>STT</th>
              <th colSpan={3}>Thông tin nhân sự</th>
              <th rowSpan={2}>Loại HĐ</th>
              <th rowSpan={2}>Trạng thái</th>
              <th rowSpan={2}>Ngày nhận việc</th>
              <th rowSpan={2}>Ngày lên chính thức</th>
              <th rowSpan={2}>Ngày làm việc cuối</th>
              <th rowSpan={2}>Đi muộn</th>
              <th rowSpan={2}>Phạt</th>
              <th rowSpan={2}>Vé xe</th>
              <th rowSpan={2}>Phép năm còn lại</th>
              <th rowSpan={2}>Phép năm sử dụng</th>
              <th rowSpan={2}>Làm việc onl</th>
              <th rowSpan={2}>Giờ tăng ca</th>
              <th rowSpan={2}>Công làm lễ</th>
              <th rowSpan={2}>Tổng công</th>
              <th rowSpan={2}>Lương</th>
              <th rowSpan={2}>Lương KPIs</th>
            </tr>
            <tr className="groups">
              <th>Họ tên</th>
              <th>Bộ phận</th>
              <th>Ca làm</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={20}>Tháng này chưa có nhân viên trong bảng công.</td>
              </tr>
            ) : rows.map((row, index) => {
              const employee = employeesById.get(String(row.employeeId)) || {}
              const penalty = penaltiesForEmployee(penalties, row)
              const leave = yearLeaveFor(leaveSettings, row.employeeId, month, Number(row.paidLeaveWorkdays || 0))
              const salary = employee.tong_luong || employee.total_salary || ''
              const kpi = kpiSalaryFor(kpiByEmployee, row.employeeId, salary)
              return (
                <tr key={row.employeeId}>
                  <td>{index + 1}</td>
                  <td className="name">{dash(row.employeeName)}</td>
                  <td>{dash(row.displayDepartment || row.department)}</td>
                  <td>{dash(row.shift || employee.ca_lam_viec)}</td>
                  <td>{dash(row.contractType || employee.loai_hop_dong)}</td>
                  <td>{dash(row.employmentStatus || employee.trang_thai)}</td>
                  <td>{row.joinDate || employee.ngay_vao_lam ? formatDateDisplay(row.joinDate || employee.ngay_vao_lam) : '—'}</td>
                  <td>{row.officialDate || employee.ngay_lam_chinh_thuc ? formatDateDisplay(row.officialDate || employee.ngay_lam_chinh_thuc) : '—'}</td>
                  <td>{row.lastWorkingDate || employee.ngay_nghi_viec ? formatDateDisplay(row.lastWorkingDate || employee.ngay_nghi_viec) : '—'}</td>
                  <td>{lateText(row)}</td>
                  <td className="payroll-penalty">
                    <div className="payroll-penalty__total">Tổng phạt: {formatMoney(penalty.total)}</div>
                    {penalty.items.length > 0 && (
                      <div className="payroll-penalty__list">
                        {penalty.items.map((item, itemIndex) => (
                          <div className="payroll-penalty__row" key={`${row.employeeId}-${itemIndex}`}>
                            <span>{item.content}</span>
                            <strong>{formatMoney(item.amount)}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>—</td>
                  <td>{leave.remaining}</td>
                  <td>{leave.used}</td>
                  <td>{workdaysText(row.onlineWorkdays)}</td>
                  <td>{workdaysText(row.overtimeHours)}</td>
                  <td>{workdaysText(holidayWorkdaysFor(row))}</td>
                  <td><strong>{workdaysText(row.workdays)}</strong></td>
                  <td>{moneyOrDash(salary)}</td>
                  <td>
                    {kpi.amount === null && kpi.percent === null ? '—' : (
                      <>
                        {kpi.amount !== null ? formatMoney(kpi.amount) : '—'}
                        {kpi.percent !== null && <small>{Number(kpi.percent).toFixed(1)}%</small>}
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <section className="attendance-preview-mobile payroll-mobile" aria-label="Bảng lương theo nhân viên">
        {rows.map(row => {
          const employee = employeesById.get(String(row.employeeId)) || {}
          const penalty = penaltiesForEmployee(penalties, row)
          const leave = yearLeaveFor(leaveSettings, row.employeeId, month, Number(row.paidLeaveWorkdays || 0))
          const salary = employee.tong_luong || employee.total_salary || ''
          const kpi = kpiSalaryFor(kpiByEmployee, row.employeeId, salary)
          return (
            <article className="payroll-mobile-card" key={row.employeeId}>
              <header>
                <strong>{dash(row.employeeName)}</strong>
                <span>{dash(row.displayDepartment || row.department)} · {dash(row.shift || employee.ca_lam_viec)}</span>
              </header>
              <dl>
                <div><dt>Loại HĐ</dt><dd>{dash(row.contractType || employee.loai_hop_dong)}</dd></div>
                <div><dt>Trạng thái</dt><dd>{dash(row.employmentStatus || employee.trang_thai)}</dd></div>
                <div><dt>Ngày nhận việc</dt><dd>{row.joinDate || employee.ngay_vao_lam ? formatDateDisplay(row.joinDate || employee.ngay_vao_lam) : '—'}</dd></div>
                <div><dt>Lên chính thức</dt><dd>{row.officialDate || employee.ngay_lam_chinh_thuc ? formatDateDisplay(row.officialDate || employee.ngay_lam_chinh_thuc) : '—'}</dd></div>
                <div><dt>Làm việc cuối</dt><dd>{row.lastWorkingDate || employee.ngay_nghi_viec ? formatDateDisplay(row.lastWorkingDate || employee.ngay_nghi_viec) : '—'}</dd></div>
                <div><dt>Đi muộn</dt><dd>{lateText(row)}</dd></div>
                <div><dt>Phép còn lại</dt><dd>{leave.remaining}</dd></div>
                <div><dt>Phép đã dùng</dt><dd>{leave.used}</dd></div>
                <div><dt>Làm việc onl</dt><dd>{workdaysText(row.onlineWorkdays)}</dd></div>
                <div><dt>Tăng ca</dt><dd>{workdaysText(row.overtimeHours)}</dd></div>
                <div><dt>Công làm lễ</dt><dd>{workdaysText(holidayWorkdaysFor(row))}</dd></div>
                <div><dt>Tổng công</dt><dd>{workdaysText(row.workdays)}</dd></div>
                <div><dt>Lương</dt><dd>{moneyOrDash(salary)}</dd></div>
                <div><dt>Lương KPIs</dt><dd>{kpi.amount !== null ? formatMoney(kpi.amount) : '—'}</dd></div>
              </dl>
              <div className="payroll-penalty">
                <div className="payroll-penalty__total">Tổng phạt: {formatMoney(penalty.total)}</div>
                {penalty.items.map((item, itemIndex) => (
                  <div className="payroll-penalty__row" key={`${row.employeeId}-m-${itemIndex}`}>
                    <span>{item.content}</span>
                    <strong>{formatMoney(item.amount)}</strong>
                  </div>
                ))}
              </div>
            </article>
          )
        })}
      </section>
    </>
  )
}
