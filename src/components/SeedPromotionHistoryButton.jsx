import React from 'react'
import { fbPush, fbGet } from '../services/firebase'

function SeedPromotionHistoryButton({ employees, salaryGrades, onComplete }) {
  const handleSeedPromotionHistory = async () => {
    if (!confirm('Bạn có chắc muốn tạo data mẫu lịch sử thăng tiến? Dữ liệu cũ sẽ không bị xóa.')) {
      return
    }

    try {
      if (!employees || employees.length === 0) {
        alert('Vui lòng tạo nhân viên trước!')
        return
      }

      if (!salaryGrades || salaryGrades.length === 0) {
        alert('Vui lòng tạo bậc lương trước!')
        return
      }

      // Lấy các bậc lương theo thứ tự
      const sortedGrades = salaryGrades
        .filter(g => g.status === 'Đang áp dụng')
        .sort((a, b) => (a.level || 0) - (b.level || 0))

      if (sortedGrades.length < 2) {
        alert('Cần ít nhất 2 bậc lương để tạo lịch sử thăng tiến!')
        return
      }

      // Data mẫu theo yêu cầu PTTK
      const samplePromotions = []

      // NV đầu tiên: Nhận việc (Bậc 1) -> Thăng chức (Bậc 2)
      if (employees[0] && sortedGrades.length >= 2) {
        // Nhận việc
        samplePromotions.push({
          employeeId: employees[0].id,
          salaryGradeId: sortedGrades[0].id, // Bậc 1
          effectiveDate: '2025-01-01',
          type: 'Nhận việc',
          reason: 'Nhân sự mới',
          approvedBy: 'HR Nguyễn A'
        })

        // Thăng chức
        samplePromotions.push({
          employeeId: employees[0].id,
          salaryGradeId: sortedGrades[1].id, // Bậc 2
          effectiveDate: '2025-04-01',
          type: 'Thăng chức',
          reason: 'Đạt KPI quý I',
          approvedBy: 'HR Trần B'
        })
      }

      // NV thứ 2: Điều chỉnh lương (Bậc 4)
      if (employees[1] && sortedGrades.length >= 4) {
        samplePromotions.push({
          employeeId: employees[1].id,
          salaryGradeId: sortedGrades[3].id, // Bậc 4
          effectiveDate: '2025-06-01',
          type: 'Điều chỉnh lương',
          reason: 'Điều chỉnh chính sách P1',
          approvedBy: 'HR Nguyễn A'
        })
      }

      // NV thứ 3: Nhận việc
      if (employees[2] && sortedGrades.length >= 1) {
        samplePromotions.push({
          employeeId: employees[2].id,
          salaryGradeId: sortedGrades[0].id, // Bậc 1
          effectiveDate: '2025-03-01',
          type: 'Nhận việc',
          reason: 'Nhân sự mới',
          approvedBy: 'HR'
        })
      }

      // Tạo lịch sử
      let successCount = 0
      for (const promotion of samplePromotions) {
        try {
          await fbPush('hr/promotionHistory', promotion)
          successCount++
        } catch (error) {
          console.error('Lỗi khi tạo lịch sử:', error)
        }
      }

      alert(`Đã tạo ${successCount} lịch sử thăng tiến mẫu`)
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
      onClick={handleSeedPromotionHistory}
      style={{ marginLeft: '10px' }}
      title="Tạo lịch sử thăng tiến mẫu"
    >
      <i className="fas fa-history"></i>
      Tạo lịch sử mẫu
    </button>
  )
}

export default SeedPromotionHistoryButton

