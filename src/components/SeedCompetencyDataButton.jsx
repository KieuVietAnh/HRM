import React from 'react'
import { fbPush, fbGet } from '../services/firebase'

function SeedCompetencyDataButton({ onComplete }) {
  const sampleFramework = [
    // Lãnh đạo
    { department: 'MKT', position: 'MKT 3', group: 'Lãnh đạo', name: 'Lập kế hoạch & giám sát KPI', level: 1, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 4', group: 'Lãnh đạo', name: 'Lập kế hoạch & giám sát KPI', level: 2, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 5', group: 'Lãnh đạo', name: 'Lập kế hoạch & giám sát KPI', level: 2, status: 'Áp dụng' },
    { department: 'MKT', position: 'Trưởng team 1', group: 'Lãnh đạo', name: 'Lập kế hoạch & giám sát KPI', level: 3, status: 'Áp dụng' },
    { department: 'MKT', position: 'Trưởng team 2', group: 'Lãnh đạo', name: 'Lập kế hoạch & giám sát KPI', level: 4, status: 'Áp dụng' },
    { department: 'MKT', position: 'Trưởng team 2', group: 'Lãnh đạo', name: 'Lập kế hoạch & giám sát KPI', level: 5, status: 'Áp dụng' },
    
    { department: 'MKT', position: 'MKT 4', group: 'Lãnh đạo', name: 'Dẫn dắt & tạo động lực đội nhóm', level: 2, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 5', group: 'Lãnh đạo', name: 'Dẫn dắt & tạo động lực đội nhóm', level: 3, status: 'Áp dụng' },
    { department: 'MKT', position: 'Trưởng team 1', group: 'Lãnh đạo', name: 'Dẫn dắt & tạo động lực đội nhóm', level: 4, status: 'Áp dụng' },
    { department: 'MKT', position: 'Trưởng team 2', group: 'Lãnh đạo', name: 'Dẫn dắt & tạo động lực đội nhóm', level: 5, status: 'Áp dụng' },
    
    { department: 'MKT', position: 'MKT 4', group: 'Lãnh đạo', name: 'Đào tạo & kèm cặp nhân viên', level: 2, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 5', group: 'Lãnh đạo', name: 'Đào tạo & kèm cặp nhân viên', level: 3, status: 'Áp dụng' },
    { department: 'MKT', position: 'Trưởng team 1', group: 'Lãnh đạo', name: 'Đào tạo & kèm cặp nhân viên', level: 4, status: 'Áp dụng' },
    { department: 'MKT', position: 'Trưởng team 2', group: 'Lãnh đạo', name: 'Đào tạo & kèm cặp nhân viên', level: 5, status: 'Áp dụng' },
    
    // Chuyên môn
    { department: 'MKT', position: 'MKT 1', group: 'Chuyên môn', name: 'Xây dựng & triển khai kế hoạch Marketing', level: 2, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 2', group: 'Chuyên môn', name: 'Xây dựng & triển khai kế hoạch Marketing', level: 3, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 3', group: 'Chuyên môn', name: 'Xây dựng & triển khai kế hoạch Marketing', level: 3, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 4', group: 'Chuyên môn', name: 'Xây dựng & triển khai kế hoạch Marketing', level: 4, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 5', group: 'Chuyên môn', name: 'Xây dựng & triển khai kế hoạch Marketing', level: 4, status: 'Áp dụng' },
    { department: 'MKT', position: 'Trưởng team 1', group: 'Chuyên môn', name: 'Xây dựng & triển khai kế hoạch Marketing', level: 5, status: 'Áp dụng' },
    { department: 'MKT', position: 'Trưởng team 2', group: 'Chuyên môn', name: 'Xây dựng & triển khai kế hoạch Marketing', level: 5, status: 'Áp dụng' },
    
    { department: 'MKT', position: 'MKT 1', group: 'Chuyên môn', name: 'Báo cáo & quản lý chiến dịch – ngân sách', level: 1, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 2', group: 'Chuyên môn', name: 'Báo cáo & quản lý chiến dịch – ngân sách', level: 2, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 3', group: 'Chuyên môn', name: 'Báo cáo & quản lý chiến dịch – ngân sách', level: 3, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 4', group: 'Chuyên môn', name: 'Báo cáo & quản lý chiến dịch – ngân sách', level: 3, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 5', group: 'Chuyên môn', name: 'Báo cáo & quản lý chiến dịch – ngân sách', level: 4, status: 'Áp dụng' },
    { department: 'MKT', position: 'Trưởng team 1', group: 'Chuyên môn', name: 'Báo cáo & quản lý chiến dịch – ngân sách', level: 4, status: 'Áp dụng' },
    { department: 'MKT', position: 'Trưởng team 2', group: 'Chuyên môn', name: 'Báo cáo & quản lý chiến dịch – ngân sách', level: 5, status: 'Áp dụng' },
    
    { department: 'MKT', position: 'MKT 1', group: 'Chuyên môn', name: 'Quản lý số lượng & chất lượng data', level: 1, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 2', group: 'Chuyên môn', name: 'Quản lý số lượng & chất lượng data', level: 2, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 3', group: 'Chuyên môn', name: 'Quản lý số lượng & chất lượng data', level: 3, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 4', group: 'Chuyên môn', name: 'Quản lý số lượng & chất lượng data', level: 3, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 5', group: 'Chuyên môn', name: 'Quản lý số lượng & chất lượng data', level: 4, status: 'Áp dụng' },
    { department: 'MKT', position: 'Trưởng team 1', group: 'Chuyên môn', name: 'Quản lý số lượng & chất lượng data', level: 4, status: 'Áp dụng' },
    { department: 'MKT', position: 'Trưởng team 2', group: 'Chuyên môn', name: 'Quản lý số lượng & chất lượng data', level: 5, status: 'Áp dụng' },
    
    // Cá nhân
    { department: 'MKT', position: 'MKT 1', group: 'Cá nhân', name: 'Đề xuất giải pháp mới', level: 1, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 2', group: 'Cá nhân', name: 'Đề xuất giải pháp mới', level: 2, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 3', group: 'Cá nhân', name: 'Đề xuất giải pháp mới', level: 3, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 4', group: 'Cá nhân', name: 'Đề xuất giải pháp mới', level: 3, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 5', group: 'Cá nhân', name: 'Đề xuất giải pháp mới', level: 4, status: 'Áp dụng' },
    { department: 'MKT', position: 'Trưởng team 1', group: 'Cá nhân', name: 'Đề xuất giải pháp mới', level: 4, status: 'Áp dụng' },
    { department: 'MKT', position: 'Trưởng team 2', group: 'Cá nhân', name: 'Đề xuất giải pháp mới', level: 5, status: 'Áp dụng' },
    
    { department: 'MKT', position: 'MKT 1', group: 'Cá nhân', name: 'Chủ động phát hiện & xử lý vấn đề', level: 1, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 2', group: 'Cá nhân', name: 'Chủ động phát hiện & xử lý vấn đề', level: 2, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 3', group: 'Cá nhân', name: 'Chủ động phát hiện & xử lý vấn đề', level: 3, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 4', group: 'Cá nhân', name: 'Chủ động phát hiện & xử lý vấn đề', level: 3, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 5', group: 'Cá nhân', name: 'Chủ động phát hiện & xử lý vấn đề', level: 4, status: 'Áp dụng' },
    { department: 'MKT', position: 'Trưởng team 1', group: 'Cá nhân', name: 'Chủ động phát hiện & xử lý vấn đề', level: 4, status: 'Áp dụng' },
    { department: 'MKT', position: 'Trưởng team 2', group: 'Cá nhân', name: 'Chủ động phát hiện & xử lý vấn đề', level: 5, status: 'Áp dụng' },
    
    { department: 'MKT', position: 'MKT 2', group: 'Cá nhân', name: 'Mức độ chuyên cần', level: 2, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 3', group: 'Cá nhân', name: 'Mức độ chuyên cần', level: 3, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 4', group: 'Cá nhân', name: 'Mức độ chuyên cần', level: 3, status: 'Áp dụng' },
    { department: 'MKT', position: 'MKT 5', group: 'Cá nhân', name: 'Mức độ chuyên cần', level: 4, status: 'Áp dụng' },
    { department: 'MKT', position: 'Trưởng team 1', group: 'Cá nhân', name: 'Mức độ chuyên cần', level: 4, status: 'Áp dụng' },
    { department: 'MKT', position: 'Trưởng team 2', group: 'Cá nhân', name: 'Mức độ chuyên cần', level: 5, status: 'Áp dụng' },
  ]

  const handleSeedFramework = async () => {
    if (!confirm('Bạn có chắc muốn tạo data mẫu khung năng lực? Dữ liệu cũ sẽ không bị xóa.')) {
      return
    }

    try {
      let successCount = 0
      for (const item of sampleFramework) {
        try {
          await fbPush('hr/competencyFramework', item)
          successCount++
        } catch (error) {
          console.error('Lỗi khi tạo:', error)
        }
      }
      alert(`Đã tạo ${successCount} khung năng lực mẫu`)
      if (onComplete) {
        onComplete()
      } else {
        window.location.reload()
      }
    } catch (error) {
      alert('Lỗi khi tạo data mẫu: ' + error.message)
    }
  }

  return (
    <button 
      className="btn btn-info btn-sm"
      onClick={handleSeedFramework}
      style={{ marginLeft: '10px' }}
    >
      <i className="fas fa-database"></i>
      Tạo khung năng lực mẫu
    </button>
  )
}

export default SeedCompetencyDataButton

