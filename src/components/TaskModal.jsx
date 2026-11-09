import React, { useEffect, useState } from 'react'
import { fbPush, fbUpdate } from '../services/firebase'
import { normalizeString } from '../utils/helpers'

function TaskModal({ task, employees, isOpen, onClose, onSave }) {
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    department: '',
    assignerId: '',
    assigneeId: '',
    priority: 'Trung bình',
    startDate: '',
    deadline: '',
    status: 'Chưa bắt đầu',
    description: '',

    resultFileLink: ''
  })

  // Searchable state for Assigner
  const [assignerSearchTerm, setAssignerSearchTerm] = useState('')
  const [showAssignerDropdown, setShowAssignerDropdown] = useState(false)

  // Searchable state for Assignee
  const [assigneeSearchTerm, setAssigneeSearchTerm] = useState('')
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false)

  useEffect(() => {
    if (formData.assignerId) {
      const emp = employees.find(e => e.id === formData.assignerId)
      if (emp) {
        setAssignerSearchTerm(emp.ho_va_ten || emp.name || '')
      }
    } else {
      setAssignerSearchTerm('')
    }
  }, [formData.assignerId, employees])

  useEffect(() => {
    if (formData.assigneeId) {
      const emp = employees.find(e => e.id === formData.assigneeId)
      if (emp) {
        setAssigneeSearchTerm(emp.ho_va_ten || emp.name || '')
      }
    } else {
      setAssigneeSearchTerm('')
    }
  }, [formData.assigneeId, employees])

  useEffect(() => {
    if (task) {
      setFormData({
        code: task.code || task.id || '',
        name: task.name || task.title || '',
        department: task.department || '',
        assignerId: task.assignerId || '',
        assigneeId: task.assigneeId || '',
        priority: task.priority || 'Trung bình',
        startDate: task.startDate || '',
        deadline: task.deadline || '',
        status: task.status || 'Chưa bắt đầu',
        description: task.description || task.moTa || '',
        resultFileLink: task.resultFileLink || task.linkFileKetQua || ''
      })
    } else {
      resetForm()
    }
  }, [task, isOpen])

  const resetForm = () => {
    const today = new Date().toISOString().split('T')[0]
    setFormData({
      code: '',
      name: '',
      department: '',
      assignerId: '',
      assigneeId: '',
      priority: 'Trung bình',
      startDate: today,
      deadline: '',
      status: 'Chưa bắt đầu',
      description: '',
      resultFileLink: ''
    })
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const generateTaskCode = () => {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const year = now.getFullYear()
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    return `T-${month}-${random}`
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const data = {
        ...formData,
        code: formData.code || generateTaskCode(),
        assignerName: employees.find(e => e.id === formData.assignerId)?.ho_va_ten ||
          employees.find(e => e.id === formData.assignerId)?.name ||
          formData.assignerId
      }

      if (task && task.id) {
        await fbUpdate(`hr/tasks/${task.id}`, data)
      } else {
        await fbPush('hr/tasks', data)

        // Create initial log
        await fbPush('hr/taskLogs', {
          taskId: data.code,
          action: 'Tạo công việc',
          description: `Công việc "${data.name}" đã được tạo`,
          createdBy: data.assignerId,
          createdAt: new Date().toISOString()
        })
      }

      onSave()
      onClose()
      resetForm()
    } catch (error) {
      alert('Lỗi khi lưu: ' + error.message)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal show" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-clipboard-list"></i>
            {task ? 'Sửa công việc' : 'Tạo công việc mới'}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Mã công việc</label>
                <input
                  type="text"
                  name="code"
                  value={formData.code}
                  onChange={handleChange}
                  placeholder="Tự động tạo nếu để trống"
                />
              </div>
              <div className="form-group">
                <label>Tên công việc *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="VD: Lập kế hoạch MKT T12"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Bộ phận *</label>
                <select
                  name="department"
                  value={formData.department}
                  onChange={handleChange}
                  required
                >
                  <option value="">Chọn bộ phận</option>
                  {[...new Set(employees.map(e => e.bo_phan || e.department || e.division).filter(Boolean))].sort().map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                  {/* Fallback hardcoded if no employees yet, or just keep dynamic? Dynamic is better. 
                      If user wants to add new dept not in employees yet? 
                      Usually dept comes from employees. 
                      Let's stick to dynamic from employees to match "sync" request. 
                  */}
                </select>
              </div>
              <div className="form-group">
                <label>Mức ưu tiên *</label>
                <select
                  name="priority"
                  value={formData.priority}
                  onChange={handleChange}
                  required
                >
                  <option value="Cao">Cao</option>
                  <option value="Trung bình">Trung bình</option>
                  <option value="Thấp">Thấp</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Người giao *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Tìm kiếm người giao..."
                    value={assignerSearchTerm}
                    onChange={(e) => {
                      setAssignerSearchTerm(e.target.value)
                      setShowAssignerDropdown(true)
                      handleChange({ target: { name: 'assignerId', value: '' } }) // Clear ID on type
                    }}
                    onFocus={() => setShowAssignerDropdown(true)}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                    required // Visual requirement, real validation via formData
                  />
                  {/* Hidden input for HTML5 validation if needed, or rely on formData check */}
                  <input
                    type="text"
                    style={{ display: 'none' }}
                    name="assignerId"
                    value={formData.assignerId}
                    onChange={() => { }}
                    required
                  />

                  {showAssignerDropdown && (
                    <React.Fragment>
                      <div
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
                        onClick={() => setShowAssignerDropdown(false)}
                      />
                      <ul style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        maxHeight: '200px',
                        overflowY: 'auto',
                        background: '#fff',
                        border: '1px solid #ccc',
                        borderRadius: '0 0 4px 4px',
                        zIndex: 1000,
                        margin: 0,
                        padding: 0,
                        listStyle: 'none',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                      }}>
                        {employees
                          .filter(emp => {
                            const name = emp.ho_va_ten || emp.name || ''
                            return normalizeString(name).includes(normalizeString(assignerSearchTerm))
                          })
                          .map(emp => (
                            <li
                              key={emp.id}
                              onClick={() => {
                                handleChange({ target: { name: 'assignerId', value: emp.id } })
                                setAssignerSearchTerm(emp.ho_va_ten || emp.name || '')
                                setShowAssignerDropdown(false)
                              }}
                              style={{
                                padding: '10px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #eee'
                              }}
                              onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
                              onMouseLeave={(e) => e.target.style.background = '#fff'}
                            >
                              <strong>{emp.ho_va_ten || emp.name || 'N/A'}</strong>
                              <br />
                              <small style={{ color: '#666' }}>{emp.vi_tri || '-'} | {emp.bo_phan || '-'}</small>
                            </li>
                          ))}
                        {employees.filter(emp => normalizeString(emp.ho_va_ten || emp.name || '').includes(normalizeString(assignerSearchTerm))).length === 0 && (
                          <li style={{ padding: '10px', color: '#999', textAlign: 'center' }}>
                            Không tìm thấy nhân viên
                          </li>
                        )}
                      </ul>
                    </React.Fragment>
                  )}
                </div>
              </div>
              <div className="form-group">
                <label>Người nhận *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Tìm kiếm người nhận..."
                    value={assigneeSearchTerm}
                    onChange={(e) => {
                      setAssigneeSearchTerm(e.target.value)
                      setShowAssigneeDropdown(true)
                      handleChange({ target: { name: 'assigneeId', value: '' } })
                    }}
                    onFocus={() => setShowAssigneeDropdown(true)}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                    required
                  />
                  <input
                    type="text"
                    style={{ display: 'none' }}
                    name="assigneeId"
                    value={formData.assigneeId}
                    onChange={() => { }}
                    required
                  />

                  {showAssigneeDropdown && (
                    <React.Fragment>
                      <div
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
                        onClick={() => setShowAssigneeDropdown(false)}
                      />
                      <ul style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        maxHeight: '200px',
                        overflowY: 'auto',
                        background: '#fff',
                        border: '1px solid #ccc',
                        borderRadius: '0 0 4px 4px',
                        zIndex: 1000,
                        margin: 0,
                        padding: 0,
                        listStyle: 'none',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                      }}>
                        {employees
                          .filter(emp => {
                            const name = emp.ho_va_ten || emp.name || ''
                            return normalizeString(name).includes(normalizeString(assigneeSearchTerm))
                          })
                          .map(emp => (
                            <li
                              key={emp.id}
                              onClick={() => {
                                handleChange({ target: { name: 'assigneeId', value: emp.id } })
                                setAssigneeSearchTerm(emp.ho_va_ten || emp.name || 'N/A')
                                setShowAssigneeDropdown(false)
                              }}
                              style={{
                                padding: '10px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #eee',
                                transition: 'background 0.2s'
                              }}
                              onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
                              onMouseLeave={(e) => e.target.style.background = '#fff'}
                            >
                              <strong>{emp.ho_va_ten || emp.name || 'N/A'}</strong>
                              <br />
                              <small style={{ color: '#666' }}>{emp.vi_tri || '-'} | {emp.bo_phan || '-'}</small>
                            </li>
                          ))}
                        {employees.filter(emp => normalizeString(emp.ho_va_ten || emp.name || '').includes(normalizeString(assigneeSearchTerm))).length === 0 && (
                          <li style={{ padding: '10px', color: '#999', textAlign: 'center' }}>
                            Không tìm thấy nhân viên
                          </li>
                        )}
                      </ul>
                    </React.Fragment>
                  )}
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Ngày bắt đầu *</label>
                <input
                  type="date"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Deadline *</label>
                <input
                  type="date"
                  name="deadline"
                  value={formData.deadline}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Trạng thái</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                >
                  <option value="Chưa bắt đầu">Chưa bắt đầu</option>
                  <option value="Đang làm">Đang làm</option>
                  <option value="Đã xong">Đã xong</option>
                  <option value="Đã hoàn thành">Đã hoàn thành</option>
                  <option value="Tạm dừng">Tạm dừng</option>
                </select>
              </div>
              <div className="form-group">
                <label>Link file kết quả</label>
                <input
                  type="url"
                  name="resultFileLink"
                  value={formData.resultFileLink}
                  onChange={handleChange}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="form-group">
              <label>Mô tả công việc</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows="4"
                placeholder="Mô tả chi tiết công việc..."
              />
            </div>

            <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={onClose}>
                Hủy
              </button>
              <button type="submit" className="btn btn-primary">
                <i className="fas fa-save"></i>
                Lưu
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default TaskModal

