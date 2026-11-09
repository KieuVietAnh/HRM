import { useEffect, useState } from 'react'
import { fbPush, fbUpdate } from '../services/firebase'

export const DEFAULT_COMPETENCY_LEVELS = [
  'Intern/Học việc',
  'Fresher',
  'Junior',
  'Senior',
  'Leader/Manager'
]

// Internal component for searchable input
const SearchableInput = ({ label, name, value, onChange, options = [], disabled, placeholder, required }) => {
  const [showSuggestions, setShowSuggestions] = useState(false)

  const filteredOptions = options.filter(opt =>
    !value || opt.toLowerCase().includes(value.toLowerCase())
  )

  return (
    <div className="form-group" style={{ position: 'relative' }}>
      <label>{label}</label>
      <input
        type="text"
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        autoComplete="off"
      />

      {showSuggestions && !disabled && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '0 0 6px 6px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          zIndex: 1000,
          maxHeight: '200px',
          overflowY: 'auto',
          marginTop: '-1px'
        }}>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, idx) => (
              <div
                key={idx}
                onClick={() => {
                  onChange({ target: { name, value: opt } })
                  setShowSuggestions(false)
                }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderBottom: idx === filteredOptions.length - 1 ? 'none' : '1px solid #f1f5f9',
                  color: '#334155',
                  transition: 'background 0.2s',
                  fontSize: '14px'
                }}
                onMouseEnter={(e) => e.target.style.background = '#f8fafc'}
                onMouseLeave={(e) => e.target.style.background = '#fff'}
              >
                {opt}
              </div>
            ))
          ) : null}
        </div>
      )}
    </div>
  )
}

const emptyForm = () => ({
  bo_phan: '',
  vi_tri: '',
  bac_nang_luc: '',
  so_nam_kinh_nghiem: '',
  so_luong: '',
  nhan_su_hien_co: '',
  dinh_bien: '',
  mo_ta: '',
  ghi_chu: ''
})

function RecruitmentPlanModal({
  plan,
  isOpen,
  onClose,
  onSave,
  readOnly = false,
  departments = [],
  positions = [],
  competencyLevels = DEFAULT_COMPETENCY_LEVELS
}) {
  const [formData, setFormData] = useState(emptyForm)

  useEffect(() => {
    if (plan) {
      setFormData({
        bo_phan: plan.bo_phan || '',
        vi_tri: plan.vi_tri || '',
        bac_nang_luc: plan.bac_nang_luc || plan.competencyLevel || '',
        so_nam_kinh_nghiem: plan.so_nam_kinh_nghiem ?? plan.yearsExperience ?? '',
        so_luong: plan.so_luong ?? plan.quantity ?? '',
        nhan_su_hien_co: plan.nhan_su_hien_co || '',
        dinh_bien: plan.dinh_bien || '',
        mo_ta: plan.mo_ta || plan.description || '',
        ghi_chu: plan.ghi_chu || ''
      })
    } else {
      resetForm()
    }
  }, [plan, isOpen])

  const resetForm = () => {
    setFormData(emptyForm())
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
      const quantity = Number(formData.so_luong || 0)
      const current = Number(formData.nhan_su_hien_co || 0)
      const target = Number(formData.dinh_bien || 0)
      const payload = {
        bo_phan: formData.bo_phan.trim(),
        vi_tri: formData.vi_tri.trim(),
        bac_nang_luc: formData.bac_nang_luc.trim(),
        so_nam_kinh_nghiem: String(formData.so_nam_kinh_nghiem || '').trim(),
        so_luong: quantity > 0 ? quantity : Math.max(target - current, 0),
        nhan_su_hien_co: current,
        dinh_bien: target,
        mo_ta: formData.mo_ta.trim(),
        ghi_chu: formData.ghi_chu.trim()
      }

      if (!payload.bo_phan || !payload.vi_tri) {
        alert('Vui lòng nhập Bộ phận và Vị trí cần tuyển')
        return
      }

      if (plan && plan.id) {
        await fbUpdate(`hr/recruitmentPlans/${plan.id}`, payload)
      } else {
        await fbPush('hr/recruitmentPlans', payload)
      }

      onSave()
      onClose()
      resetForm()
    } catch (error) {
      alert('Lỗi khi lưu: ' + error.message)
    }
  }

  if (!isOpen) return null

  const getTitle = () => {
    if (readOnly) return 'Chi tiết đề xuất tuyển dụng'
    return plan ? 'Sửa đề xuất tuyển dụng' : 'Tạo đề xuất tuyển dụng'
  }

  const levelOptions = [...new Set([
    ...DEFAULT_COMPETENCY_LEVELS,
    ...(competencyLevels || []),
    formData.bac_nang_luc
  ].filter(Boolean))]

  return (
    <div className="modal show" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <i className={readOnly ? 'fas fa-eye' : 'fas fa-user-plus'}></i>
            {getTitle()}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <SearchableInput
                label="Bộ phận / phòng ban tuyển dụng *"
                name="bo_phan"
                value={formData.bo_phan}
                onChange={handleChange}
                options={departments}
                disabled={readOnly}
                required
                placeholder="Nhập hoặc chọn bộ phận"
              />
              <SearchableInput
                label="Vị trí cần tuyển *"
                name="vi_tri"
                value={formData.vi_tri}
                onChange={handleChange}
                options={positions}
                disabled={readOnly}
                required
                placeholder="Nhập hoặc chọn vị trí"
              />
            </div>

            <div className="form-row">
              <SearchableInput
                label="Khung / bậc năng lực"
                name="bac_nang_luc"
                value={formData.bac_nang_luc}
                onChange={handleChange}
                options={levelOptions}
                disabled={readOnly}
                placeholder="Intern, Fresher, Junior, Senior..."
              />
              <div className="form-group">
                <label>Số năm kinh nghiệm yêu cầu</label>
                <input
                  type="text"
                  name="so_nam_kinh_nghiem"
                  value={formData.so_nam_kinh_nghiem}
                  onChange={handleChange}
                  placeholder="VD: 1-2 năm, từ 3 năm..."
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Số lượng cần tuyển</label>
                <input
                  type="number"
                  name="so_luong"
                  value={formData.so_luong}
                  onChange={handleChange}
                  min="0"
                  disabled={readOnly}
                  placeholder="Số người cần tuyển"
                />
              </div>
              <div className="form-group">
                <label>Nhân sự hiện có</label>
                <input
                  type="number"
                  name="nhan_su_hien_co"
                  value={formData.nhan_su_hien_co}
                  onChange={handleChange}
                  min="0"
                  disabled={readOnly}
                />
              </div>
              <div className="form-group">
                <label>Định biên</label>
                <input
                  type="number"
                  name="dinh_bien"
                  value={formData.dinh_bien}
                  onChange={handleChange}
                  min="0"
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Mô tả ngắn về yêu cầu và mục đích tuyển dụng</label>
              <textarea
                name="mo_ta"
                value={formData.mo_ta}
                onChange={handleChange}
                rows="4"
                placeholder="Yêu cầu kỹ năng, mục đích tuyển dụng, thời điểm cần có mặt..."
                disabled={readOnly}
              />
            </div>

            <div className="form-group">
              <label>Ghi chú thêm</label>
              <textarea
                name="ghi_chu"
                value={formData.ghi_chu}
                onChange={handleChange}
                rows="2"
                placeholder="Ghi chú nội bộ (nếu có)"
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

export default RecruitmentPlanModal
