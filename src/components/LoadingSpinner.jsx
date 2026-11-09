import { useEffect, useState } from 'react'

const LoadingSpinner = ({ text = 'Đang tải dữ liệu...' }) => {
  const [showSlowNotice, setShowSlowNotice] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShowSlowNotice(true), 6000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
        width: '100%',
        padding: '32px',
        boxSizing: 'border-box',
        color: '#0d427a',
        fontFamily: 'Segoe UI, Tahoma, sans-serif'
      }}
    >
      <div
        style={{
          border: '4px solid rgba(13, 66, 122, 0.15)',
          width: '42px',
          height: '42px',
          borderRadius: '50%',
          borderLeftColor: 'var(--secondary)',
          borderTopColor: '#0d427a',
          animation: 'hrmSpinAnim 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite',
          marginBottom: '16px'
        }}
      />
      <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#1e293b' }}>
        {text}
      </div>

      {showSlowNotice && (
        <div style={{ marginTop: '14px', fontSize: '0.85rem', color: '#64748b', textAlign: 'center' }}>
          Đang kết nối cơ sở dữ liệu...{' '}
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--secondary)',
              textDecoration: 'underline',
              cursor: 'pointer',
              fontWeight: 600,
              padding: 0
            }}
          >
            Tải lại trang nếu quá lâu
          </button>
        </div>
      )}

      <style>
        {`
          @keyframes hrmSpinAnim {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  )
}

export default LoadingSpinner
