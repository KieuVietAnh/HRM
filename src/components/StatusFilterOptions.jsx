import { EMPLOYMENT_STAGE_OPTIONS, WORK_STATE_OPTIONS } from '../utils/helpers'

/** Tùy chọn lọc: Trạng thái (đang làm/nghỉ) và Tình trạng (thử việc/chính thức) là hai nhóm riêng. */
function StatusFilterOptions() {
    return (
        <>
            <option value="">Tất cả trạng thái / tình trạng</option>
            <optgroup label="Trạng thái">
                {WORK_STATE_OPTIONS.map(option => (
                    <option key={option} value={option}>{option === 'Nghỉ việc' ? 'Đã nghỉ việc' : option}</option>
                ))}
            </optgroup>
            <optgroup label="Tình trạng">
                {EMPLOYMENT_STAGE_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                ))}
            </optgroup>
        </>
    )
}

export default StatusFilterOptions
