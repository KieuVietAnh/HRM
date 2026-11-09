import React, { useState } from 'react'
import { fbPush, fbGet } from '../services/firebase'

function SeedAllDataButton({ onComplete }) {
  const [loading, setLoading] = useState(false)

  const handleSeedAll = async () => {
    if (!confirm('Bạn có chắc muốn tạo TẤT CẢ data mẫu? Quá trình này có thể mất vài phút.')) {
      return
    }

    setLoading(true)
    try {
      let totalCreated = 0

      // 1. Seed Employees (if not exists)
      const employees = await fbGet('employees')
      if (!employees || Object.keys(employees).length === 0) {
        const sampleEmployees = [
          { ho_va_ten: 'Đỗ Mạnh Cường', email: 'cuong@lumi.com', sđt: '0123456789', chi_nhanh: 'HCM', bo_phan: 'MKT', vi_tri: 'MKT 3', trang_thai: 'Chính thức', ngay_vao_lam: '2024-01-01' },
          { ho_va_ten: 'Nguyễn Thị Hiếu', email: 'hieu@lumi.com', sđt: '0123456790', chi_nhanh: 'HCM', bo_phan: 'MKT', vi_tri: 'MKT 4', trang_thai: 'Chính thức', ngay_vao_lam: '2024-02-01' },
          { ho_va_ten: 'Trần Quốc Khải', email: 'khai@lumi.com', sđt: '0123456791', chi_nhanh: 'Hà Nội', bo_phan: 'Sale', vi_tri: 'Sale 2', trang_thai: 'Chính thức', ngay_vao_lam: '2024-03-01' },
          { ho_va_ten: 'Lê Thị Mai', email: 'mai@lumi.com', sđt: '0123456792', chi_nhanh: 'HCM', bo_phan: 'CSKH', vi_tri: 'NV CSKH', trang_thai: 'Chính thức', ngay_vao_lam: '2024-04-01' },
          { ho_va_ten: 'Phạm Văn Đức', email: 'duc@lumi.com', sđt: '0123456793', chi_nhanh: 'Hà Nội', bo_phan: 'Vận đơn', vi_tri: 'NV Vận đơn', trang_thai: 'Chính thức', ngay_vao_lam: '2024-05-01' }
        ]
        for (const emp of sampleEmployees) {
          await fbPush('employees', emp)
          totalCreated++
        }
      }

      // 2. Seed Salary Grades
      const salaryGrades = await fbGet('hr/salaryGrades')
      if (!salaryGrades || Object.keys(salaryGrades).length === 0) {
        const grades = [
          { position: 'Sale 1', shift: 'Ca ngày', revenueFrom: 0, revenueTo: 150, level: 1, salary: 9000000, status: 'Đang áp dụng' },
          { position: 'Sale 2', shift: 'Ca ngày', revenueFrom: 151, revenueTo: 220, level: 2, salary: 11000000, status: 'Đang áp dụng' },
          { position: 'MKT 3', shift: 'Ca ngày', revenueFrom: 0, revenueTo: 50, level: 3, salary: 12000000, status: 'Đang áp dụng' },
          { position: 'MKT 4', shift: 'Ca ngày', revenueFrom: 51, revenueTo: 100, level: 4, salary: 14000000, status: 'Đang áp dụng' }
        ]
        for (const grade of grades) {
          await fbPush('hr/salaryGrades', grade)
          totalCreated++
        }
      }

      // 3. Seed Competency Framework
      const competencyFramework = await fbGet('hr/competencyFramework')
      if (!competencyFramework || Object.keys(competencyFramework).length === 0) {
        const framework = [
          { department: 'MKT', position: 'MKT 3', group: 'Chuyên môn', name: 'Xây dựng & triển khai kế hoạch Marketing', level: 3, status: 'Áp dụng' },
          { department: 'MKT', position: 'MKT 4', group: 'Chuyên môn', name: 'Xây dựng & triển khai kế hoạch Marketing', level: 4, status: 'Áp dụng' },
          { department: 'MKT', position: 'MKT 3', group: 'Cá nhân', name: 'Chủ động phát hiện & xử lý vấn đề', level: 3, status: 'Áp dụng' }
        ]
        for (const item of framework) {
          await fbPush('hr/competencyFramework', item)
          totalCreated++
        }
      }

      // 4. Seed KPI Templates
      const kpiTemplates = await fbGet('hr/kpiTemplates')
      if (!kpiTemplates || Object.keys(kpiTemplates).length === 0) {
        const today = new Date()
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
        const templates = [
          { code: 'KPI-M1', name: 'Doanh thu', unit: 'VNĐ', target: 'Cá nhân MKT', weight: 50, month: firstDayOfMonth, status: 'Đang áp dụng' },
          { code: 'KPI-M2', name: 'Tỷ lệ chi phí Ads', unit: '%', target: 'Cá nhân MKT', weight: 30, month: firstDayOfMonth, status: 'Đang áp dụng' },
          { code: 'KPI-M3', name: 'Số lượng Mes cam kết', unit: 'Lead', target: 'Cá nhân MKT', weight: 20, month: firstDayOfMonth, status: 'Đang áp dụng' }
        ]
        for (const template of templates) {
          await fbPush('hr/kpiTemplates', template)
          totalCreated++
        }
      }

      // 5. Seed Tasks
      const tasks = await fbGet('hr/tasks')
      if (!tasks || Object.keys(tasks).length === 0) {
        const employees = await fbGet('employees')
        const empList = employees ? Object.entries(employees).filter(([k,v]) => v !== null).map(([k,v]) => ({...v, id: k})) : []
        if (empList.length > 0) {
          const today = new Date()
          const taskCode = `T-${String(today.getMonth() + 1).padStart(2, '0')}-001`
          await fbPush('hr/tasks', {
            code: taskCode,
            name: 'Lập kế hoạch MKT',
            department: 'MKT',
            assignerId: empList[0].id,
            assigneeId: empList[0].id,
            priority: 'Cao',
            startDate: today.toISOString().split('T')[0],
            deadline: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            status: 'Đang làm',
            description: 'Lập kế hoạch marketing cho tháng',
            assignerName: empList[0].ho_va_ten || empList[0].name
          })
          totalCreated++
        }
      }

      alert(`Đã tạo ${totalCreated} bản ghi data mẫu thành công!`)
      if (onComplete) {
        onComplete()
      } else {
        window.location.reload()
      }
    } catch (error) {
      alert('Lỗi khi tạo data mẫu: ' + error.message)
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button 
      className="btn btn-success"
      onClick={handleSeedAll}
      disabled={loading}
      style={{ marginLeft: '10px' }}
      title="Tạo tất cả data mẫu"
    >
      {loading ? (
        <>
          <i className="fas fa-spinner fa-spin"></i> Đang tạo...
        </>
      ) : (
        <>
          <i className="fas fa-database"></i>
          Tạo tất cả data mẫu
        </>
      )}
    </button>
  )
}

export default SeedAllDataButton

