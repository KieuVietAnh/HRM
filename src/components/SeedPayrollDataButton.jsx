import React from 'react'
import { fbPush, fbGet } from '../services/firebase'

function SeedPayrollDataButton({ employees, onComplete }) {
  const handleSeedPayroll = async () => {
    if (!confirm('Bạn có chắc muốn tạo data mẫu bảng lương? Dữ liệu cũ sẽ không bị xóa.')) {
      return
    }

    try {
      if (!employees || employees.length === 0) {
        alert('Vui lòng tạo nhân viên trước!')
        return
      }

      // Load employee salaries
      const hrData = await fbGet('hr')
      const employeeSalaries = hrData?.employeeSalaries ? Object.entries(hrData.employeeSalaries).map(([k,v]) => ({...v, id: k})) : []
      const salaryGrades = hrData?.salaryGrades ? Object.entries(hrData.salaryGrades).map(([k,v]) => ({...v, id: k})) : []

      const today = new Date()
      const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

      const payrolls = employees.slice(0, 5).map(emp => {
        const empSalary = employeeSalaries.find(es => es.employeeId === emp.id)
        const salaryGrade = empSalary ? salaryGrades.find(sg => sg.id === empSalary.salaryGradeId) : null
        const luongP1 = salaryGrade?.salary || 12000000
        const p3 = 100 + Math.floor(Math.random() * 30) // 100-130%
        const luong3P = (luongP1 * p3) / 100
        const congThucTe = 24 + Math.floor(Math.random() * 4) // 24-27 công
        const luongNgayCong = (luong3P / 26) * congThucTe
        const thuongNong = Math.floor(Math.random() * 3000000) // 0-3 triệu
        const bhxh = Math.floor(luongP1 * 0.105) // 10.5%
        const thueTNCN = Math.floor(Math.random() * 1000000) // 0-1 triệu
        const tamUng = Math.floor(Math.random() * 2000000) // 0-2 triệu

        return {
          employeeId: emp.id,
          period: monthStr,
          department: emp.bo_phan || emp.department || 'MKT',
          congThucTe,
          luongP1,
          ketQuaP3: `${p3}%`,
          luong3P,
          luongNgayCong,
          thuongNong,
          bhxh,
          thueTNCN,
          tamUng,
          khac: 0,
          status: Math.random() > 0.5 ? 'Đã chốt' : 'Đang tính'
        }
      })

      let successCount = 0
      for (const payroll of payrolls) {
        try {
          await fbPush('hr/payrolls', payroll)
          successCount++
        } catch (error) {
          console.error('Lỗi khi tạo payroll:', error)
        }
      }

      alert(`Đã tạo ${successCount} bảng lương mẫu`)
      if (onComplete) {
        onComplete()
      } else {
        window.location.reload()
      }
    } catch (error) {
      alert('Lỗi khi tạo data mẫu: ' + error.message)
      console.error(error)
    }
  }

  return (
    <button 
      className="btn btn-info btn-sm"
      onClick={handleSeedPayroll}
      style={{ marginLeft: '10px' }}
      title="Tạo data mẫu bảng lương"
    >
      <i className="fas fa-database"></i>
      Tạo bảng lương mẫu
    </button>
  )
}

export default SeedPayrollDataButton

