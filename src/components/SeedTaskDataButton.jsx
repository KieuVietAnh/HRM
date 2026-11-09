import React from 'react'
import { fbPush, fbGet } from '../services/firebase'

function SeedTaskDataButton({ employees, onComplete }) {
  const handleSeedTasks = async () => {
    if (!confirm('Bạn có chắc muốn tạo data mẫu công việc? Dữ liệu cũ sẽ không bị xóa.')) {
      return
    }

    try {
      if (!employees || employees.length === 0) {
        alert('Vui lòng tạo nhân viên trước!')
        return
      }

      const today = new Date()
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      
      const nextWeek = new Date(today)
      nextWeek.setDate(nextWeek.getDate() + 7)
      
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)

      const sampleTasks = [
        {
          code: `T-${String(today.getMonth() + 1).padStart(2, '0')}-001`,
          name: 'Lập kế hoạch MKT T12',
          department: 'MKT',
          assignerId: employees[0]?.id || employees[employees.length - 1]?.id,
          assigneeId: employees[0]?.id,
          priority: 'Cao',
          startDate: today.toISOString().split('T')[0],
          deadline: nextWeek.toISOString().split('T')[0],
          status: 'Đang làm',
          description: 'Lập kế hoạch marketing cho tháng 12, bao gồm chiến dịch quảng cáo và ngân sách',
          resultFileLink: ''
        },
        {
          code: `T-${String(today.getMonth() + 1).padStart(2, '0')}-002`,
          name: 'Giải pháp mới tối ưu chi phí Ads',
          department: 'MKT',
          assignerId: employees[0]?.id || employees[employees.length - 1]?.id,
          assigneeId: employees[1]?.id || employees[0]?.id,
          priority: 'Trung bình',
          startDate: tomorrow.toISOString().split('T')[0],
          deadline: endOfMonth.toISOString().split('T')[0],
          status: 'Đã xong',
          description: 'Nghiên cứu và đề xuất giải pháp tối ưu chi phí quảng cáo',
          resultFileLink: 'https://example.com/report-ads-optimization.pdf'
        },
        {
          code: `T-${String(today.getMonth() + 1).padStart(2, '0')}-003`,
          name: 'Đào tạo Sale mới',
          department: 'Sale',
          assignerId: employees[0]?.id || employees[employees.length - 1]?.id,
          assigneeId: employees[2]?.id || employees[0]?.id,
          priority: 'Cao',
          startDate: today.toISOString().split('T')[0],
          deadline: endOfMonth.toISOString().split('T')[0],
          status: 'Chưa bắt đầu',
          description: 'Đào tạo nhân viên sale mới về quy trình và sản phẩm',
          resultFileLink: ''
        },
        {
          code: `T-${String(today.getMonth() + 1).padStart(2, '0')}-004`,
          name: 'Cải thiện chất lượng CSKH',
          department: 'CSKH',
          assignerId: employees[0]?.id || employees[employees.length - 1]?.id,
          assigneeId: employees[3]?.id || employees[0]?.id,
          priority: 'Trung bình',
          startDate: today.toISOString().split('T')[0],
          deadline: nextWeek.toISOString().split('T')[0],
          status: 'Đang làm',
          description: 'Phân tích phản hồi khách hàng và đề xuất cải thiện',
          resultFileLink: ''
        },
        {
          code: `T-${String(today.getMonth() + 1).padStart(2, '0')}-005`,
          name: 'Tối ưu quy trình vận đơn',
          department: 'Vận đơn',
          assignerId: employees[0]?.id || employees[employees.length - 1]?.id,
          assigneeId: employees[4]?.id || employees[0]?.id,
          priority: 'Thấp',
          startDate: tomorrow.toISOString().split('T')[0],
          deadline: endOfMonth.toISOString().split('T')[0],
          status: 'Tạm dừng',
          description: 'Rà soát và tối ưu quy trình vận đơn để giảm thời gian xử lý',
          resultFileLink: ''
        }
      ]

      let successCount = 0
      for (const task of sampleTasks) {
        try {
          // Get assigner name
          const assigner = employees.find(e => e.id === task.assignerId)
          const taskData = {
            ...task,
            assignerName: assigner ? (assigner.ho_va_ten || assigner.name || task.assignerId) : task.assignerId
          }
          
          const result = await fbPush('hr/tasks', taskData)
          const taskId = result.name || task.code
          
          // Create initial log
          await fbPush('hr/taskLogs', {
            taskId: taskId,
            action: 'Tạo công việc',
            description: `Công việc "${task.name}" đã được tạo`,
            createdBy: task.assignerId,
            createdAt: new Date().toISOString()
          })
          
          successCount++
        } catch (error) {
          console.error('Lỗi khi tạo task:', error)
        }
      }

      alert(`Đã tạo ${successCount} công việc mẫu`)
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
      onClick={handleSeedTasks}
      style={{ marginLeft: '10px' }}
      title="Tạo công việc mẫu"
    >
      <i className="fas fa-database"></i>
      Tạo công việc mẫu
    </button>
  )
}

export default SeedTaskDataButton

