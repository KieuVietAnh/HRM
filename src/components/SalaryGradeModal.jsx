import { useEffect, useState } from 'react'
import { fbPush, fbUpdate } from '../services/firebase'

function SalaryGradeModal({ grade, isOpen, onClose, onSave, readOnly }) {
  const [formData, setFormData] = useState({
    position: '',
    shift: 'Ca ngày',
    revenueFrom: 0,
    revenueTo: '',
    level: 1,
    salary: 0,
    status: 'Đang áp dụng'
  })

  useEffect(() => {
    if (grade) {
      setFormData({
        position: grade.position || grade.name || '',
        shift: grade.shift || 'Ca ngày',
        revenueFrom: grade.revenueFrom || 0,
        revenueTo: grade.revenueTo || '',
        level: grade.level || 1,
        salary: grade.salary || 0,
        status: grade.status || 'Đang áp dụng'
      })
    } else {
      resetForm()
    }
  }, [grade, isOpen])

  const resetForm = () => {
    setFormData({
      position: '',
      shift: 'Ca ngày',
      revenueFrom: 0,
      revenueTo: '',
      level: 1,
      salary: 0,
      status: 'Đang áp dụng'
    })
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const data = {
        ...formData,
        revenueFrom: formData.revenueFrom === '' ? 0 : Number(formData.revenueFrom),
        level: formData.level === '' ? 1 : Number(formData.level),
        salary: formData.salary === '' ? 0 : Number(formData.salary),
        revenueTo: formData.revenueTo === '' || formData.revenueTo === 'Không giới hạn' ? null : formData.revenueTo
      }

      if (grade && grade.id) {
        await fbUpdate(`hr/salaryGrades/${grade.id}`, data)
      } else {
        await fbPush('hr/salaryGrades', data)
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
            <i className="fas fa-dollar-sign"></i>
            {grade ? (readOnly ? 'Chi tiết bậc lương' : 'Sửa bậc lương') : 'Thêm bậc lương'}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Vị trí *</label>
                <input
                  type="text"
                  name="position"
                  value={formData.position}
                  onChange={handleChange}
                  required
                  placeholder="VD: Sale 1, MKT 2"
                  disabled={readOnly}
                />
              </div>
              <div className="form-group">
                <label>Ca làm việc *</label>
                <select
                  name="shift"
                  value={formData.shift}
                  onChange={handleChange}
                  required
                  disabled={readOnly}
                >
                  <option value="Ca ngày">Ca ngày</option>
                  <option value="Ca đêm">Ca đêm</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Doanh thu từ (triệu/tháng) *</label>
                <input
                  type="number"
                  name="revenueFrom"
                  value={formData.revenueFrom}
                  onChange={handleChange}
                  required
                  min="0"
                  step="any"
                  disabled={readOnly}
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="form-group">
                <label>Doanh thu đến (triệu/tháng)</label>
                <input
                  type="text"
                  name="revenueTo"
                  value={formData.revenueTo}
                  onChange={handleChange}
                  placeholder="Để trống hoặc 'Không giới hạn'"
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Bậc lương *</label>
                <input
                  type="number"
                  name="level"
                  value={formData.level}
                  onChange={handleChange}
                  required
                  min="1"
                  disabled={readOnly}
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="form-group">
                <label>Lương P1 (VNĐ) *</label>
                <input
                  type="number"
                  name="salary"
                  value={formData.salary}
                  onChange={handleChange}
                  required
                  min="0"
                  disabled={readOnly}
                  onFocus={(e) => e.target.select()}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Trạng thái</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                disabled={readOnly}
              >
                <option value="Đang áp dụng">Đang áp dụng</option>
                <option value="Ngừng áp dụng">Ngừng áp dụng</option>
              </select>
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

export default SalaryGradeModal

