import { useState } from 'react'

function ResetAttendanceModal({
  isOpen,
  onClose,
  onConfirm,
  currentMonth = '',
  totalEmployees = 0,
  sourceLogCount = 0,
  hasSnapshot = false,
  allSavedMonths = []
}) {
  const [scope, setScope] = useState('month') // 'month' | 'all'
  const [confirmText, setConfirmText] = useState('')
  const [clearConfirmations, setClearConfirmations] = useState(true)
  const [clearManuals, setClearManuals] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const isConfirmed = confirmText.trim().toUpperCase() === 'RESET'

  const handleReset = async (e) => {
    e?.preventDefault()
    if (!isConfirmed || processing) return

    setProcessing(true)
    setError('')
    try {
      await onConfirm({
        scope,
        targetMonth: currentMonth,
        clearConfirmations,
        clearManuals
      })
      setConfirmText('')
      onClose()
    } catch (err) {
      console.error('Lỗi khi xóa dữ liệu bảng công:', err)
      setError(err?.message || 'Có lỗi xảy ra khi xóa bảng công. Vui lòng thử lại.')
    } finally {
      setProcessing(false)
    }
  }

  const handleClose = () => {
    if (processing) return
    setConfirmText('')
    setError('')
    onClose()
  }

  return (
    <div className="modal show" onClick={handleClose}>
      <div
        className="modal-content reset-data-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 540 }}
      >
        <div className="modal-header" style={{ borderBottomColor: '#fee2e2' }}>
          <h3 style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <i className="fas fa-triangle-exclamation" style={{ color: '#dc2626' }}></i>
            Xóa dữ liệu bảng công
          </h3>
          <button
            className="modal-close"
            type="button"
            onClick={handleClose}
            disabled={processing}
            aria-label="Đóng"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleReset}>
          <div className="modal-body" style={{ padding: '20px 24px' }}>
            <div
              style={{
                background: '#fff1f2',
                border: '1px solid #fecdd3',
                borderRadius: 8,
                padding: '12px 16px',
                color: '#9f1239',
                fontSize: '0.9rem',
                lineHeight: 1.5,
                marginBottom: 16,
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start'
              }}
            >
              <i className="fas fa-circle-exclamation" style={{ marginTop: 3, fontSize: '1.1rem', flexShrink: 0 }}></i>
              <div>
                <strong>Cảnh báo quan trọng:</strong> Hành động này sẽ xóa dữ liệu bảng công đã tổng hợp
                và các bản ghi chấm công liên quan để bạn có thể <strong>đẩy/import lại file Excel mới từ đầu</strong>.
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 600, color: '#334155', marginBottom: 8, fontSize: '0.9rem' }}>
                Chọn phạm vi xóa:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: scope === 'month' ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                    background: scope === 'month' ? '#fef2f2' : '#fff',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="radio"
                    name="resetScope"
                    value="month"
                    checked={scope === 'month'}
                    onChange={() => setScope('month')}
                    disabled={processing}
                    style={{ marginTop: 3, accentColor: '#dc2626' }}
                  />
                  <div>
                    <strong style={{ color: '#1e293b', fontSize: '0.92rem' }}>
                      Chỉ xóa bảng công tháng {currentMonth}
                    </strong>
                    <div style={{ color: '#64748b', fontSize: '0.82rem', marginTop: 2 }}>
                      Khuyến nghị khi bạn chỉ muốn import lại file Excel của tháng này. Các tháng khác giữ nguyên.
                    </div>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: scope === 'all' ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                    background: scope === 'all' ? '#fef2f2' : '#fff',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="radio"
                    name="resetScope"
                    value="all"
                    checked={scope === 'all'}
                    onChange={() => setScope('all')}
                    disabled={processing}
                    style={{ marginTop: 3, accentColor: '#dc2626' }}
                  />
                  <div>
                    <strong style={{ color: '#b91c1c', fontSize: '0.92rem' }}>
                      Xóa TOÀN BỘ bảng công (tất cả các tháng)
                    </strong>
                    <div style={{ color: '#64748b', fontSize: '0.82rem', marginTop: 2 }}>
                      Xóa sạch toàn bộ dữ liệu chấm công và bảng công của tất cả các tháng đã lưu trong hệ thống.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: 14,
                marginBottom: 16
              }}
            >
              {scope === 'month' ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.9rem' }}>
                    <span style={{ color: '#64748b' }}>Tháng sẽ bị xóa:</span>
                    <strong style={{ color: '#dc2626' }}>Tháng {currentMonth}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.9rem' }}>
                    <span style={{ color: '#64748b' }}>Nhân viên trong bảng công:</span>
                    <strong style={{ color: '#dc2626' }}>{totalEmployees} nhân viên</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: '#64748b' }}>Lượt chấm công chi tiết:</span>
                    <strong style={{ color: '#dc2626' }}>{sourceLogCount} bản ghi</strong>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.9rem' }}>
                    <span style={{ color: '#64748b' }}>Số tháng sẽ bị xóa:</span>
                    <strong style={{ color: '#dc2626' }}>{allSavedMonths.length || 'Tất cả'} tháng</strong>
                  </div>
                  {allSavedMonths.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                      <span style={{ color: '#64748b' }}>Danh sách tháng:</span>
                      <strong style={{ color: '#475467' }}>{allSavedMonths.join(', ')}</strong>
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  color: '#334155',
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="checkbox"
                  checked={clearConfirmations}
                  onChange={(e) => setClearConfirmations(e.target.checked)}
                  disabled={processing}
                  style={{ width: 16, height: 16, accentColor: '#dc2626' }}
                />
                <span>Xóa dữ liệu xác nhận / duyệt công</span>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  color: '#334155',
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="checkbox"
                  checked={clearManuals}
                  onChange={(e) => setClearManuals(e.target.checked)}
                  disabled={processing}
                  style={{ width: 16, height: 16, accentColor: '#dc2626' }}
                />
                <span>Xóa các điều chỉnh và sửa công tay liên quan</span>
              </label>
            </div>

            {error && (
              <div
                style={{
                  background: '#fee2e2',
                  border: '1px solid #f87171',
                  borderRadius: 6,
                  padding: '8px 12px',
                  color: '#991b1b',
                  fontSize: '0.85rem',
                  marginBottom: 14
                }}
              >
                {error}
              </div>
            )}

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.88rem',
                  color: '#475467',
                  marginBottom: 6
                }}
              >
                Nhập chữ <strong>RESET</strong> vào ô bên dưới để mở khóa nút xóa:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Nhập RESET để xác nhận..."
                disabled={processing}
                autoFocus
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div
            className="modal-footer"
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
              padding: '14px 24px',
              borderTop: '1px solid #e2e8f0'
            }}
          >
            <button
              className="btn"
              type="button"
              onClick={handleClose}
              disabled={processing}
            >
              Hủy
            </button>
            <button
              className="btn btn-danger"
              type="submit"
              disabled={!isConfirmed || processing}
              style={{
                backgroundColor: !isConfirmed ? '#fca5a5' : '#dc2626',
                borderColor: !isConfirmed ? '#fca5a5' : '#dc2626',
                color: '#fff',
                cursor: !isConfirmed || processing ? 'not-allowed' : 'pointer'
              }}
            >
              {processing ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> Đang xóa bảng công...
                </>
              ) : (
                <>
                  <i className="fas fa-trash"></i> Xác nhận xóa bảng công
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ResetAttendanceModal
