import { useEffect, useState } from 'react'
import { fbPush, fbUpdate } from '../services/firebase'
import { normalizeString } from '../utils/helpers'

function CompetencyFrameworkModal({
  framework,
  isOpen,
  onClose,
  onSave,
  readOnly,
  employees = [],
  competencyFramework = []
}) {
  const [formData, setFormData] = useState({
    department: '',
    position: '',
    group: 'Chuyên môn',
    name: '',
    level: 1,
    status: 'Áp dụng',
    note: ''
  })
  const [isSaving, setIsSaving] = useState(false)
  const [showPositionDropdown, setShowPositionDropdown] = useState(false)
  const [showNameDropdown, setShowNameDropdown] = useState(false)

  useEffect(() => {
    if (framework) {
      setFormData({
        department: framework.department || '',
        position: framework.position || '',
        group: framework.group || 'Chuyên môn',
        name: framework.name || '',
        level: framework.level || 1,
        status: framework.status || 'Áp dụng',
        note: framework.note || ''
      })
    } else {
      resetForm()
    }
  }, [framework, isOpen])

  const resetForm = () => {
    setFormData({
      department: '',
      position: '',
      group: 'Chuyên môn',
      name: '',
      level: 1,
      status: 'Áp dụng',
      note: ''
    })
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    const val = name === 'level' ? (parseInt(value) || 1) : value
    setFormData(prev => ({ ...prev, [name]: val }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.department || !formData.position || !formData.name) {
      alert('Vui lòng nhập đầy đủ Bộ phận, Vị trí và Tên năng lực')
      return
    }

    try {
      setIsSaving(true)
      const dataToSave = { ...formData }

      if (framework && framework.id) {
        await fbUpdate(`hr/competencyFramework/${framework.id}`, dataToSave)
        alert('Cập nhật năng lực thành công')
      } else {
        await fbPush('hr/competencyFramework', dataToSave)
        alert('Thêm năng lực thành công')
      }

      onSave()
      onClose()
      resetForm()
    } catch (error) {
      alert('Lỗi khi lưu: ' + error.message)
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal show" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-graduation-cap"></i>
            {framework ? (readOnly ? 'Chi tiết năng lực' : 'Sửa năng lực') : 'Thêm năng lực mới'}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Bộ phận *</label>
                <select
                  name="department"
                  value={formData.department}
                  onChange={handleChange}
                  required
                  disabled={readOnly}
                >
                  <option value="">Chọn bộ phận</option>
                  {['MKT', 'Sale', 'BOD', 'Nhân sự', 'Kế toán', 'Vận đơn', 'CSKH'].sort().map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                  {[...new Set(employees.map(e => e.bo_phan || e.department).filter(Boolean))].filter(d => !['MKT', 'Sale', 'BOD', 'Nhân sự', 'Kế toán', 'Vận đơn', 'CSKH'].includes(d)).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ position: 'relative' }}>
                <label>Vị trí *</label>
                <input
                  type="text"
                  name="position"
                  value={formData.position}
                  onChange={handleChange}
                  onFocus={() => !readOnly && setShowPositionDropdown(true)}
                  onBlur={() => setTimeout(() => setShowPositionDropdown(false), 200)}
                  placeholder="VD: MKT 1, Sale 1..."
                  required
                  autoComplete="off"
                  disabled={readOnly}
                />
                {showPositionDropdown && !readOnly && (
                  <ul className="dropdown-list">
                    {[...new Set([
                      ...competencyFramework.map(c => c.position),
                      ...employees.map(e => e.vi_tri || e.position)
                    ].filter(Boolean))].sort()
                      .filter(p => normalizeString(p).includes(normalizeString(formData.position || '')))
                      .map((pos, idx) => (
                        <li
                          key={idx}
                          onClick={() => setFormData(prev => ({ ...prev, position: pos }))}
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          {pos}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Nhóm năng lực *</label>
                <select
                  name="group"
                  value={formData.group}
                  onChange={handleChange}
                  required
                  disabled={readOnly}
                >
                  <option value="Chuyên môn">Chuyên môn</option>
                  <option value="Lãnh đạo">Lãnh đạo</option>
                  <option value="Cá nhân">Cá nhân</option>
                </select>
              </div>

              <div className="form-group" style={{ flex: 2, position: 'relative' }}>
                <label>Tên năng lực *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  onFocus={() => !readOnly && setShowNameDropdown(true)}
                  onBlur={() => setTimeout(() => setShowNameDropdown(false), 200)}
                  placeholder="VD: Lập kế hoạch & giám sát KPI"
                  required
                  autoComplete="off"
                  disabled={readOnly}
                />
                {showNameDropdown && !readOnly && (
                  <ul className="dropdown-list">
                    {[...new Set(competencyFramework.map(c => c.name).filter(Boolean))].sort()
                      .filter(n => normalizeString(n).includes(normalizeString(formData.name || '')))
                      .map((name, idx) => (
                        <li
                          key={idx}
                          onClick={() => setFormData(prev => ({ ...prev, name: name }))}
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          {name}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Level yêu cầu (1-5) *</label>
                <select
                  name="level"
                  value={formData.level}
                  onChange={handleChange}
                  required
                  disabled={readOnly}
                >
                  {[1, 2, 3, 4, 5].map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Trạng thái</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  disabled={readOnly}
                >
                  <option value="Áp dụng">Áp dụng</option>
                  <option value="Ngừng">Ngừng</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Ghi chú</label>
              <textarea
                name="note"
                value={formData.note}
                onChange={handleChange}
                rows="3"
                disabled={readOnly}
              />
            </div>

            <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button type="button" className="btn" onClick={onClose}>
                {readOnly ? 'Đóng' : 'Hủy'}
              </button>
              {!readOnly && (
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? 'Đang lưu...' : 'Lưu'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
      <style jsx>{`
        .dropdown-list {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          max-height: 200px;
          overflow-y: auto;
          background: #fff;
          border: 1px solid #ccc;
          border-radius: 0 0 4px 4px;
          z-index: 1000;
          margin: 0;
          padding: 0;
          list-style: none;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .dropdown-list li {
          padding: 8px 10px;
          cursor: pointer;
          border-bottom: 1px solid #eee;
        }
        .dropdown-list li:hover {
          background-color: #f5f5f5;
        }
      `}</style>
    </div>
  )
}

export default CompetencyFrameworkModal
