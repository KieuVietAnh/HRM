
import { useEffect, useRef, useState } from 'react'
import { fbPush, fbUpdate } from '../services/firebase'
import { formatMoney, normalizeString } from '../utils/helpers'

function TaxModal({ tax, employees, dependents, insuranceList, isOpen, onClose, onSave, readOnly = false }) {
  const mouseDownTarget = useRef(null)
  const [formData, setFormData] = useState({
    employeeId: '',
    maSoThue: '',
    thuNhapTinhThue: '',
    giamTruBanThan: 15500000,
    bieuThue: 'Lũy tiến',
    kyApDung: ''
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    if (tax) {
      setFormData({
        employeeId: tax.employeeId || '',
        maSoThue: tax.maSoThue || tax.mst || '',
        thuNhapTinhThue: tax.thuNhapTinhThue || 0,
        giamTruBanThan: tax.giamTruBanThan !== undefined ? tax.giamTruBanThan : 15500000,
        bieuThue: tax.bieuThue || 'Lũy tiến',
        kyApDung: tax.kyApDung || tax.period || ''
      })
      // Set initial search term based on employeeId
      if (tax.employeeId) {
        const emp = employees.find(e => e.id === tax.employeeId)
        if (emp) {
          setSearchTerm(emp.ho_va_ten || emp.name || '')
        }
      }
    } else {
      resetForm()
    }
  }, [tax, isOpen])

  const resetForm = () => {
    const today = new Date()
    const monthStr = `${today.getFullYear()} -${String(today.getMonth() + 1).padStart(2, '0')} `
    setFormData({
      employeeId: '',
      maSoThue: '',
      thuNhapTinhThue: '',
      giamTruBanThan: 15500000,
      bieuThue: 'Lũy tiến',
      kyApDung: monthStr
    })
    setSearchTerm('')
    setShowDropdown(false)
  }

  const handleChange = (e) => {
    const value = e.target.value
    setFormData({
      ...formData,
      [e.target.name]: value
    })
  }

  // Calculate tax
  const calculateTax = () => {
    const employeeDependents = formData.employeeId ? dependents.filter(d => d.employeeId === formData.employeeId && d.status === 'Đang áp dụng') : []
    const totalDependentDeduction = employeeDependents.length * 6200000 // 6.2 triệu/người phụ thuộc
    const personalDeduction = formData.giamTruBanThan || 15500000

    // Get BHXH deduction
    let insuranceDeduction = 0
    if (insuranceList && formData.employeeId) {
      const empIns = insuranceList.find(i => i.employeeId === formData.employeeId && i.status === 'Đang tham gia')
      if (empIns) {
        insuranceDeduction = (empIns.mucLuongDong || 0) * ((empIns.tyLeNLD || 10.5) / 100)
      }
    }

    const taxableIncome = Math.max(0, formData.thuNhapTinhThue - personalDeduction - totalDependentDeduction - insuranceDeduction)

    if (formData.bieuThue === 'Toàn phần') {
      return taxableIncome * 0.1 // 10%
    }

    // Lũy tiến (Progressive Tax)
    // Standard Vietnamese PIT Brackets (Verified)
    // 1. <= 5M: 5%
    // 2. <= 10M: 10% - 0.25M
    // 3. <= 18M: 15% - 0.75M
    // 4. <= 32M: 20% - 1.65M
    // 5. <= 52M: 25% - 3.25M
    // 6. <= 80M: 30% - 5.85M (Correcting user's typo of 0.2/5.858M)
    // 7. > 80M: 35% - 9.85M

    if (taxableIncome <= 0) return 0
    if (taxableIncome <= 5000000) return taxableIncome * 0.05
    if (taxableIncome <= 10000000) return taxableIncome * 0.1 - 250000
    if (taxableIncome <= 18000000) return taxableIncome * 0.15 - 750000
    if (taxableIncome <= 32000000) return taxableIncome * 0.2 - 1650000
    if (taxableIncome <= 52000000) return taxableIncome * 0.25 - 3250000
    if (taxableIncome <= 80000000) return taxableIncome * 0.3 - 5850000
    return taxableIncome * 0.35 - 9850000
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (readOnly) return
    try {
      const employeeDependents = formData.employeeId ? dependents.filter(d => d.employeeId === formData.employeeId && d.status === 'Đang áp dụng') : []
      const totalDependentDeduction = employeeDependents.length * 6200000
      const personalDeduction = formData.giamTruBanThan || 15500000

      // Get BHXH deduction
      let insuranceDeduction = 0
      if (insuranceList && formData.employeeId) {
        const empIns = insuranceList.find(i => i.employeeId === formData.employeeId && i.status === 'Đang tham gia')
        if (empIns) {
          insuranceDeduction = (empIns.mucLuongDong || 0) * ((empIns.tyLeNLD || 10.5) / 100)
        }
      }

      const taxableIncome = Math.max(0, (Number(formData.thuNhapTinhThue) || 0) - personalDeduction - totalDependentDeduction - insuranceDeduction)
      const thuePhaiNop = calculateTax()

      const data = {
        ...formData,
        thuNhapTinhThue: Number(formData.thuNhapTinhThue) || 0,
        giamTruBanThan: Number(formData.giamTruBanThan) || 0,
        tongGiamTruNguoiPhuThuoc: totalDependentDeduction,
        giamTruBHXH: insuranceDeduction, // Save this for visibility
        thuNhapChiuThue: taxableIncome,
        thuePhaiNop
      }

      if (tax && tax.id) {
        await fbUpdate(`hr/taxInfo/${tax.id}`, data)
      } else {
        await fbPush('hr/taxInfo', data)
      }
      onSave()
      onClose()
      resetForm()
    } catch (error) {
      alert('Lỗi khi lưu: ' + error.message)
    }
  }

  if (!isOpen) return null

  const employeeDependents = formData.employeeId ? dependents.filter(d => d.employeeId === formData.employeeId && d.status === 'Đang áp dụng') : []
  const totalDependentDeduction = employeeDependents.length * 6200000
  const personalDeduction = formData.giamTruBanThan || 15500000

  // Recalculate for render
  let insuranceDeduction = 0
  if (insuranceList && formData.employeeId) {
    const empIns = insuranceList.find(i => i.employeeId === formData.employeeId && i.status === 'Đang tham gia')
    if (empIns) {
      insuranceDeduction = (empIns.mucLuongDong || 0) * ((empIns.tyLeNLD || 10.5) / 100)
    }
  }
  const taxableIncome = Math.max(0, formData.thuNhapTinhThue - personalDeduction - totalDependentDeduction - insuranceDeduction)
  const thuePhaiNop = calculateTax()

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
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
        <div className="modal-header">
          <h3>
            <i className={`fas ${readOnly ? 'fa-eye' : 'fa-file-invoice-dollar'}`}></i>
            {readOnly ? 'Chi tiết Thuế TNCN' : (tax ? 'Sửa thông tin Thuế TNCN' : 'Thêm thông tin Thuế TNCN')}
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
                    // Clear ID if text changes (force re-select)
                    if (formData.employeeId) {
                      setFormData(prev => ({ ...prev, employeeId: '' }))
                    }
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
                      .filter(emp => {
                        const name = emp.ho_va_ten || emp.name || ''
                        return normalizeString(name).includes(normalizeString(searchTerm))
                      })
                      .map(emp => (
                        <li
                          key={emp.id}
                          onClick={() => {
                            setFormData({ ...formData, employeeId: emp.id })
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
              {/* Overlay to close dropdown when clicking outside */}
              {showDropdown && (
                <div
                  style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
                  onClick={() => setShowDropdown(false)}
                />
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Mã số thuế TNCN</label>
                <input
                  type="text"
                  name="maSoThue"
                  value={formData.maSoThue}
                  onChange={handleChange}
                  placeholder="..."
                  disabled={readOnly}
                />
              </div>
              <div className="form-group">
                <label>Kỳ áp dụng *</label>
                <input
                  type="month"
                  name="kyApDung"
                  value={formData.kyApDung}
                  onChange={handleChange}
                  required
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Thu nhập tính thuế (VNĐ) *</label>
                <input
                  type="number"
                  name="thuNhapTinhThue"
                  value={formData.thuNhapTinhThue}
                  onChange={handleChange}
                  required
                  min="0"
                  disabled={readOnly}
                />
              </div>
              <div className="form-group">
                <label>Giảm trừ bản thân (VNĐ)</label>
                <input
                  type="number"
                  name="giamTruBanThan"
                  value={formData.giamTruBanThan}
                  onChange={handleChange}
                  min="0"
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Biểu thuế</label>
              <select
                name="bieuThue"
                value={formData.bieuThue}
                onChange={handleChange}
                disabled={readOnly}
              >
                <option value="Lũy tiến">Lũy tiến</option>
                <option value="Toàn phần">Toàn phần (10%)</option>
              </select>
            </div>

            {tax && employeeDependents.length > 0 && (
              <div style={{ marginTop: '15px', padding: '10px', background: '#f0f8ff', borderRadius: '4px' }}>
                <strong>Người phụ thuộc: {employeeDependents.length} người</strong>
                <div style={{ marginTop: '5px', fontSize: '0.9rem' }}>
                  Tổng giảm trừ: {formatMoney(totalDependentDeduction)}
                </div>
              </div>
            )}

            <div style={{ marginTop: '15px', padding: '10px', background: '#f5f5f5', borderRadius: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Thu nhập tính thuế:</span>
                <strong>{formatMoney(formData.thuNhapTinhThue)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Giảm trừ bản thân:</span>
                <strong>- {formatMoney(personalDeduction)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Giảm trừ người phụ thuộc:</span>
                <strong>- {formatMoney(totalDependentDeduction)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Trừ BHXH (10.5%):</span>
                <strong>- {formatMoney(insuranceDeduction)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '5px', marginTop: '5px' }}>
                <strong>Thu nhập chịu thuế:</strong>
                <strong style={{ color: 'var(--primary)' }}>{formatMoney(taxableIncome)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', borderTop: '2px solid var(--border)', paddingTop: '10px' }}>
                <strong>Thuế TNCN phải nộp:</strong>
                <strong style={{ color: 'var(--danger)', fontSize: '1.2em' }}>{formatMoney(thuePhaiNop)}</strong>
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

export default TaxModal

