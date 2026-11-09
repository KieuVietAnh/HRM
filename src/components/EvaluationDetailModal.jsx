
function EvaluationDetailModal({ evaluation, employee, competencyFramework, isOpen, onClose }) {
  if (!isOpen || !evaluation) return null

  return (
    <div className="modal show" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1000px' }}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-eye"></i>
            Chi tiết đánh giá năng lực - {employee ? (employee.ho_va_ten || employee.name || 'N/A') : 'N/A'}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: '20px' }}>
            <p><strong>Kỳ đánh giá:</strong> {evaluation.period || '-'}</p>
            <p><strong>Ngày đánh giá:</strong> {evaluation.evaluationDate ? new Date(evaluation.evaluationDate).toLocaleDateString('vi-VN') : '-'}</p>
            <p><strong>Điểm YC:</strong> {(evaluation.avgRequired || evaluation.diemYC || 0).toFixed(1)}</p>
            <p><strong>Điểm KQ:</strong> {(evaluation.avgAchieved || evaluation.diemKQ || 0).toFixed(1)}</p>
            <p><strong>Kết quả:</strong>
              <span className={`badge ${(evaluation.avgAchieved || evaluation.diemKQ || 0) > (evaluation.avgRequired || evaluation.diemYC || 0) ? 'badge-success' : 'badge-warning'}`} style={{ marginLeft: '10px' }}>
                {(evaluation.avgAchieved || evaluation.diemKQ || 0) > (evaluation.avgRequired || evaluation.diemYC || 0) ? 'Đạt' : 'Cần cải thiện'}
              </span>
            </p>
          </div>

          {evaluation.items && evaluation.items.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Nhóm năng lực</th>
                  <th>Tên năng lực</th>
                  <th>Level yêu cầu</th>
                  <th>Level đạt được</th>
                  <th>Điểm chênh lệch</th>
                  <th>Nhận xét</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.items.map((item, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td>{item.group || '-'}</td>
                    <td>{item.competencyName || '-'}</td>
                    <td>{item.requiredLevel || '-'}</td>
                    <td>{item.achievedLevel || '-'}</td>
                    <td style={{
                      color: item.difference > 0 ? 'var(--success)' :
                        item.difference < 0 ? 'var(--danger)' : 'var(--text)',
                      fontWeight: 'bold'
                    }}>
                      {item.difference > 0 ? '+' : ''}{item.difference || 0}
                    </td>
                    <td>{item.comment || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty-state">Chưa có chi tiết đánh giá</p>
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

export default EvaluationDetailModal

