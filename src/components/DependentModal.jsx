import { useEffect, useState } from 'react'
import { fbPush, fbUpdate } from '../services/firebase'
import { asIdentityText, normalizeString } from '../utils/helpers'

function DependentModal({ dependent, employees, isOpen, onClose, onSave, readOnly = false }) {
  const [formData, setFormData] = useState({
    employeeId: '',
    hoTen: '',
    quanHe: '',
    ngaySinh: '',
    cccd: '',
    tuNgay: '',
    denNgay: '',
    status: 'Đang áp dụng'
  })

  // Searchable Select State
  const [searchTerm, setSearchTerm] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  // Sync search term with formData.employeeId
  useEffect(() => {
    if (formData.employeeId) {
      const emp = employees.find(e => e.id === formData.employeeId)
      if (emp) {
        setSearchTerm(emp.ho_va_ten || emp.name || '')
      }
    } else {
      setSearchTerm('')
    }
  }, [formData.employeeId, employees])

  useEffect(() => {
    if (dependent) {
      setFormData({
        employeeId: dependent.employeeId || '',
        hoTen: dependent.hoTen || dependent.name || '',
        quanHe: dependent.quanHe || dependent.relationship || '',
        ngaySinh: dependent.ngaySinh || '',
        cccd: asIdentityText(dependent.cccd || dependent.cmnd, 'cccd'),
        tuNgay: dependent.tuNgay || '',
        denNgay: dependent.denNgay || '',
        status: dependent.status || 'Đang áp dụng'
      })
    } else {
      resetForm()
    }
  }, [dependent, isOpen])

  const resetForm = () => {
    const today = new Date().toISOString().split('T')[0]
    setFormData({
      employeeId: '',
      hoTen: '',
      quanHe: '',
      ngaySinh: '',
      cccd: '',
      tuNgay: today,
      denNgay: '',
      status: 'Đang áp dụng'
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
    if (readOnly) return
    try {
      if (dependent && dependent.id) {
        await fbUpdate(`hr/dependents/${dependent.id}`, formData)
      } else {
        await fbPush('hr/dependents', formData)
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
            <i className={`fas ${readOnly ? 'fa-eye' : 'fa-users'}`}></i>
            {readOnly ? 'Chi tiết người phụ thuộc' : (dependent ? 'Sửa người phụ thuộc' : 'Thêm người phụ thuộc')}
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
                      handleChange({ target: { name: 'employeeId', value: '' } })
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
                            handleChange({ target: { name: 'employeeId', value: emp.id } })
                            setSearchTerm(emp.ho_va_ten || emp.name || '')
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
                {/* Overlay to close dropdown */}
                {showDropdown && (
                  <div
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
                    onClick={() => setShowDropdown(false)}
                  />
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Họ tên người phụ thuộc *</label>
                <input
                  type="text"
                  name="hoTen"
                  value={formData.hoTen}
                  onChange={handleChange}
                  required
                  disabled={readOnly}
                />
              </div>
              <div className="form-group">
                <label>Quan hệ *</label>
                <select
                  name="quanHe"
                  value={formData.quanHe}
                  onChange={handleChange}
                  required
                  disabled={readOnly}
                >
                  <option value="">Chọn quan hệ</option>
                  <option value="Con">Con</option>
                  <option value="Vợ">Vợ</option>
                  <option value="Chồng">Chồng</option>
                  <option value="Cha">Cha</option>
                  <option value="Mẹ">Mẹ</option>
                  <option value="Khác">Khác</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Ngày sinh *</label>
                <input
                  type="date"
                  name="ngaySinh"
                  value={formData.ngaySinh}
                  onChange={handleChange}
                  required
                  disabled={readOnly}
                />
              </div>
              <div className="form-group">
                <label>CCCD/CMND</label>
                <input
                  type="text"
                  name="cccd"
                  value={formData.cccd}
                  onChange={handleChange}
                  placeholder="..."
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Thời gian giảm trừ từ *</label>
                <input
                  type="date"
                  name="tuNgay"
                  value={formData.tuNgay}
                  onChange={handleChange}
                  required
                  disabled={readOnly}
                />
              </div>
              <div className="form-group">
                <label>Thời gian giảm trừ đến</label>
                <input
                  type="date"
                  name="denNgay"
                  value={formData.denNgay}
                  onChange={handleChange}
                  disabled={readOnly}
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

            <div style={{ marginTop: '15px', padding: '10px', background: '#f0f8ff', borderRadius: '4px', fontSize: '0.9rem' }}>
              <strong>Lưu ý:</strong> Mỗi người phụ thuộc được giảm trừ 6.200.000 VNĐ/tháng trong tính thuế TNCN.
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

export default DependentModal

