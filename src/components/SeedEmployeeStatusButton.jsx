import { useState } from 'react'
import { fbPush } from '../services/firebase'

function SeedEmployeeStatusButton({ employees, onComplete }) {
    const [loading, setLoading] = useState(false)

    const handleSeed = async () => {
        if (!confirm('Tạo dữ liệu mẫu lịch sử trạng thái nhân sự?')) return

        setLoading(true)
        try {
            const sampleStatuses = [
                'Đang làm việc',
                'Nghỉ việc',
                'Tạm nghỉ',
                'Thử việc',
                'Chính thức'
            ]

            const reasons = [
                'Chuyển từ thử việc sang chính thức',
                'Nghỉ việc theo đơn',
                'Nghỉ thai sản',
                'Kết thúc hợp đồng',
                'Chuyển bộ phận'
            ]

            // Lấy 5 nhân viên đầu tiên để tạo mẫu
            const sampleEmployees = employees.slice(0, 5)

            for (let i = 0; i < sampleEmployees.length; i++) {
                const emp = sampleEmployees[i]
                const date = new Date()
                date.setDate(date.getDate() - (i * 7)) // Mỗi nhân viên cách nhau 7 ngày

                await fbPush('hr/employee_status_history', {
                    employeeId: emp.id,
                    employeeCode: emp.id,
                    employeeName: emp.ho_va_ten || emp.name || 'N/A',
                    newStatus: sampleStatuses[i % sampleStatuses.length],
                    effectiveDate: date.toISOString().split('T')[0],
                    actor: 'HR Admin',
                    note: reasons[i % reasons.length],
                    createdAt: new Date().toISOString()
                })
            }

            alert(`Đã tạo ${sampleEmployees.length} mẫu lịch sử trạng thái`)
            if (onComplete) onComplete()
        } catch (error) {
            alert('Lỗi: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <button
            className="btn btn-secondary"
            onClick={handleSeed}
            disabled={loading || !employees || employees.length === 0}
        >
            <i className={loading ? "fas fa-spinner fa-spin" : "fas fa-database"}></i>
            {loading ? 'Đang tạo...' : 'Tạo dữ liệu mẫu'}
        </button>
    )
}

export default SeedEmployeeStatusButton
