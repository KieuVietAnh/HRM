import { useLocation } from 'react-router-dom'

const FEATURE_TITLES = {
  '/dashboard': 'Tổng quan',
  '/recruitment': 'Tuyển dụng',
  '/salary': 'Lương & Phúc lợi',
  '/competency': 'Khung năng lực',
  '/kpi': 'KPI',
  '/tasks': 'Công việc'
}

function FeatureComingSoon() {
  const location = useLocation()
  const basePath = '/' + (location.pathname.split('/').filter(Boolean)[0] || 'dashboard')
  const title = FEATURE_TITLES[basePath] || FEATURE_TITLES[location.pathname] || 'Tính năng'

  return (
    <div className="feature-coming-soon">
      <div className="feature-coming-soon__card">
        <div className="feature-coming-soon__badge">Demo</div>
        <h1>{title}</h1>
        <p className="feature-coming-soon__message">Tính năng đang phát triển</p>
        <p className="feature-coming-soon__contact">
          Xem demo liên hệ{' '}
          <a href="tel:0965310233">0965310233</a>
        </p>
      </div>
    </div>
  )
}

export default FeatureComingSoon
