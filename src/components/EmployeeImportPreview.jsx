import { planEmployeeSheetImport } from '../utils/employeeImport'

export default function EmployeeImportPreview({ preview, employees, companyId, onSelectSheet, onConfirm, onClose, busy }) {
    if (!preview) return null
    const sheet = preview.sheets.find(item => item.sheetName === preview.selectedSheetName)
    const plan = planEmployeeSheetImport(sheet, employees, companyId)
    return (
        <div className="modal show" onClick={busy ? undefined : onClose}>
            <div className="modal-content" role="dialog" aria-modal="true" aria-label="Xem trước import nhân sự"
                onClick={event => event.stopPropagation()} style={{ maxWidth: '1000px' }}>
                <div className="modal-header">
                    <h3>Nhập Excel nhân sự — chọn sheet và kiểm tra</h3>
                    <button className="modal-close" disabled={busy} onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <p>File: {preview.fileName}. Chưa có dữ liệu nào được ghi.</p>
                    <label htmlFor="employee-import-sheet">Sheet cần nhập</label>
                    <select id="employee-import-sheet" value={preview.selectedSheetName} disabled={busy}
                        onChange={event => onSelectSheet(event.target.value)} style={{ width: '100%', padding: '10px' }}>
                        <option value="">-- Chọn sheet, không tự lấy sheet nhiều dòng nhất --</option>
                        {preview.sheets.map(item => (
                            <option key={item.sheetName} value={item.sheetName}>
                                {item.sheetName} — {item.employeeCount} dòng nhân sự{item.hidden ? ' (sheet ẩn)' : ''}
                            </option>
                        ))}
                    </select>
                    {sheet && <>
                        <p><strong>Sheet: {sheet.sheetName} — {sheet.employeeCount} dòng nhân sự</strong>
                            {sheet.yearMonth ? ` — Tháng ${sheet.yearMonth}` : ''}</p>
                        {sheet.hidden && <p style={{ color: '#b45309' }}>Bạn đang chọn sheet ẩn. Kiểm tra đúng kỳ trước khi xác nhận.</p>}
                        {sheet.isMonthlyMatrix || sheet.isDetailedAttendanceList
                            ? <p>Sẽ thêm mới: {plan.createCount}; đã có, giữ nguyên hồ sơ: {plan.existingCount}.
                                Chỉ đọc danh sách nhân viên duy nhất, không nhập công vào hồ sơ Nhân sự.</p>
                            : <p>Hồ sơ có mã NV đã tồn tại sẽ được cập nhật theo luồng import nhân sự hiện tại.</p>}
                        <p>Không xóa người ngoài sheet đã chọn. Tổng nhân sự trên hệ thống có thể lớn hơn số người trong file.</p>
                        {plan.errors.length > 0 && <div role="alert" style={{ color: '#b91c1c' }}>
                            {plan.errors.map((error, index) => <div key={index}>{error}</div>)}
                        </div>}
                        <div style={{ maxHeight: '380px', overflow: 'auto' }}>
                            <table className="table" style={{ width: '100%' }}>
                                <thead><tr><th>Dòng Excel</th><th>Họ tên</th><th>Bộ phận</th><th>Ca làm</th><th>Xử lý</th></tr></thead>
                                <tbody>{plan.records.map(record => <tr key={record.rowIndex}>
                                    <td>{record.rowIndex + 1}</td><td>{record.name}</td><td>{record.department || '-'}</td><td>{record.shift || '-'}</td>
                                    <td>{{ create: 'Thêm mới', existing: 'Đã có — giữ nguyên', review: 'Cần kiểm tra', upsert: 'Thêm/cập nhật theo mã NV' }[record.action]}</td>
                                </tr>)}</tbody>
                            </table>
                        </div>
                    </>}
                </div>
                <div className="modal-footer" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button className="btn" disabled={busy} onClick={onClose}>Hủy</button>
                    <button className="btn btn-primary" onClick={onConfirm}
                        disabled={busy || !sheet || !sheet.employeeCount || plan.errors.length > 0}>
                        {busy ? 'Đang nhập...' : `Xác nhận nhập${sheet ? ` từ sheet ${sheet.sheetName}` : ''}`}
                    </button>
                </div>
            </div>
        </div>
    )
}
