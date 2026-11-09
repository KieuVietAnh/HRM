import { useEffect, useRef, useState } from 'react'
import { fbPush, fbUpdate } from '../services/firebase'
import { formatMoney, normalizeString } from '../utils/helpers'

function InsuranceModal({ insurance, employees, employeeSalaries, salaryGrades, isOpen, onClose, onSave, readOnly = false }) {
  const mouseDownTarget = useRef(null)
  const [formData, setFormData] = useState({
    employeeId: '',
    soSoBHXH: '',
    ngayThamGia: '',
    mucLuongDong: '',
    tyLeNLD: 10.5,
    tyLeDN: 21.5,
    status: 'Đang tham gia'
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    if (insurance) {
      setFormData({
        employeeId: insurance.employeeId || '',
        soSoBHXH: insurance.soSoBHXH || insurance.soSo || '',
        ngayThamGia: insurance.ngayThamGia || '',
        mucLuongDong: insurance.mucLuongDong || insurance.mucLuong || 0,
        tyLeNLD: insurance.tyLeNLD || insurance.tyLeNhanVien || 10.5,
        tyLeDN: insurance.tyLeDN || insurance.tyLeDoanhNghiep || 21.5,
        status: insurance.status || 'Đang tham gia'
      })
      if (insurance.employeeId) {
        const emp = employees.find(e => e.id === insurance.employeeId)
        if (emp) {
          setSearchTerm(emp.ho_va_ten || emp.name || '')
        }
      }
    } else {
      resetForm()
    }
  }, [insurance, isOpen])

  const resetForm = () => {
    setFormData({
      employeeId: '',
      soSoBHXH: '',
      ngayThamGia: '',
      mucLuongDong: '',
      tyLeNLD: 10.5,
      tyLeDN: 21.5,
      status: 'Đang tham gia'
    })
    setSearchTerm('')
    setShowDropdown(false)
  }

  const handleChange = (e) => {
    const { name, value, type } = e.target

    // Keep value as string for better UX (typing decimals, leading zeros)
    const finalValue = value

    // Auto-fill Salary from Grade if Employee changes
    if (name === 'employeeId') {
      const empId = finalValue
      // Find salary in employeeSalaries
      const empSalaryRecord = employeeSalaries?.find(es => es.employeeId === empId)
      let salaryValue = ''

      if (empSalaryRecord) {
        const grade = salaryGrades?.find(g => g.id === empSalaryRecord.salaryGradeId)
        if (grade) {
          salaryValue = grade.salary || ''
        }
      }

      if (salaryValue) {
        setFormData(prev => ({
          ...prev,
          [name]: finalValue,
          mucLuongDong: salaryValue
        }))
        return
      }
    }

    setFormData(prev => ({
      ...prev,
      [name]: finalValue
    }))
  }



  const handleSubmit = async (e) => {
    e.preventDefault()
    if (readOnly) return
    try {
      const payload = {
        ...formData,
        mucLuongDong: formData.mucLuongDong === '' ? 0 : Number(formData.mucLuongDong),
        tyLeNLD: Number(formData.tyLeNLD),
        tyLeDN: Number(formData.tyLeDN)
      }

      if (insurance && insurance.id) {
        await fbUpdate(`hr/insuranceInfo/${insurance.id}`, payload)
      } else {
        await fbPush('hr/insuranceInfo', payload)
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
    <div
      className="modal show"
      onMouseDown={(e) => { mouseDownTarget.current = e.target }}
      onClick={(e) => {
        if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <i className={`fas ${readOnly ? 'fa-eye' : 'fa-hospital'}`}></i>
            {readOnly ? 'Chi tiết thông tin BHXH' : (insurance ? 'Sửa thông tin BHXH' : 'Thêm thông tin BHXH')}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Nhân viên *</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Tìm kiếm nhân viên..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setShowDropdown(true)
                    if (formData.employeeId) setFormData(prev => ({ ...prev, employeeId: '' }))
                  }}
                  onFocus={() => setShowDropdown(true)}
                  disabled={readOnly}
                  style={{ width: '100%' }}
                />

                {showDropdown && !readOnly && (
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
                      .filter(emp => normalizeString(emp.ho_va_ten || emp.name || '').includes(normalizeString(searchTerm)))
                      .map(emp => (
                        <li
                          key={emp.id}
                          onClick={() => {
                            // Update State
                            setFormData(prev => {
                              const newData = { ...prev, employeeId: emp.id }

                              // Logic auto-fill Salary like in handleChange
                              const empSalaryRecord = employeeSalaries?.find(es => es.employeeId === emp.id)
                              if (empSalaryRecord) {
                                const grade = salaryGrades?.find(g => g.id === empSalaryRecord.salaryGradeId)
                                if (grade && grade.salary > 0) {
                                  newData.mucLuongDong = grade.salary
                                }
                              }
                              return newData
                            })
                            setSearchTerm(emp.ho_va_ten || emp.name || 'N/A')
                            setShowDropdown(false)
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
                    {employees.filter(emp => normalizeString(emp.ho_va_ten || emp.name || '').includes(normalizeString(searchTerm))).length === 0 && (
                      <li style={{ padding: '10px', color: '#999', textAlign: 'center' }}>
                        Không tìm thấy nhân viên
                      </li>
                    )}
                  </ul>
                )}
              </div>

              {showDropdown && (
                <div
                  style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
                  onClick={() => setShowDropdown(false)}
                />
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Số sổ BHXH *</label>
                <input
                  type="text"
                  name="soSoBHXH"
                  value={formData.soSoBHXH}
                  onChange={handleChange}
                  required
                  placeholder="VD: 123456789"
                  disabled={readOnly}
                />
              </div>
              <div className="form-group">
                <label>Ngày tham gia *</label>
                <input
                  type="date"
                  name="ngayThamGia"
                  value={formData.ngayThamGia}
                  onChange={handleChange}
                  required
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Mức lương đóng BHXH (VNĐ) *</label>
                <input
                  type="number"
                  name="mucLuongDong"
                  value={formData.mucLuongDong}
                  onChange={handleChange}
                  required
                  min="0"
                  disabled={readOnly}
                />
              </div>
              <div className="form-group">
                <label>Trạng thái</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                >
                  <option value="Đang tham gia">Đang tham gia</option>
                  <option value="Dừng đóng">Dừng đóng</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Tỷ lệ NLĐ (%)</label>
                <input
                  type="number"
                  name="tyLeNLD"
                  value={formData.tyLeNLD}
                  onChange={handleChange}
                  min="0"
                  max="100"
                  step="0.1"
                />
              </div>
              <div className="form-group">
                <label>Tỷ lệ DN (%)</label>
                <input
                  type="number"
                  name="tyLeDN"
                  value={formData.tyLeDN}
                  onChange={handleChange}
                  min="0"
                  max="100"
                  step="0.1"
                />
              </div>
            </div>

            <div style={{ marginTop: '15px', padding: '10px', background: '#f0f8ff', borderRadius: '4px' }}>
              <strong>Mức đóng BHXH hàng tháng:</strong>
              <div style={{ marginTop: '5px' }}>
                NLĐ: {formatMoney((formData.mucLuongDong * formData.tyLeNLD) / 100)}
              </div>
              <div>
                DN: {formatMoney((formData.mucLuongDong * formData.tyLeDN) / 100)}
              </div>
              <div style={{ marginTop: '5px', fontWeight: 'bold' }}>
                Tổng: {formatMoney((formData.mucLuongDong * (formData.tyLeNLD + formData.tyLeDN)) / 100)}
              </div>
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

export default InsuranceModal

