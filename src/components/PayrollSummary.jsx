import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { useAuth } from '../contexts/AuthContext'
import { fbGetEmployeesDirectory } from '../services/firebase'
import { supabase } from '../services/supabase'
import { loadPayrollSummary, savePayrollSummary } from '../services/payrollSummary'
import { formatMoney } from '../utils/helpers'
import { PAYROLL_COMPONENTS, makePayrollRecord, payrollAmounts, payrollSummaryTotals, pastePayrollDeductions } from '../utils/payrollSummary'
import './PayrollSummary.css'

const money = value => value === null ? 'Chưa nhập đủ' : formatMoney(value)
const quantity = value => value === null ? 'Cần đối chiếu' : Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 })
const searchText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase()

export default function PayrollSummary({ rows, month, companyId, search = '', frozen, readOnly = false, onStateChange }) {
  const { user } = useAuth()
  const [loaded, setLoaded] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [department, setDepartment] = useState('')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState(false)
  const [retry, setRetry] = useState(0)
  const dialog = useRef(null)
  const grid = useRef(null)
  const cacheKey = `payroll-draft:${user?.id}:${companyId}:${month}`
  const contextKey = `${companyId}:${month}`
  const ready = loaded?.key === contextKey
  const dirtyCount = Object.keys(drafts).length

  useEffect(() => {
    let cancelled = false
    setLoaded(null); setDrafts({}); setError(''); setNotice(''); setSelected(null); setConflict(false)
    if (frozen) {
      setLoaded({ key: contextKey, employees: frozen.employees || {}, saved: { data: frozen.payrollSummary || { records: {} } } })
      return () => { cancelled = true }
    }
    Promise.all([fbGetEmployeesDirectory(companyId), loadPayrollSummary(supabase, companyId, month)])
      .then(([employees, saved]) => {
        if (cancelled) return
        setLoaded({ key: contextKey, employees: employees || {}, saved })
        try {
          const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null')
          if (cached?.drafts && Object.keys(cached.drafts).length) {
            setDrafts(cached.drafts)
            const stale = cached.revision !== (saved?.updated_at || null)
            setConflict(stale)
            setNotice(stale ? 'Bản nháp cũ khác dữ liệu đã lưu. Xuất Excel để đối chiếu, sau đó bỏ nháp để tải bản mới.' : 'Đã khôi phục các ô chưa lưu trong phiên này.')
          }
        } catch { setNotice('Không khôi phục được bản nháp trong trình duyệt.') }
      }).catch(cause => { if (!cancelled) setError(cause.message || 'Không tải được bảng lương.') })
    return () => { cancelled = true }
  }, [companyId, month, cacheKey, contextKey, retry, frozen])

  useEffect(() => {
    onStateChange?.({ ready, dirty: dirtyCount > 0, saving, data: loaded?.saved?.data || { records: {} } })
  }, [ready, dirtyCount, saving, loaded, onStateChange])

  useEffect(() => {
    if (!ready || conflict || frozen) return
    try {
      if (dirtyCount) sessionStorage.setItem(cacheKey, JSON.stringify({ revision: loaded.saved?.updated_at || null, drafts }))
      else sessionStorage.removeItem(cacheKey)
    } catch { setNotice('Không lưu được bản nháp trong trình duyệt. Hãy lưu thay đổi trước khi rời trang.') }
  }, [cacheKey, ready, loaded, drafts, dirtyCount, conflict, frozen])

  useEffect(() => {
    if (!dirtyCount) return undefined
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirtyCount])

  useEffect(() => {
    if (selected && dialog.current && !dialog.current.open) dialog.current.showModal()
  }, [selected])

  const records = useMemo(() => {
    if (!ready) return []
    const saved = loaded.saved?.data?.records || {}
    const all = new Map(rows.map(row => {
      const id = String(row.employeeId)
      return [id, saved[id] || makePayrollRecord(row, loaded.employees[id])]
    }))
    Object.entries(saved).forEach(([id, row]) => { if (!all.has(id)) all.set(id, row) })
    return [...all].map(([id, row]) => {
      const next = { ...row, ...drafts[id] }
      try { return { ...next, amounts: payrollAmounts(next), error: '' } }
      catch (cause) { return { ...next, amounts: null, error: cause.message } }
    })
  }, [ready, loaded, rows, drafts])

  const visible = records.filter(row => (!department || row.department === department) &&
    searchText(`${row.code} ${row.name} ${row.department}`).includes(searchText(search)))
  const detail = records.find(row => row.employeeId === selected)
  let totals, totalError = ''
  try { totals = payrollSummaryTotals(visible) } catch (cause) { totalError = cause.message }

  function edit(id, patch) {
    if (readOnly) return
    setDrafts(previous => ({ ...previous, [id]: { ...previous[id], ...patch } }))
    setError(''); setNotice('')
  }

  async function save(ids = Object.keys(drafts)) {
    if (readOnly || saving || !ready || conflict) return
    const changed = records.filter(row => ids.includes(row.employeeId))
    if (!changed.length) return
    const invalid = changed.find(row => row.error || String(row.note || '').length > 1000)
    if (invalid) { setError(`${invalid.name}: ${invalid.error || 'Ghi chú tối đa 1.000 ký tự.'}`); return }
    const next = { ...loaded.saved?.data?.records }
    changed.forEach(({ amounts, error: ignoredError, ...row }) => {
      next[row.employeeId] = { ...row, ...Object.fromEntries([...PAYROLL_COMPONENTS, ['insurance'], ['advance']].map(([key]) => [key, amounts[key]])) }
    })
    setSaving(true); setError('')
    try {
      const saved = await savePayrollSummary(supabase, companyId, month, loaded.saved, next, user?.id)
      setLoaded(previous => ({ ...previous, saved }))
      setDrafts(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !ids.includes(id))))
      setNotice(`Đã lưu ${changed.length} nhân viên trong tháng ${month}.`)
    } catch (cause) { setError(cause.message || 'Lưu thất bại. Các ô đang nhập vẫn được giữ.') }
    finally { setSaving(false) }
  }

  function exportExcel() {
    if (visible.some(row => row.error) || totalError) { setError('Sửa các ô không hợp lệ trước khi xuất Excel.'); return }
    const headers = ['Mã NV', 'Họ tên', 'Bộ phận', 'Công chính', 'Tăng ca (giờ)', ...PAYROLL_COMPONENTS.map(([, label]) => label), 'Tổng lương nhận', 'BHXH', 'Đã ứng', 'Thực nhận', 'Ghi chú']
    const data = visible.map(row => [row.code, row.name, row.department, row.mainWorkdays, row.overtimeHours,
      ...PAYROLL_COMPONENTS.map(([key]) => row.amounts[key]), row.amounts.gross, row.amounts.insurance, row.amounts.advance, row.amounts.net, row.note])
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...data, ['TỔNG CỘNG', '', '', '', '', '', '', '', '', '', totals.incomplete ? null : totals.gross, totals.insurance, totals.advance, totals.incomplete ? null : totals.net, totals.incomplete ? `${totals.incomplete} người chưa nhập đủ lương; chưa có tổng lương và thực nhận đầy đủ.` : '']])
    sheet['!cols'] = headers.map((_, index) => ({ wch: index === 1 || index === 14 ? 30 : 20 }))
    for (let r = 1; r <= data.length + 1; r++) for (let c = 5; c <= 13; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })]
      if (cell?.t === 'n') cell.z = '#,##0'
    }
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'Bang luong tong hop')
    XLSX.writeFile(book, `Bang_luong_${month}${dirtyCount ? '_chua_luu' : ''}.xlsx`)
  }

  function moveCell(event, rowIndex, columnIndex) {
    let targetRow = rowIndex, targetColumn = columnIndex
    if (event.key === 'Escape') {
      edit(visible[rowIndex].employeeId, { [columnIndex ? 'advance' : 'insurance']: event.currentTarget.dataset.original })
      event.currentTarget.blur(); return
    }
    if (event.key === 'Enter') targetRow += event.shiftKey ? -1 : 1
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') targetRow += event.key === 'ArrowDown' ? 1 : -1
    else if (event.key === 'Tab') {
      targetColumn += event.shiftKey ? -1 : 1
      if (targetColumn > 1) { targetRow++; targetColumn = 0 }
      if (targetColumn < 0) { targetRow--; targetColumn = 1 }
    } else return
    const input = grid.current?.querySelector(`[data-row="${targetRow}"][data-column="${targetColumn}"]`)
    if (input) { event.preventDefault(); input.focus(); input.select() }
  }

  if (!ready) return <div className="payroll-summary-state" role={error ? 'alert' : 'status'}>
    {error || 'Đang tải bảng lương...'} {error && <button type="button" onClick={() => setRetry(value => value + 1)}>Thử lại</button>}
  </div>

  return <section className="payroll-summary" aria-label={`Bảng lương tổng hợp tháng ${month}`}>
    <div className="payroll-summary-toolbar">
      <div><h2>Bảng lương tổng hợp · {month}</h2><p>{visible.length} nhân viên · {dirtyCount ? `${dirtyCount} người chưa lưu` : 'Không có thay đổi chưa lưu'}</p></div>
      <label>Bộ phận <select value={department} onChange={event => setDepartment(event.target.value)}><option value="">Tất cả</option>
        {[...new Set(records.map(row => row.department).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}
      </select></label>
      <button type="button" disabled={readOnly || saving || !dirtyCount || conflict} onClick={() => save()}>{saving ? 'Đang lưu...' : `Lưu thay đổi${dirtyCount ? ` (${dirtyCount})` : ''}`}</button>
      <button type="button" disabled={saving || !visible.length} onClick={exportExcel}>Xuất Excel</button>
      {dirtyCount > 0 && <button type="button" disabled={saving} onClick={() => {
        if (window.confirm('Bỏ toàn bộ các ô chưa lưu của tháng này?')) {
          sessionStorage.removeItem(cacheKey); setDrafts({}); setConflict(false); setNotice('Đã bỏ bản nháp.'); setRetry(value => value + 1)
        }
      }}>Bỏ nháp</button>}
    </div>
    <p className="payroll-summary-help">{readOnly ? 'Bảng lương đã khóa. Có thể xem phân bổ và xuất Excel.' : 'Bấm tên để nhập và xem phân bổ lương. Gõ trực tiếp BHXH, Đã ứng; dùng Tab / Enter để chuyển ô hoặc dán hai cột từ Excel.'}</p>
    <p className="payroll-summary-formula">Thực nhận = Tổng lương nhận − BHXH − Đã ứng. Công chính và tăng ca hiển thị riêng theo đơn vị công / giờ.</p>
    {(error || notice || totalError) && <p role={error || totalError ? 'alert' : 'status'} className={error || totalError ? 'payroll-summary-error' : ''}>{error || totalError || notice}</p>}
    <div className="payroll-summary-scroll" ref={grid}>
      <table className="payroll-summary-table">
        <caption className="sr-only">Bảng tổng hợp lương tháng {month}. Ô màu sáng cho phép nhập.</caption>
        <thead><tr><th scope="col">STT</th><th scope="col">Mã NV</th><th scope="col">Họ tên / Bộ phận</th><th scope="col">Công chính</th><th scope="col">Tăng ca (giờ)</th><th scope="col">Tổng lương nhận</th><th scope="col">BHXH</th><th scope="col">Đã ứng</th><th scope="col">Thực nhận</th></tr></thead>
        <tbody>{visible.map((row, index) => <tr key={row.employeeId} className={drafts[row.employeeId] ? 'is-dirty' : ''}>
          <td>{index + 1}</td><td>{row.code || '—'}</td><th scope="row"><button type="button" className="payroll-summary-person" onClick={() => setSelected(row.employeeId)}>{row.name || row.employeeId}</button><small>{row.department || 'Chưa có bộ phận'}{drafts[row.employeeId] ? ' · Chưa lưu' : ''}</small></th>
          <td>{quantity(row.mainWorkdays)}</td><td>{quantity(row.overtimeHours)}</td>
          <td title={row.error}>{row.amounts ? money(row.amounts.gross) : 'Ô nhập không hợp lệ'}</td>
          {['insurance', 'advance'].map((field, columnIndex) => <td className={`payroll-summary-edit ${Object.hasOwn(drafts[row.employeeId] || {}, field) ? 'is-changed' : ''}`} key={field}>
            <input aria-label={`${field === 'insurance' ? 'BHXH' : 'Đã ứng'} — ${row.name}`} inputMode="numeric" value={row[field] ?? ''} disabled={readOnly || saving}
              data-row={index} data-column={columnIndex} aria-invalid={Boolean(row.error)}
              onFocus={event => { event.currentTarget.dataset.original = event.currentTarget.value; event.target.select() }} onChange={event => edit(row.employeeId, { [field]: event.target.value })}
              onKeyDown={event => moveCell(event, index, columnIndex)}
              onPaste={event => {
                if (readOnly) return
                const text = event.clipboardData.getData('text')
                if (!/[\t\r\n]/.test(text)) return
                event.preventDefault()
                try {
                  const patches = pastePayrollDeductions(text, index, columnIndex, visible)
                  setDrafts(previous => {
                    const next = { ...previous }
                    Object.entries(patches).forEach(([id, patch]) => { next[id] = { ...next[id], ...patch } })
                    return next
                  }); setError(''); setNotice(`Đã dán ${Object.keys(patches).length} dòng, chưa lưu.`)
                } catch (cause) { setError(cause.message) }
              }} />
          </td>)}
          <td className="payroll-summary-net">{row.amounts ? money(row.amounts.net) : '—'}</td>
        </tr>)}
          {!visible.length && <tr><td colSpan={9}>Không có nhân viên phù hợp.</td></tr>}
        </tbody>
        <tfoot><tr><th colSpan={5} scope="row">Tổng cộng theo bộ lọc{totals?.incomplete ? ` · ${totals.incomplete} người chưa đủ lương` : ''}</th><td>{totals ? money(totals.incomplete ? null : totals.gross) : '—'}</td><td>{totals ? formatMoney(totals.insurance) : '—'}</td><td>{totals ? formatMoney(totals.advance) : '—'}</td><td>{totals ? money(totals.incomplete ? null : totals.net) : '—'}</td></tr></tfoot>
      </table>
    </div>
    {detail && <dialog ref={dialog} className="payroll-summary-dialog" aria-labelledby="payroll-detail-title" onCancel={event => { if (saving) event.preventDefault() }} onClose={() => setSelected(null)}>
      <header><div><h2 id="payroll-detail-title">Phân bổ lương · {detail.name}</h2><p>{detail.code} · {detail.department} · Tháng {month}</p></div><button type="button" aria-label="Đóng chi tiết lương" disabled={saving} onClick={() => dialog.current.close()}>×</button></header>
      <p>Công chính: <strong>{quantity(detail.mainWorkdays)}</strong> · Tăng ca: <strong>{quantity(detail.overtimeHours)} giờ</strong>. Số công được lưu cùng bảng lương khi lưu nhân viên.</p>
      <p>Lương hồ sơ tham khảo: <strong>{detail.referenceSalary || 'Chưa có'}</strong>. Nhập số tiền phân bổ thực tế bên dưới; hệ thống tự cộng tổng.</p>
      <form onSubmit={event => { event.preventDefault(); save([detail.employeeId]) }}>
        <fieldset disabled={readOnly}>
        <table className="payroll-allocation-table"><thead><tr><th scope="col">Khoản thu nhập</th><th scope="col">Số tiền (VNĐ)</th></tr></thead>
          <tbody>{PAYROLL_COMPONENTS.map(([field, label]) => <tr key={field}><th scope="row"><label htmlFor={`payroll-${field}`}>{label}</label></th><td><input id={`payroll-${field}`} inputMode="numeric" disabled={saving} placeholder="Nhập số tiền" value={detail[field] ?? ''} onChange={event => edit(detail.employeeId, { [field]: event.target.value })} /></td></tr>)}</tbody>
          <tfoot><tr><th scope="row">Tổng lương nhận</th><td>{detail.amounts ? money(detail.amounts.gross) : '—'}</td></tr></tfoot>
        </table>
        <div className="payroll-summary-deductions">{[['insurance', 'BHXH'], ['advance', 'Đã ứng']].map(([field, label]) => <label key={field}>{label} (VNĐ)<input inputMode="numeric" disabled={saving} value={detail[field] ?? ''} onChange={event => edit(detail.employeeId, { [field]: event.target.value })} /></label>)}</div>
        <label className="payroll-summary-note">Ghi chú phân bổ / điều chỉnh<textarea maxLength={1000} disabled={saving} value={detail.note || ''} onChange={event => edit(detail.employeeId, { note: event.target.value })} /></label>
        </fieldset>
        <div className="payroll-summary-result"><span>Thực nhận</span><strong>{detail.amounts ? money(detail.amounts.net) : '—'}</strong></div>
        {(detail.error || error) && <p role="alert" className="payroll-summary-error">{detail.error || error}</p>}
        {notice && <p role="status">{notice}</p>}
        <footer><span>{readOnly ? 'Kỳ lương đã khóa.' : 'Đóng cửa sổ giữ các ô trong bản nháp.'}</span><button type="button" disabled={saving} onClick={() => dialog.current.close()}>Về danh sách</button><button type="submit" disabled={readOnly || saving || conflict || !drafts[detail.employeeId]}>{saving ? 'Đang lưu...' : 'Lưu nhân viên'}</button></footer>
      </form>
    </dialog>}
  </section>
}
