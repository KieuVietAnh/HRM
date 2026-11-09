import { useEffect, useState } from 'react'
import { fbPush, fbUpdate } from '../services/firebase'

function PromotionModal({ promotion, employee, employees, salaryGrades, isOpen, onClose, onSave }) {
  const [formData, setFormData] = useState({
    employeeId: '',
    salaryGradeId: '',
    effectiveDate: '',
    type: 'Thăng chức',
    reason: '',
    approvedBy: 'HR'
  })

  useEffect(() => {
    if (promotion) {
      setFormData({
        employeeId: promotion.employeeId || '',
        salaryGradeId: promotion.salaryGradeId || '',
        effectiveDate: promotion.effectiveDate ? new Date(promotion.effectiveDate).toISOString().split('T')[0] : '', // Format YYYY-MM-DD
        type: promotion.type || promotion.hinhThuc || 'Thăng chức',
        reason: promotion.reason || promotion.lyDo || '',
        approvedBy: promotion.approvedBy || promotion.nguoiDuyet || 'HR'
      })
    } else if (employee) {
      setFormData({
        ...formData,
        employeeId: employee.id
      })
    } else {
      resetForm()
    }
  }, [promotion, employee, isOpen])

  const resetForm = () => {
    setFormData({
      employeeId: '',
      salaryGradeId: '',
      effectiveDate: '',
      type: 'Thăng chức',
      reason: '',
      approvedBy: 'HR'
    })
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (promotion && promotion.id) {
        await fbUpdate(`hr/promotionHistory/${promotion.id}`, formData)
        alert('Đã cập nhật lịch sử thăng tiến')
      } else {
        await fbPush('hr/promotionHistory', formData)
        alert('Đã thêm lịch sử thăng tiến')
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
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-arrow-up"></i>
            {promotion ? 'Cập nhật lịch sử thăng tiến' : 'Thêm lịch sử thăng tiến'}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Nhân viên *</label>
              <select
                name="employeeId"
                value={formData.employeeId}
                onChange={handleChange}
                required
                disabled={!!employee}
              >
                <option value="">Chọn nhân viên</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.ho_va_ten || emp.name || emp.Tên || 'N/A'} - {emp.id}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Bậc lương mới *</label>
              <select
                name="salaryGradeId"
                value={formData.salaryGradeId}
                onChange={handleChange}
                required
              >
                <option value="">Chọn bậc lương</option>
                {salaryGrades
                  .filter(g => g.status === 'Đang áp dụng')
                  .sort((a, b) => (a.level || 0) - (b.level || 0))
                  .map(grade => (
                    <option key={grade.id} value={grade.id}>
                      {grade.position || grade.name} - Ca {grade.shift} - Bậc {grade.level} - {new Intl.NumberFormat('vi-VN').format(grade.salary || 0)} đ
                    </option>
                  ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Ngày hiệu lực *</label>
                <input
                  type="date"
                  name="effectiveDate"
                  value={formData.effectiveDate}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Hình thức *</label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  required
                >
                  <option value="Nhận việc">Nhận việc</option>
                  <option value="Thăng chức">Thăng chức</option>
                  <option value="Điều chỉnh lương">Điều chỉnh lương</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Lý do điều chỉnh</label>
              <textarea
                name="reason"
                value={formData.reason}
                onChange={handleChange}
                rows="3"
                placeholder="VD: Đạt KPI quý I, Điều chỉnh chính sách P1..."
              />
            </div>

            <div className="form-group">
              <label>Người phê duyệt</label>
              <input
                type="text"
                name="approvedBy"
                value={formData.approvedBy}
                onChange={handleChange}
                placeholder="VD: HR Nguyễn A, Giám đốc..."
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

export default PromotionModal

