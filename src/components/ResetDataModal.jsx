import { useState } from 'react'

function ResetDataModal({
  isOpen,
  onClose,
  onConfirm,
  totalEmployees = 0,
  adminEmail = 'admin@company.local'
}) {
  const [confirmText, setConfirmText] = useState('')
  const [clearAttendance, setClearAttendance] = useState(false)
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
      await onConfirm({ clearAttendance })
      setConfirmText('')
      setClearAttendance(false)
      onClose()
    } catch (err) {
      console.error('Lỗi khi reset dữ liệu:', err)
      setError(err?.message || 'Có lỗi xảy ra khi xóa dữ liệu. Vui lòng thử lại.')
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
        style={{ maxWidth: 520 }}
      >
        <div className="modal-header" style={{ borderBottomColor: '#fee2e2' }}>
          <h3 style={{ color: '#dc2626' }}>
            <i className="fas fa-triangle-exclamation" style={{ color: '#dc2626' }}></i>
            Reset dữ liệu nhân sự
          </h3>
          <button
            className="modal-close"
            type="button"
            onClick={handleClose}
            disabled={processing}
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
              <i className="fas fa-circle-exclamation" style={{ marginTop: 3, fontSize: '1.1rem' }}></i>
              <div>
                <strong>Cảnh báo quan trọng:</strong> Hành động này sẽ xóa vĩnh viễn các hồ sơ nhân sự
                đã dùng/test trong hệ thống để bạn có thể bắt đầu lại hoặc nhập file Excel mới.
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
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.9rem' }}>
                <span style={{ color: '#64748b' }}>Hồ sơ sẽ bị xóa:</span>
                <strong style={{ color: '#dc2626' }}>{totalEmployees} nhân viên</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: '#64748b' }}>Tài khoản Quản trị viên (Admin):</span>
                <strong style={{ color: '#16a34a' }}>
                  <i className="fas fa-shield-halved" style={{ marginRight: 5 }}></i>
                  Được bảo vệ an toàn ({adminEmail})
                </strong>
              </div>
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                margin: '14px 0 18px',
                color: '#334155',
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={clearAttendance}
                onChange={(e) => setClearAttendance(e.target.checked)}
                disabled={processing}
                style={{ width: 16, height: 16, accentColor: '#dc2626' }}
              />
              <span>Xóa cả dữ liệu chấm công / điểm danh phát sinh (nếu có)</span>
            </label>

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
                cursor: !isConfirmed || processing ? 'not-allowed' : 'pointer'
              }}
            >
              {processing ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> Đang xóa dữ liệu...
                </>
              ) : (
                <>
                  <i className="fas fa-trash"></i> Xác nhận xóa dữ liệu
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ResetDataModal
