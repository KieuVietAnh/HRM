import { useEffect, useState } from 'react'
import { fbPush, fbUpdate } from '../services/firebase'

function EmployeeSalaryModal({ employeeSalary, employees, salaryGrades, isOpen, onClose, onSave, readOnly }) {
  const [formData, setFormData] = useState({
    employeeId: '',
    salaryGradeId: '',
    effectiveDate: ''
  })

  useEffect(() => {
    if (employeeSalary) {
      setFormData({
        employeeId: employeeSalary.employeeId || '',
        salaryGradeId: employeeSalary.salaryGradeId || '',
        effectiveDate: employeeSalary.effectiveDate || ''
      })
    } else {
      resetForm()
    }
  }, [employeeSalary, isOpen])

  const resetForm = () => {
    setFormData({
      employeeId: '',
      salaryGradeId: '',
      effectiveDate: ''
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
      if (employeeSalary && employeeSalary.id) {
        await fbUpdate(`hr/employeeSalaries/${employeeSalary.id}`, formData)
      } else {
        await fbPush('hr/employeeSalaries', formData)

        // Tự động tạo lịch sử thăng tiến
        const selectedGrade = salaryGrades.find(g => g.id === formData.salaryGradeId)
        const selectedEmployee = employees.find(e => e.id === formData.employeeId)

        if (selectedGrade && selectedEmployee) {
          const historyData = {
            employeeId: formData.employeeId,
            salaryGradeId: formData.salaryGradeId,
            effectiveDate: formData.effectiveDate,
            type: 'Nhận việc',
            reason: 'Gán bậc lương ban đầu',
            approvedBy: 'HR'
          }
          await fbPush('hr/promotionHistory', historyData)
        }
      }
      onSave()
      onClose()
      resetForm()
    } catch (error) {
      alert('Lỗi khi lưu: ' + error.message)
    }
  }

  if (!isOpen) return null

  const selectedGrade = salaryGrades.find(g => g.id === formData.salaryGradeId)

  return (
    <div className="modal show" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-user-tag"></i>
            {employeeSalary ? (readOnly ? 'Chi tiết bậc lương nhân viên' : 'Sửa bậc lương nhân viên') : 'Gán bậc lương nhân viên'}
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
                disabled={readOnly}
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
              <label>Bậc lương *</label>
              <select
                name="salaryGradeId"
                value={formData.salaryGradeId}
                onChange={handleChange}
                required
                disabled={readOnly}
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
              {selectedGrade && (
                <div style={{ marginTop: '10px', padding: '10px', background: '#f5f5f5', borderRadius: '4px' }}>
                  <strong>Thông tin bậc lương:</strong>
                  <p>Vị trí: {selectedGrade.position || selectedGrade.name}</p>
                  <p>Ca: {selectedGrade.shift}</p>
                  <p>Bậc: {selectedGrade.level}</p>
                  <p>Lương P1: {new Intl.NumberFormat('vi-VN').format(selectedGrade.salary || 0)} đ</p>
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Ngày hiệu lực *</label>
              <input
                type="date"
                name="effectiveDate"
                value={formData.effectiveDate}
                onChange={handleChange}
                required
                disabled={readOnly}
              />
            </div>

            <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={onClose}>
                {readOnly ? 'Đóng' : 'Hủy'}
              </button>
              {!readOnly && (
                <button type="submit" className="btn btn-primary">
                  <i className="fas fa-save"></i>
                  Lưu
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default EmployeeSalaryModal

