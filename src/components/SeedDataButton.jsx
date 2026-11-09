import React from 'react'
import { fbPush, fbGet } from '../services/firebase'

function SeedDataButton() {
  const sampleSalaryGrades = [
    {
      position: 'Sale 1',
      shift: 'Ca ngày',
      revenueFrom: 0,
      revenueTo: 150,
      level: 1,
      salary: 9000000,
      status: 'Đang áp dụng'
    },
    {
      position: 'Sale 1',
      shift: 'Ca đêm',
      revenueFrom: 0,
      revenueTo: 200,
      level: 1,
      salary: 9000000,
      status: 'Đang áp dụng'
    },
    {
      position: 'Sale 2',
      shift: 'Ca ngày',
      revenueFrom: 151,
      revenueTo: 220,
      level: 2,
      salary: 11000000,
      status: 'Đang áp dụng'
    },
    {
      position: 'Sale 2',
      shift: 'Ca đêm',
      revenueFrom: 251,
      revenueTo: 270,
      level: 2,
      salary: 11000000,
      status: 'Đang áp dụng'
    },
    {
      position: 'Sale cứng 1',
      shift: 'Ca ngày',
      revenueFrom: 261,
      revenueTo: 350,
      level: 4,
      salary: 14000000,
      status: 'Đang áp dụng'
    },
    {
      position: 'Trưởng nhóm Sale 2',
      shift: 'Ca đêm',
      revenueFrom: 3401,
      revenueTo: null,
      level: 7,
      salary: 22000000,
      status: 'Đang áp dụng'
    },
    {
      position: 'MKT 1',
      shift: 'Ca ngày',
      revenueFrom: 0,
      revenueTo: 100,
      level: 1,
      salary: 8000000,
      status: 'Đang áp dụng'
    },
    {
      position: 'MKT 2',
      shift: 'Ca ngày',
      revenueFrom: 101,
      revenueTo: 200,
      level: 2,
      salary: 10000000,
      status: 'Đang áp dụng'
    },
    {
      position: 'MKT 3',
      shift: 'Ca ngày',
      revenueFrom: 201,
      revenueTo: 300,
      level: 3,
      salary: 12000000,
      status: 'Đang áp dụng'
    },
    {
      position: 'MKT 4',
      shift: 'Ca ngày',
      revenueFrom: 301,
      revenueTo: 400,
      level: 4,
      salary: 15000000,
      status: 'Đang áp dụng'
    },
    {
      position: 'MKT 5',
      shift: 'Ca ngày',
      revenueFrom: 401,
      revenueTo: null,
      level: 5,
      salary: 18000000,
      status: 'Đang áp dụng'
    },
    {
      position: 'Trưởng team MKT',
      shift: 'Ca ngày',
      revenueFrom: 0,
      revenueTo: null,
      level: 6,
      salary: 20000000,
      status: 'Đang áp dụng'
    }
  ]

  const handleSeedSalaryGrades = async () => {
    if (!confirm('Bạn có chắc muốn tạo data mẫu bậc lương? Dữ liệu cũ sẽ không bị xóa.')) {
      return
    }

    try {
      let successCount = 0
      let errorCount = 0

      // Tạo bậc lương
      for (const grade of sampleSalaryGrades) {
        try {
          await fbPush('hr/salaryGrades', grade)
          successCount++
        } catch (error) {
          console.error('Lỗi khi tạo bậc lương:', grade.position, error)
          errorCount++
        }
      }

      alert(`Đã tạo ${successCount} bậc lương mẫu${errorCount > 0 ? `, ${errorCount} lỗi` : ''}`)
      window.location.reload()
    } catch (error) {
      alert('Lỗi khi tạo data mẫu: ' + error.message)
    }
  }

  const handleSeedAllData = async () => {
    if (!confirm('Bạn có chắc muốn tạo TẤT CẢ data mẫu (Bậc lương + Bậc lương NV + Lịch sử thăng tiến)?')) {
      return
    }

    try {
      // 1. Tạo bậc lương
      const gradeIds = []
      for (const grade of sampleSalaryGrades) {
        try {
          const result = await fbPush('hr/salaryGrades', grade)
          // Firebase trả về { name: "..." } khi POST
          if (result && result.name) {
            gradeIds.push(result.name)
          }
        } catch (error) {
          console.error('Lỗi khi tạo bậc lương:', error)
        }
      }

      // 2. Lấy danh sách nhân viên
      const empData = await fbGet('employees')
      let employees = []
      if (empData) {
        if (Array.isArray(empData)) {
          employees = empData.filter(item => item !== null && item !== undefined)
        } else if (typeof empData === "object") {
          employees = Object.entries(empData)
            .filter(([k,v]) => v !== null && v !== undefined)
            .map(([k,v]) => ({...v, id: k}))
        }
      }

      // 3. Tạo bậc lương nhân viên và lịch sử thăng tiến (nếu có nhân viên)
      if (employees.length > 0 && gradeIds.length > 0) {
        // Lấy 4 nhân viên đầu tiên để gán bậc lương
        const sampleEmployees = employees.slice(0, Math.min(4, employees.length))
        const sampleEmployeeSalaries = [
          { employeeId: sampleEmployees[0]?.id, salaryGradeId: gradeIds[0], effectiveDate: '2025-01-01' },
          { employeeId: sampleEmployees[1]?.id, salaryGradeId: gradeIds[2], effectiveDate: '2025-01-02' },
          { employeeId: sampleEmployees[2]?.id, salaryGradeId: gradeIds[4], effectiveDate: '2025-01-03' },
          { employeeId: sampleEmployees[3]?.id, salaryGradeId: gradeIds[5], effectiveDate: '2025-01-01' }
        ].filter(item => item.employeeId)

        for (const empSal of sampleEmployeeSalaries) {
          try {
            await fbPush('hr/employeeSalaries', empSal)
            
            // Tạo lịch sử thăng tiến
            const historyData = {
              employeeId: empSal.employeeId,
              salaryGradeId: empSal.salaryGradeId,
              effectiveDate: empSal.effectiveDate,
              type: 'Nhận việc',
              reason: 'Nhân sự mới',
              approvedBy: 'HR'
            }
            await fbPush('hr/promotionHistory', historyData)
          } catch (error) {
            console.error('Lỗi khi tạo bậc lương NV:', error)
          }
        }

        // Tạo thêm lịch sử thăng tiến mẫu (theo yêu cầu PTTK)
        if (sampleEmployees.length > 0 && gradeIds.length > 0) {
          // NV001: Nhận việc (Bậc 1) -> Thăng chức (Bậc 2)
          if (sampleEmployees[0] && gradeIds.length > 2) {
            const promotionData1 = {
              employeeId: sampleEmployees[0].id,
              salaryGradeId: gradeIds[2], // Sale 2 - Bậc 2
              effectiveDate: '2025-04-01',
              type: 'Thăng chức',
              reason: 'Đạt KPI quý I',
              approvedBy: 'HR Trần B'
            }
            await fbPush('hr/promotionHistory', promotionData1)
          }

          // NV002: Điều chỉnh lương (Bậc 4)
          if (sampleEmployees[1] && gradeIds.length > 4) {
            const promotionData2 = {
              employeeId: sampleEmployees[1].id,
              salaryGradeId: gradeIds[4], // Sale cứng 1 - Bậc 4
              effectiveDate: '2025-06-01',
              type: 'Điều chỉnh lương',
              reason: 'Điều chỉnh chính sách P1',
              approvedBy: 'HR Nguyễn A'
            }
            await fbPush('hr/promotionHistory', promotionData2)
          }
        }
      }

      alert('Đã tạo đầy đủ data mẫu!')
      window.location.reload()
    } catch (error) {
      alert('Lỗi khi tạo data mẫu: ' + error.message)
      console.error(error)
    }
  }

  return (
    <>
      <button 
        className="btn btn-info btn-sm"
        onClick={handleSeedSalaryGrades}
        style={{ marginLeft: '10px' }}
        title="Chỉ tạo bậc lương"
      >
        <i className="fas fa-database"></i>
        Tạo bậc lương mẫu
      </button>
      <button 
        className="btn btn-secondary btn-sm"
        onClick={handleSeedAllData}
        style={{ marginLeft: '10px' }}
        title="Tạo đầy đủ: Bậc lương + Bậc lương NV + Lịch sử"
      >
        <i className="fas fa-database"></i>
        Tạo đầy đủ data mẫu
      </button>
    </>
  )
}

export default SeedDataButton

