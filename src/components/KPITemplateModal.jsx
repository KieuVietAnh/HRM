import { useEffect, useState } from 'react'
import { fbPush, fbUpdate } from '../services/firebase'

function KPITemplateModal({ template, isOpen, onClose, onSave, readOnly = false }) {
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    unit: 'VNĐ',
    target: '',
    weight: 0,
    month: '',
    status: 'Đang áp dụng'
  })

  useEffect(() => {
    if (template) {
      setFormData({
        code: template.code || template.id || '',
        name: template.name || '',
        unit: template.unit || template.donVi || 'VNĐ',
        target: template.target || template.doiTuong || '',
        weight: template.weight || template.trongSo || 0,
        month: template.month || '',
        status: template.status || 'Đang áp dụng'
      })
    } else {
      resetForm()
    }
  }, [template, isOpen])

  const resetForm = () => {
    const today = new Date()
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    setFormData({
      code: '',
      name: '',
      unit: 'VNĐ',
      target: '',
      weight: 0,
      month: firstDayOfMonth.toISOString().split('T')[0],
      status: 'Đang áp dụng'
    })
  }

  const handleChange = (e) => {
    const value = e.target.value
    setFormData({
      ...formData,
      [e.target.name]: value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const dataToSave = {
        ...formData,
        weight: formData.weight === '' ? 0 : parseFloat(formData.weight)
      }

      if (template && template.id) {
        await fbUpdate(`hr/kpiTemplates/${template.id}`, dataToSave)
      } else {
        await fbPush('hr/kpiTemplates', dataToSave)
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
            <i className="fas fa-bullseye"></i>
            {readOnly ? 'Chi tiết danh mục KPI' : (template ? 'Sửa danh mục KPI' : 'Thêm danh mục KPI')}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Mã KPI *</label>
                <input
                  type="text"
                  name="code"
                  value={formData.code}
                  onChange={handleChange}
                  required
                  placeholder="VD: KPI-M1"
                  disabled={readOnly}
                />
              </div>
              <div className="form-group">
                <label>Tên KPI *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="VD: Doanh thu"
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Đơn vị đo *</label>
                <select
                  name="unit"
                  value={formData.unit}
                  onChange={handleChange}
                  required
                  disabled={readOnly}
                >
                  <option value="VNĐ">VNĐ</option>
                  <option value="%">%</option>
                  <option value="Lead">Lead</option>
                  <option value="Số lượng">Số lượng</option>
                  <option value="Giờ">Giờ</option>
                </select>
              </div>
              <div className="form-group">
                <label>Đối tượng áp dụng *</label>
                <input
                  type="text"
                  name="target"
                  value={formData.target}
                  onChange={handleChange}
                  required
                  placeholder="VD: Cá nhân MKT"
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Trọng số (%) *</label>
                <input
                  type="number"
                  name="weight"
                  value={formData.weight}
                  onChange={handleChange}
                  onFocus={(e) => e.target.select()}
                  required
                  min="0"
                  step="0.01"
                  disabled={readOnly}
                />
              </div>
              <div className="form-group">
                <label>Tháng áp dụng *</label>
                <input
                  type="date"
                  name="month"
                  value={formData.month}
                  onChange={handleChange}
                  required
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

export default KPITemplateModal

