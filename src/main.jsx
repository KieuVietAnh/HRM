import React from 'react'
import ReactDOM from 'react-dom/client'

import('./bootstrap').catch((error) => {
  console.error('Không thể khởi động ứng dụng:', error)
  const missingConfig = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY
  ReactDOM.createRoot(document.getElementById('root')).render(
    <main style={{ maxWidth: 640, margin: '80px auto', padding: 24, fontFamily: 'Arial, sans-serif', lineHeight: 1.6, color: '#1f2937' }}>
      <h1>{missingConfig ? 'Chưa cấu hình kết nối dữ liệu' : 'Không thể khởi động ứng dụng'}</h1>
      <p>{missingConfig ? 'Server local đang chạy. Cần cấu hình Supabase để mở ứng dụng quản lý nhân sự.' : 'Có lỗi khi tải ứng dụng. Vui lòng tải lại trang hoặc liên hệ người quản trị.'}</p>
      {missingConfig && <>
        <p>Tạo file <code>.env.local</code> trong thư mục dự án với hai giá trị của Supabase đang sử dụng:</p>
        <pre style={{ background: '#f3f4f6', padding: 16, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{'VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co\nVITE_SUPABASE_ANON_KEY=YOUR_ANON_PUBLIC_KEY'}</pre>
        <p>Lưu cấu hình rồi khởi động lại server local.</p>
      </>}
      <button onClick={() => window.location.reload()} style={{ padding: '10px 18px', cursor: 'pointer' }}>Tải lại trang</button>
    </main>
  )
})
