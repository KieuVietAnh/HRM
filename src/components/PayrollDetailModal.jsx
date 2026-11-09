import { useEffect, useState } from 'react'
import { fbPush, fbUpdate } from '../services/firebase'
import { formatMoney } from '../utils/helpers'

function PayrollDetailModal({ payroll, employees, isOpen, onClose, onSave, readOnly = false }) {
  const [formData, setFormData] = useState({
    employeeId: '',
    period: '',
    department: '',
    congThucTe: 0,
    luongP1: 0,
    ketQuaP3: '100%',
    luong3P: 0,
    luongNgayCong: 0,
    thuongNong: 0,
    bhxh: 0,
    thueTNCN: 0,
    tamUng: 0,
    khac: 0,
    status: 'Đang tính'
  })

  useEffect(() => {
    if (payroll) {
      setFormData({
        employeeId: payroll.employeeId || '',
        period: payroll.period || '',
        department: payroll.department || '',
        congThucTe: payroll.congThucTe || payroll.cong || 0,
        luongP1: payroll.luongP1 || 0,
        ketQuaP3: payroll.ketQuaP3 || payroll.p3 || '100%',
        luong3P: payroll.luong3P || 0,
        luongNgayCong: payroll.luongNgayCong || 0,
        thuongNong: payroll.thuongNong || 0,
        bhxh: payroll.bhxh || 0,
        thueTNCN: payroll.thueTNCN || 0,
        tamUng: payroll.tamUng || 0,
        khac: payroll.khac || 0,
        status: payroll.status || 'Đang tính'
      })
    } else {
      resetForm()
    }
  }, [payroll, isOpen])

  const resetForm = () => {
    const today = new Date()
    const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
    setFormData({
      employeeId: '',
      period: monthStr,
      department: '',
      congThucTe: 0,
      luongP1: 0,
      ketQuaP3: '100%',
      luong3P: 0,
      luongNgayCong: 0,
      thuongNong: 0,
      bhxh: 0,
      thueTNCN: 0,
      tamUng: 0,
      khac: 0,
      status: 'Đang tính'
    })
  }

  const handleChange = (e) => {
    const value = e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
    setFormData({
      ...formData,
      [e.target.name]: value
    })

    // Auto calculate luong3P if P1 and P3 changed
    if (e.target.name === 'luongP1' || e.target.name === 'ketQuaP3') {
      const p1 = e.target.name === 'luongP1' ? value : formData.luongP1
      const p3Str = e.target.name === 'ketQuaP3' ? value : formData.ketQuaP3
      const p3 = parseFloat(p3Str.replace('%', '')) || 100
      setFormData(prev => ({
        ...prev,
        [e.target.name]: value,
        luong3P: (p1 * p3) / 100
      }))
    }
  }

  const calculateTotalIncome = () => {
    return (formData.luong3P || 0) + (formData.luongNgayCong || 0) + (formData.thuongNong || 0)
  }

  const calculateTotalDeductions = () => {
    return (formData.bhxh || 0) + (formData.thueTNCN || 0) + (formData.tamUng || 0) + (formData.khac || 0)
  }

  const calculateNetSalary = () => {
    return calculateTotalIncome() - calculateTotalDeductions()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (readOnly) return
    try {
      if (payroll && payroll.id) {
        await fbUpdate(`hr/payrolls/${payroll.id}`, formData)
      } else {
        await fbPush('hr/payrolls', formData)
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
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px' }}>
        <div className="modal-header">
          <h3>
            <i className={`fas ${readOnly ? 'fa-eye' : 'fa-money-bill-wave'}`}></i>
            {readOnly ? 'Chi tiết bảng lương' : (payroll ? 'Sửa bảng lương' : 'Thêm bảng lương')}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
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
                      {emp.ho_va_ten || emp.name || 'N/A'} - {emp.vi_tri || '-'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Kỳ lương *</label>
                <input
                  type="month"
                  name="period"
                  value={formData.period}
                  onChange={handleChange}
                  required
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Công thực tế</label>
                <input
                  type="number"
                  name="congThucTe"
                  value={formData.congThucTe}
                  onChange={handleChange}
                  min="0"
                  step="0.5"
                  disabled={readOnly}
                />
              </div>
              <div className="form-group">
                <label>Lương P1 (VNĐ)</label>
                <input
                  type="number"
                  name="luongP1"
                  value={formData.luongP1}
                  onChange={handleChange}
                  min="0"
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Kết quả P3 (%)</label>
                <input
                  type="text"
                  name="ketQuaP3"
                  value={formData.ketQuaP3}
                  onChange={handleChange}
                  placeholder="100%"
                  disabled={readOnly}
                />
              </div>
              <div className="form-group">
                <label>Lương 3P (VNĐ)</label>
                <input
                  type="number"
                  name="luong3P"
                  value={formData.luong3P}
                  onChange={handleChange}
                  min="0"
                  readOnly
                  style={{ background: '#f5f5f5' }}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Lương ngày công (VNĐ)</label>
                <input
                  type="number"
                  name="luongNgayCong"
                  value={formData.luongNgayCong}
                  onChange={handleChange}
                  min="0"
                  disabled={readOnly}
                />
              </div>
              <div className="form-group">
                <label>Thưởng nóng (VNĐ)</label>
                <input
                  type="number"
                  name="thuongNong"
                  value={formData.thuongNong}
                  onChange={handleChange}
                  min="0"
                  disabled={readOnly}
                />
              </div>
            </div>

            <div style={{ marginTop: '20px', padding: '15px', background: '#f0f8ff', borderRadius: '4px' }}>
              <h4>Khấu trừ</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>BHXH (VNĐ)</label>
                  <input
                    type="number"
                    name="bhxh"
                    value={formData.bhxh}
                    onChange={handleChange}
                    min="0"
                    disabled={readOnly}
                  />
                </div>
                <div className="form-group">
                  <label>Thuế TNCN (VNĐ)</label>
                  <input
                    type="number"
                    name="thueTNCN"
                    value={formData.thueTNCN}
                    onChange={handleChange}
                    min="0"
                    disabled={readOnly}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Tạm ứng (VNĐ)</label>
                  <input
                    type="number"
                    name="tamUng"
                    value={formData.tamUng}
                    onChange={handleChange}
                    min="0"
                    disabled={readOnly}
                  />
                </div>
                <div className="form-group">
                  <label>Khác (VNĐ)</label>
                  <input
                    type="number"
                    name="khac"
                    value={formData.khac}
                    onChange={handleChange}
                    min="0"
                    disabled={readOnly}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginTop: '20px', padding: '15px', background: '#f5f5f5', borderRadius: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <strong>Tổng thu nhập:</strong>
                <strong style={{ color: 'var(--primary)' }}>{formatMoney(calculateTotalIncome())}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <strong>Tổng khấu trừ:</strong>
                <strong style={{ color: 'var(--danger)' }}>{formatMoney(calculateTotalDeductions())}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--border)', paddingTop: '10px' }}>
                <strong>Thực lĩnh:</strong>
                <strong style={{ color: 'var(--success)', fontSize: '1.2em' }}>{formatMoney(calculateNetSalary())}</strong>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '20px' }}>
              <label>Trạng thái</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                disabled={readOnly}
              >
                <option value="Đang tính">Đang tính</option>
                <option value="Đã chốt">Đã chốt</option>
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

export default PayrollDetailModal

