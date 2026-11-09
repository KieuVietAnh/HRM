import React from 'react'
import { fbPush, fbGet } from '../services/firebase'

function SeedAttendanceDataButton({ employees, onComplete }) {
  const handleSeedAttendance = async () => {
    if (!confirm('Bạn có chắc muốn tạo data mẫu chấm công? Dữ liệu cũ sẽ không bị xóa.')) {
      return
    }

    try {
      if (!employees || employees.length === 0) {
        alert('Vui lòng tạo nhân viên trước!')
        return
      }

      const today = new Date()
      const logs = []

      // Tạo chấm công cho 5 ngày gần nhất
      for (let i = 0; i < 5; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        
        employees.slice(0, 5).forEach(emp => {
          const checkIn = new Date(date)
          checkIn.setHours(8 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0, 0)
          
          const checkOut = new Date(date)
          checkOut.setHours(17 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0, 0)
          
          const hours = (checkOut - checkIn) / (1000 * 60 * 60)
          
          logs.push({
            employeeId: emp.id,
            date: date.toISOString().split('T')[0],
            checkIn: checkIn.toISOString(),
            checkOut: checkOut.toISOString(),
            hours: parseFloat(hours.toFixed(1)),
            status: hours >= 8 ? 'Đủ' : 'Thiếu'
          })
        })
      }

      let successCount = 0
      for (const log of logs) {
        try {
          await fbPush('hr/attendanceLogs', log)
          successCount++
        } catch (error) {
          console.error('Lỗi khi tạo log:', error)
        }
      }

      alert(`Đã tạo ${successCount} bản ghi chấm công mẫu`)
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
      onClick={handleSeedAttendance}
      style={{ marginLeft: '10px' }}
      title="Tạo data mẫu chấm công"
    >
      <i className="fas fa-database"></i>
      Tạo chấm công mẫu
    </button>
  )
}

export default SeedAttendanceDataButton

