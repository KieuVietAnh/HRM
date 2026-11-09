import { useEffect, useState } from 'react'
import { fbPush, fbUpdate } from '../services/firebase'

function TaskDetailModal({ task, employees, taskLogs, isOpen, onClose, onSave }) {
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    status: '',
    deadline: '',
    resultFileLink: '',
    note: ''
  })

  useEffect(() => {
    if (task) {
      setFormData({
        status: task.status || '',
        deadline: task.deadline || '',
        resultFileLink: task.resultFileLink || task.linkFileKetQua || '',
        note: ''
      })
    }
  }, [task, isOpen])

  if (!isOpen || !task) return null

  const getEmployeeName = (employeeId) => {
    const emp = employees.find(e => e.id === employeeId)
    return emp ? (emp.ho_va_ten || emp.name || 'N/A') : employeeId || 'N/A'
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleUpdateStatus = async () => {
    try {
      const updateData = {
        ...task,
        status: formData.status,
        deadline: formData.deadline,
        resultFileLink: formData.resultFileLink
      }

      await fbUpdate(`hr/tasks/${task.id}`, updateData)

      // Create log entry
      await fbPush('hr/taskLogs', {
        taskId: task.id,
        action: 'Cập nhật trạng thái',
        description: `Trạng thái: ${formData.status}${formData.note ? ` - ${formData.note}` : ''}`,
        createdBy: 'System', // In real app, use current user
        createdAt: new Date().toISOString()
      })

      alert('Đã cập nhật công việc')
      setIsEditing(false)
      onSave()
    } catch (error) {
      alert('Lỗi khi cập nhật: ' + error.message)
    }
  }

  const isOverdue = () => {
    if (!task.deadline || task.status === 'Đã xong' || task.status === 'Đã hoàn thành') return false
    const deadline = new Date(task.deadline)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    deadline.setHours(0, 0, 0, 0)
    return deadline < today
  }

  return (
    <div className="modal show" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px' }}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-eye"></i>
            Chi tiết công việc - {task.name || task.title || 'N/A'}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
              <div>
                <strong>Mã công việc:</strong> {task.code || task.id || '-'}
              </div>
              <div>
                <strong>Bộ phận:</strong> {task.department || '-'}
              </div>
              <div>
                <strong>Người giao:</strong> {task.assignerName || getEmployeeName(task.assignerId) || '-'}
              </div>
              <div>
                <strong>Người nhận:</strong> {getEmployeeName(task.assigneeId) || '-'}
              </div>
              <div>
                <strong>Mức ưu tiên:</strong>
                <span className={`badge ${task.priority === 'Cao' ? 'badge-danger' :
                    task.priority === 'Trung bình' ? 'badge-warning' :
                      'badge-info'
                  }`} style={{ marginLeft: '10px' }}>
                  {task.priority || '-'}
                </span>
              </div>
              <div>
                <strong>Trạng thái:</strong>
                <span className={`badge ${task.status === 'Đã xong' || task.status === 'Đã hoàn thành' ? 'badge-success' :
                    task.status === 'Đang làm' ? 'badge-info' :
                      task.status === 'Quá hạn' ? 'badge-danger' :
                        task.status === 'Tạm dừng' ? 'badge-warning' :
                          'badge-secondary'
                  }`} style={{ marginLeft: '10px' }}>
                  {task.status || '-'}
                </span>
              </div>
              <div>
                <strong>Ngày bắt đầu:</strong> {task.startDate ? new Date(task.startDate).toLocaleDateString('vi-VN') : '-'}
              </div>
              <div style={isOverdue() ? { color: 'var(--danger)', fontWeight: 'bold' } : {}}>
                <strong>Deadline:</strong> {task.deadline ? new Date(task.deadline).toLocaleDateString('vi-VN') : '-'}
                {isOverdue() && <span style={{ marginLeft: '10px' }}>⚠️ Quá hạn</span>}
              </div>
            </div>

            {task.description && (
              <div style={{ marginTop: '15px', padding: '10px', background: '#f5f5f5', borderRadius: '4px' }}>
                <strong>Mô tả:</strong>
                <p style={{ marginTop: '5px', whiteSpace: 'pre-wrap' }}>{task.description || task.moTa || '-'}</p>
              </div>
            )}

            {task.resultFileLink && (
              <div style={{ marginTop: '15px' }}>
                <strong>Link file kết quả:</strong>
                <a
                  href={task.resultFileLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ marginLeft: '10px', color: 'var(--primary)' }}
                >
                  <i className="fas fa-link"></i> {task.resultFileLink}
                </a>
              </div>
            )}
          </div>

          {/* Update Section */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px', marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h4>Cập nhật công việc</h4>
              <button
                className="btn btn-sm"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? 'Hủy' : 'Cập nhật'}
              </button>
            </div>

            {isEditing && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label>Trạng thái</label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '8px' }}
                  >
                    <option value="Chưa bắt đầu">Chưa bắt đầu</option>
                    <option value="Đang làm">Đang làm</option>
                    <option value="Đã xong">Đã xong</option>
                    <option value="Đã hoàn thành">Đã hoàn thành</option>
                    <option value="Tạm dừng">Tạm dừng</option>
                  </select>
                </div>
                <div>
                  <label>Deadline</label>
                  <input
                    type="date"
                    name="deadline"
                    value={formData.deadline}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '8px' }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label>Link file kết quả</label>
                  <input
                    type="url"
                    name="resultFileLink"
                    value={formData.resultFileLink}
                    onChange={handleChange}
                    placeholder="https://..."
                    style={{ width: '100%', padding: '8px' }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label>Ghi chú</label>
                  <textarea
                    name="note"
                    value={formData.note}
                    onChange={handleChange}
                    rows="3"
                    placeholder="Ghi chú về cập nhật..."
                    style={{ width: '100%', padding: '8px' }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button className="btn" onClick={() => setIsEditing(false)}>
                    Hủy
                  </button>
                  <button className="btn btn-primary" onClick={handleUpdateStatus}>
                    <i className="fas fa-save"></i> Lưu cập nhật
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Task Logs */}
          {taskLogs && taskLogs.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px', marginTop: '20px' }}>
              <h4>Lịch sử cập nhật</h4>
              <div style={{ maxHeight: '300px', overflowY: 'auto', marginTop: '10px' }}>
                {taskLogs.map((log, idx) => (
                  <div
                    key={log.id || idx}
                    style={{
                      padding: '10px',
                      marginBottom: '10px',
                      background: '#f9f9f9',
                      borderRadius: '4px',
                      borderLeft: '3px solid var(--primary)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <strong>{log.action || 'Cập nhật'}</strong>
                      <span style={{ fontSize: '0.9rem', color: '#666' }}>
                        {log.createdAt || log.timestamp
                          ? new Date(log.createdAt || log.timestamp).toLocaleString('vi-VN')
                          : '-'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#666' }}>
                      {log.description || '-'}
                    </div>
                    {log.createdBy && (
                      <div style={{ fontSize: '0.85rem', color: '#999', marginTop: '5px' }}>
                        Bởi: {getEmployeeName(log.createdBy) || log.createdBy || 'System'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
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

export default TaskDetailModal

