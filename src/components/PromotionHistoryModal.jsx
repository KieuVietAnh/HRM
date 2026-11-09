import { formatMoney } from '../utils/helpers'

function PromotionHistoryModal({ history, employee, promotionHistory, salaryGrades, isOpen, onClose }) {
  if (!isOpen || !history) return null

  // Lấy tất cả lịch sử của nhân viên này, sắp xếp theo thời gian
  const employeeHistory = promotionHistory
    .filter(h => h.employeeId === history.employeeId)
    .sort((a, b) => {
      const dateA = new Date(a.effectiveDate || 0)
      const dateB = new Date(b.effectiveDate || 0)
      return dateA - dateB
    })

  return (
    <div className="modal show" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px' }}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-history"></i>
            Bảng 2: Lịch sử thăng tiến của nhân sự - {employee ? (employee.ho_va_ten || employee.name || 'N/A') : 'N/A'}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {employeeHistory.length > 0 ? (
            <div>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '150px' }}>Thời gian</th>
                    <th>Nội dung</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeHistory.map((h, idx) => {
                    const grade = salaryGrades.find(g => g.id === h.salaryGradeId)
                    const type = h.type || h.hinhThuc || 'Thay đổi'
                    const level = grade ? `Bậc ${grade.level}` : ''
                    const salary = grade ? formatMoney(grade.salary || 0) : ''
                    const content = `${type} – ${level} – ${salary}`

                    return (
                      <tr key={h.id || idx}>
                        <td style={{ fontWeight: 500 }}>
                          {h.effectiveDate ? new Date(h.effectiveDate).toLocaleDateString('vi-VN') : '-'}
                        </td>
                        <td>
                          <div style={{ fontWeight: 500, marginBottom: '5px' }}>
                            {content}
                          </div>
                          {h.reason && (
                            <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '5px', fontStyle: 'italic' }}>
                              Lý do: {h.reason || h.lyDo || ''}
                            </div>
                          )}
                          {h.approvedBy && (
                            <div style={{ fontSize: '0.85rem', color: '#999', marginTop: '3px' }}>
                              Người phê duyệt: {h.approvedBy}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">Chưa có lịch sử thăng tiến</p>
          )}
        </div>
        <div style={{ padding: '20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}

export default PromotionHistoryModal

