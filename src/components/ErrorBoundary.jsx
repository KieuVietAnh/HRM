import React from 'react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('💥 [ErrorBoundary caught an error]:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReload = () => {
    window.location.reload()
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f8fafc',
          padding: '24px',
          fontFamily: 'Segoe UI, Tahoma, sans-serif'
        }}>
          <div style={{
            maxWidth: '600px',
            width: '100%',
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid #fee2e2',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.08)',
            padding: '32px',
            textAlign: 'center'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              marginBottom: '16px'
            }}>
              <i className="fas fa-triangle-exclamation"></i>
            </div>

            <h2 style={{ color: '#1e293b', marginBottom: '8px', fontSize: '1.4rem' }}>
              Đã có lỗi xảy ra khi hiển thị trang
            </h2>

            <p style={{ color: '#64748b', fontSize: '0.95rem', marginBottom: '20px', lineHeight: 1.5 }}>
              Ứng dụng vừa gặp sự cố ngoài ý muốn. Bạn có thể nhấn <strong>Tải lại trang</strong> để thử lại.
            </p>

            {this.state.error && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '12px',
                color: '#991b1b',
                fontSize: '0.85rem',
                textAlign: 'left',
                overflowX: 'auto',
                marginBottom: '24px',
                fontFamily: 'monospace'
              }}>
                <strong>Chi tiết lỗi:</strong> {this.state.error?.toString()}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={this.handleReload}
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--primary)',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.95rem'
                }}
              >
                <i className="fas fa-rotate-right" style={{ marginRight: '6px' }}></i>
                Tải lại trang
              </button>

              <button
                onClick={this.handleGoHome}
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  backgroundColor: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.95rem'
                }}
              >
                Về trang chủ
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
