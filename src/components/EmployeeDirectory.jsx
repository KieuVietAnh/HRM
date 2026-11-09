import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import StatusFilterOptions from './StatusFilterOptions'
import { asIdentityText, formatDateDisplay, getEmployeeEmploymentStatus, getEmployeeStage, getEmployeeWorkState } from '../utils/helpers'
import { getEmployeeStatRows } from '../utils/employeeDirectoryStats'
import ResetDataModal from './ResetDataModal'

const EmployeeModal = lazy(() => import('./EmployeeModal'))
const StatusHistoryView = lazy(() => import('./StatusHistoryView'))
const MOBILE_PAGE_SIZE = 10

const getName = (employee) => employee.ho_va_ten || employee.name || employee.Tên || 'Chưa cập nhật'
const getTinhTrang = (employee) => getEmployeeEmploymentStatus(employee)
const getShift = (employee) => String(employee?.ca_lam_viec || employee?.shift || '').trim()
const isResigned = (employee) =>
    getTinhTrang(employee) === 'Nghỉ việc'

const STAT_CARDS = [
    { key: 'all', label: 'Tổng nhân sự', icon: 'fa-users', tone: 'blue' },
    { key: 'probation', label: 'Nhân sự thử việc', icon: 'fa-user-clock', tone: 'orange' },
    { key: 'official', label: 'Nhân sự chính thức', icon: 'fa-user-check', tone: 'green' },
    { key: 'expiring', label: 'Hợp đồng sắp hết hạn', icon: 'fa-file-circle-exclamation', tone: 'red', title: 'Hợp đồng hết hạn trong 60 ngày tới' },
    { key: 'missingDocuments', label: 'Hồ sơ thiếu giấy tờ', icon: 'fa-folder-open', tone: 'purple', title: 'Hồ sơ chưa có CCCD hoặc ngày sinh' },
    { key: 'frequentLate', label: 'Đi muộn nhiều', icon: 'fa-clock', tone: 'red', activity: true },
    { key: 'frequentLeave', label: 'Nghỉ phép nhiều', icon: 'fa-calendar-minus', tone: 'orange', activity: true },
    { key: 'birthday', label: 'Sinh nhật tháng này', icon: 'fa-cake-candles', tone: 'pink' },
    { key: 'anniversary', label: 'Sắp đến thâm niên', icon: 'fa-award', tone: 'teal', title: 'Kỷ niệm ngày vào làm trong 30 ngày tới' }
]

function EmployeeDirectory({
    companyId, employees, filteredEmployees, activeTab, setActiveTab, searchTerm, setSearchTerm,
    filterBranch, setFilterBranch,
    filterDept, setFilterDept, filterStatus, setFilterStatus, filterContract, setFilterContract,
    filterShift = '', setFilterShift,
    statFilter = '', onSelectStat, onClearStat, activityByEmployee = {}, activityLoading = false, activityError = '', contractError = '',
    selectedEmployee, setSelectedEmployee, isModalOpen, setIsModalOpen, isReadOnly, setIsReadOnly,
    onReload, onExport, onDownloadTemplate, onImport, onDelete, onResolveEmployee,
    onResetData, onResetFilters, adminEmail
}) {
    const importInputRef = useRef(null)
    const [openMenu, setOpenMenu] = useState(null)
    const [openingEmployee, setOpeningEmployee] = useState(false)
    const [isResetModalOpen, setIsResetModalOpen] = useState(false)
    const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
    const [mobileStatsExpanded, setMobileStatsExpanded] = useState(false)
    const [mobileTabsOpen, setMobileTabsOpen] = useState(false)
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
    const [mobilePage, setMobilePage] = useState(1)
    const mobileListHeaderRef = useRef(null)
    const mobilePageCount = Math.ceil(filteredEmployees.length / MOBILE_PAGE_SIZE)
    const currentMobilePage = Math.min(mobilePage, Math.max(1, mobilePageCount))
    const mobilePageStart = (currentMobilePage - 1) * MOBILE_PAGE_SIZE
    const mobileEmployees = filteredEmployees.slice(mobilePageStart, mobilePageStart + MOBILE_PAGE_SIZE)

    useEffect(() => {
        setMobilePage(1)
    }, [searchTerm, filterBranch, filterDept, filterStatus, filterContract, filterShift, statFilter, activeTab, filteredEmployees])

    const changeMobilePage = page => {
        setMobilePage(Math.max(1, Math.min(page, mobilePageCount)))
        setOpenMenu(null)
        mobileListHeaderRef.current?.scrollIntoView({
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            block: 'start'
        })
    }

    const activeEmployees = useMemo(
        () => employees.filter(employee => !isResigned(employee)),
        [employees]
    )

    const daysUntil = (value) => {
        if (!value) return null
        const date = new Date(value)
        return Number.isNaN(date.getTime()) ? null : Math.ceil((date.getTime() - Date.now()) / 86400000)
    }

    const now = new Date()
    const expiring = getEmployeeStatRows(employees, 'expiring', activityByEmployee, now)
    const branches = [...new Set(activeEmployees.map(employee => employee.chi_nhanh).filter(Boolean))].sort()
    const departments = [...new Set(activeEmployees.map(employee => employee.bo_phan).filter(Boolean))].sort()
    const teams = [...new Set(activeEmployees.map(employee => employee.team).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'))
    const contracts = [...new Set(activeEmployees.map(employee => employee.loai_hop_dong || employee.contractType).filter(Boolean))].sort()
    const shifts = [...new Set(activeEmployees.map(getShift).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'))
    const noShiftCount = activeEmployees.filter(employee => !getShift(employee)).length
    const stats = STAT_CARDS.map(card => ({
        ...card,
        value: (card.activity && (activityLoading || activityError)) || (card.key === 'expiring' && contractError)
            ? '—'
            : getEmployeeStatRows(employees, card.key, activityByEmployee, now).length,
        title: card.title || (card.key === 'frequentLate'
            ? `Trên 3 lần đi muộn trong năm ${now.getFullYear()}, theo Bảng công đã tổng hợp`
            : card.key === 'frequentLeave'
                ? `Trên 8 công phép trong năm ${now.getFullYear()}, theo Bảng công đã tổng hợp`
                : card.label)
    }))
    const selectedStat = stats.find(card => card.key === statFilter)
    const activeFilterCount = [filterBranch, filterDept, filterContract, filterShift, filterStatus].filter(Boolean).length

    const openEmployee = async (employee, readOnly = true) => {
        if (openingEmployee) return
        setOpenMenu(null)
        setIsReadOnly(readOnly)
        if (!employee) {
            setSelectedEmployee(null)
            setIsModalOpen(true)
            return
        }
        setOpeningEmployee(true)
        try {
            const full = onResolveEmployee ? await onResolveEmployee(employee) : employee
            setSelectedEmployee(full || employee)
            setIsModalOpen(true)
        } finally {
            setOpeningEmployee(false)
        }
    }

    useEffect(() => {
        if (!openMenu) return undefined
        const close = () => setOpenMenu(null)
        document.addEventListener('click', close)
        return () => document.removeEventListener('click', close)
    }, [openMenu])

    useEffect(() => {
        const closeOnOutsideClick = event => {
            if (!event.target.closest('.employees-mobile-actions')) setMobileMoreOpen(false)
            if (!event.target.closest('.employees-tabs-wrap') && !event.target.closest('.employees-mobile-list-header') && !event.target.closest('.employees-mobile-tabs-menu')) setMobileTabsOpen(false)
        }
        const closeOnEscape = event => {
            if (event.key !== 'Escape') return
            setMobileMoreOpen(false)
            setMobileTabsOpen(false)
            setMobileFiltersOpen(false)
        }
        document.addEventListener('pointerdown', closeOnOutsideClick)
        document.addEventListener('keydown', closeOnEscape)
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsideClick)
            document.removeEventListener('keydown', closeOnEscape)
        }
    }, [])

    const mobileListHeader = (
            <div className="employees-mobile-list-header" ref={mobileListHeaderRef}>
                <button
                    type="button"
                    className="employees-mobile-tabs-dropdown-trigger"
                    onClick={() => setMobileTabsOpen(open => !open)}
                    aria-expanded={mobileTabsOpen}
                    aria-haspopup="menu"
                >
                    <span>
                        {activeTab === 'history'
                            ? 'Lịch sử biến động'
                            : activeTab === 'expiring'
                                ? `Hợp đồng sắp hết hạn (${contractError ? '—' : expiring.length})`
                                : `Danh sách nhân viên (${filteredEmployees.length})`}
                    </span>
                    <i className={`fas ${mobileTabsOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                </button>
                {activeTab !== 'history' && (
                    <span className="employees-mobile-count">
                        Hiển thị {filteredEmployees.length} nhân viên
                    </span>
                )}
                {mobileTabsOpen && (
                    <div className="employees-mobile-tabs-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            className={activeTab === 'list' ? 'active' : ''}
                            onClick={() => { setMobileTabsOpen(false); setActiveTab('list'); onClearStat?.() }}
                        >
                            <i className="fas fa-list"></i> Danh sách nhân viên ({activeEmployees.length})
                        </button>
                        <button
                            type="button"
                            className={activeTab === 'expiring' ? 'active danger' : ''}
                            onClick={() => { setMobileTabsOpen(false); onSelectStat?.('expiring') }}
                            disabled={Boolean(contractError)}
                        >
                            <i className="fas fa-triangle-exclamation"></i> Hợp đồng sắp hết hạn ({contractError ? '—' : expiring.length})
                        </button>
                        <button
                            type="button"
                            className={activeTab === 'history' ? 'active' : ''}
                            onClick={() => { setMobileTabsOpen(false); setActiveTab('history'); onClearStat?.() }}
                        >
                            <i className="fas fa-clock-rotate-left"></i> Lịch sử biến động
                        </button>
                    </div>
                )}
            </div>
    )

    return (
        <div className={`employees-page${openingEmployee ? ' is-opening' : ''}`}>
            {/* Section 1: Page Header & Primary Action with Overflow Menu */}
            <header className="employees-hero">
                <div className="employees-hero__intro">
                    <div className="employees-hero__header-row">
                        <div className="employees-hero__icon">
                            <i className="fas fa-users"></i>
                        </div>
                        <div className="employees-hero__titles">
                            <h1><i className="fas fa-users desktop-icon"></i> Quản lý nhân sự</h1>
                            <p>
                                <span className="employees-hero__description-desktop">Quản lý tập trung hồ sơ, hợp đồng và tình trạng nhân viên</span>
                                <span className="employees-hero__description-mobile">Quản lý tập trung hồ sơ và tình trạng nhân viên</span>
                            </p>
                        </div>
                    </div>
                    <div className="employees-mobile-actions">
                        <button type="button" className="btn btn-primary employees-mobile-add-btn" onClick={() => openEmployee(null, false)}>
                            <i className="fas fa-plus"></i>
                            <span>Thêm nhân viên</span>
                        </button>
                        <div className="employees-mobile-more-wrap">
                            <button
                                type="button"
                                className="btn employees-mobile-more-trigger"
                                aria-label="Tác vụ khác"
                                aria-expanded={mobileMoreOpen}
                                aria-haspopup="menu"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setMobileMoreOpen(open => !open)
                                }}
                            >
                                <i className="fas fa-ellipsis"></i>
                            </button>
                            {mobileMoreOpen && (
                                <div className="employees-mobile-more-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                                    <button type="button" onClick={() => { setMobileMoreOpen(false); onDownloadTemplate?.() }}>
                                        <i className="fas fa-download"></i> Tải mẫu Excel
                                    </button>
                                    <button type="button" onClick={() => { setMobileMoreOpen(false); importInputRef.current?.click() }}>
                                        <i className="fas fa-file-import"></i> Nhập Excel
                                    </button>
                                    <button type="button" onClick={() => { setMobileMoreOpen(false); onExport?.() }}>
                                        <i className="fas fa-file-excel"></i> Xuất Excel
                                    </button>
                                    <button type="button" className="danger" onClick={() => { setMobileMoreOpen(false); setIsResetModalOpen(true) }}>
                                        <i className="fas fa-trash-can"></i> Reset dữ liệu
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="employees-hero__actions">
                    <button className="btn" onClick={onDownloadTemplate}><i className="fas fa-download"></i> Tải mẫu Excel</button>
                    <button className="btn" onClick={onExport}><i className="fas fa-file-excel"></i> Xuất Excel</button>
                    <button className="btn" onClick={() => importInputRef.current?.click()}><i className="fas fa-file-import"></i> Nhập Excel</button>
                    <input ref={importInputRef} className="employees-file-input" type="file" accept=".xlsx,.xls,.csv" onChange={onImport} />
                    <button className="btn btn-outline-danger" onClick={() => setIsResetModalOpen(true)} title="Xóa dữ liệu nhân sự đã dùng/thử nghiệm">
                        <i className="fas fa-trash-can"></i> Reset dữ liệu
                    </button>
                    <button className="btn btn-primary" onClick={() => openEmployee(null, false)}><i className="fas fa-plus"></i> Thêm nhân viên</button>
                </div>
            </header>

            {/* Section 2: Desktop 9-Stat Overview Grid */}
            <section className="hr-overview hr-overview--desktop">
                {stats.map(({ key, label, value, icon, tone, title, activity }) => (
                    <button key={key} type="button"
                        className={`hr-stat hr-stat--${tone}${(key === 'all' ? !statFilter && activeTab === 'list' : statFilter === key) ? ' is-selected' : ''}`}
                        onClick={() => onSelectStat?.(key)}
                        disabled={(activity && (activityLoading || Boolean(activityError))) || (key === 'expiring' && Boolean(contractError))}
                        aria-pressed={key === 'all' ? !statFilter && activeTab === 'list' : statFilter === key}
                        title={title}>
                        <span className="hr-stat__icon"><i className={`fas ${icon}`}></i></span>
                        <span><strong>{value}</strong><small>{label}</small></span>
                    </button>
                ))}
            </section>

            {/* Section 2 (Mobile): Compact 3-Metric Statistics Row with Accordion Link */}
            <section className="employees-mobile-stats-card">
                <div className="employees-mobile-stats-row">
                    <button
                        type="button"
                        className="employees-mobile-stat-col"
                        onClick={() => onSelectStat?.('all')}
                    >
                        <span className="employees-mobile-stat-val primary">{stats[0]?.value}</span>
                        <span className="employees-mobile-stat-label">Tổng nhân sự</span>
                    </button>
                    <button
                        type="button"
                        className="employees-mobile-stat-col"
                        onClick={() => onSelectStat?.('probation')}
                    >
                        <span className="employees-mobile-stat-val warning">{stats[1]?.value}</span>
                        <span className="employees-mobile-stat-label">Thử việc</span>
                    </button>
                    <button
                        type="button"
                        className="employees-mobile-stat-col"
                        onClick={() => onSelectStat?.('official')}
                    >
                        <span className="employees-mobile-stat-val success">{stats[2]?.value}</span>
                        <span className="employees-mobile-stat-label">Chính thức</span>
                    </button>
                </div>
                {mobileStatsExpanded && (
                    <div className="employees-mobile-stats-expanded">
                        {stats.slice(3).map(({ key, label, value, icon, tone, title, activity }) => (
                            <button
                                key={key}
                                type="button"
                                className={`employees-mobile-stat-extra hr-stat--${tone}${statFilter === key ? ' is-selected' : ''}`}
                                onClick={() => onSelectStat?.(key)}
                                disabled={(activity && (activityLoading || Boolean(activityError))) || (key === 'expiring' && Boolean(contractError))}
                                title={title}
                            >
                                <span className="extra-icon"><i className={`fas ${icon}`}></i></span>
                                <span className="extra-info">
                                    <strong>{value}</strong>
                                    <small>{label}</small>
                                </span>
                            </button>
                        ))}
                    </div>
                )}
                <button
                    type="button"
                    className="employees-mobile-stats-toggle"
                    aria-expanded={mobileStatsExpanded}
                    onClick={() => setMobileStatsExpanded(expanded => !expanded)}
                >
                    <span>{mobileStatsExpanded ? 'Thu gọn chỉ số' : 'Xem tất cả chỉ số'}</span>
                    <i className={`fas ${mobileStatsExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                </button>
            </section>
            {activityError && <p className="employees-stat-error" role="alert">{activityError}</p>}
            {contractError && <p className="employees-stat-error" role="alert">{contractError}</p>}

            {/* Desktop Tabs */}
            <div className="employees-tabs-wrap">
                <nav className="employees-tabs" aria-label="Mục nhân sự">
                    <button className={activeTab === 'list' ? 'active' : ''} onClick={() => { setActiveTab('list'); onClearStat?.() }}><i className="fas fa-list"></i> Danh sách nhân viên</button>
                    <button className={activeTab === 'expiring' ? 'active danger' : ''} onClick={() => onSelectStat?.('expiring')} disabled={Boolean(contractError)}><i className="fas fa-triangle-exclamation"></i> Hợp đồng sắp hết hạn <span>{contractError ? '—' : expiring.length}</span></button>
                    <button className={activeTab === 'history' ? 'active' : ''} onClick={() => { setActiveTab('history'); onClearStat?.() }}><i className="fas fa-clock-rotate-left"></i> Lịch sử biến động</button>
                </nav>
            </div>

            {activeTab === 'history' && mobileListHeader}

            {activeTab === 'history' ? (
                <Suspense fallback={<div className="loadingState">Đang tải lịch sử...</div>}>
                    <StatusHistoryView companyId={companyId} employees={employees} onDataChange={onReload} />
                </Suspense>
            ) : <>
                {selectedStat && <div className="employees-stat-filter" role="status">
                    <span>Đang xem: <strong>{selectedStat.label}</strong> ({selectedStat.value} nhân viên)
                        <small>{selectedStat.title}</small>
                    </span>
                    <button type="button" onClick={() => { setActiveTab('list'); onClearStat?.() }}>Xóa lọc thống kê</button>
                </div>}

                {/* Section 3: Desktop Filter Card */}
                <section className="employees-filter-card">
                    <label className="employees-search">
                        <i className="fas fa-search"></i>
                        <input
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Tìm theo họ tên, email, số điện thoại..."
                            aria-label="Tìm nhân viên"
                        />
                    </label>
                    <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
                        <option value="">Tất cả chi nhánh</option>
                        {branches.map(value => <option key={value} value={value}>{value}</option>)}
                        <option value="__none__">Chưa có chi nhánh</option>
                    </select>
                    <select value={filterDept} onChange={e => setFilterDept(e.target.value)}>
                        <option value="">Tất cả phòng ban</option>
                        {departments.map(value => <option key={value} value={value}>{value}</option>)}
                    </select>
                    <select value={filterContract} onChange={e => setFilterContract(e.target.value)}>
                        <option value="">Tất cả hợp đồng</option>
                        {contracts.map(value => <option key={value} value={value}>{value}</option>)}
                    </select>
                    <select value={filterShift} onChange={e => setFilterShift(e.target.value)}>
                        <option value="">Tất cả ca</option>
                        {shifts.map(value => <option key={value} value={value}>{value}</option>)}
                        {noShiftCount > 0 && <option value="__none__">Chưa gán ca</option>}
                    </select>
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                        <StatusFilterOptions />
                    </select>
                    <button className="btn btn-icon" title="Làm mới & đặt lại bộ lọc" aria-label="Làm mới và đặt lại bộ lọc" onClick={onResetFilters || onReload}>
                        <i className="fas fa-rotate"></i>
                    </button>
                </section>

                {/* Section 3 (Mobile): Search and Filter Bar */}
                <section className="employees-mobile-filter-bar">
                    <div className="employees-mobile-search">
                        <i className="fas fa-search" aria-hidden="true"></i>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Tìm tên, email, SĐT..."
                            aria-label="Tìm tên, email, SĐT"
                        />
                    </div>
                    <button
                        type="button"
                        className={`employees-mobile-filter-btn${activeFilterCount > 0 ? ' has-filter' : ''}`}
                        onClick={() => setMobileFiltersOpen(true)}
                        aria-label="Lọc"
                    >
                        <i className="fas fa-filter" aria-hidden="true"></i>
                        <span>Lọc{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
                    </button>
                </section>

                {/* Mobile Filter Sheet Drawer */}
                {mobileFiltersOpen && (
                    <>
                        <button
                            type="button"
                            className="employees-mobile-filter-backdrop"
                            aria-label="Đóng bộ lọc"
                            onClick={() => setMobileFiltersOpen(false)}
                        />
                        <div className="employees-mobile-filter-sheet">
                            <div className="employees-filter-sheet-head">
                                <strong>Bộ lọc</strong>
                                <button type="button" aria-label="Đóng bộ lọc" onClick={() => setMobileFiltersOpen(false)}>
                                    <i className="fas fa-xmark"></i>
                                </button>
                            </div>
                            <div className="employees-filter-sheet-body">
                                <div className="filter-group">
                                    <label>Chi nhánh</label>
                                    <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
                                        <option value="">Tất cả chi nhánh</option>
                                        {branches.map(value => <option key={value} value={value}>{value}</option>)}
                                        <option value="__none__">Chưa có chi nhánh</option>
                                    </select>
                                </div>
                                <div className="filter-group">
                                    <label>Phòng ban</label>
                                    <select value={filterDept} onChange={e => setFilterDept(e.target.value)}>
                                        <option value="">Tất cả phòng ban</option>
                                        {departments.map(value => <option key={value} value={value}>{value}</option>)}
                                    </select>
                                </div>
                                <div className="filter-group">
                                    <label>Hợp đồng</label>
                                    <select value={filterContract} onChange={e => setFilterContract(e.target.value)}>
                                        <option value="">Tất cả hợp đồng</option>
                                        {contracts.map(value => <option key={value} value={value}>{value}</option>)}
                                    </select>
                                </div>
                                <div className="filter-group">
                                    <label>Ca làm việc</label>
                                    <select value={filterShift} onChange={e => setFilterShift(e.target.value)}>
                                        <option value="">Tất cả ca</option>
                                        {shifts.map(value => <option key={value} value={value}>{value}</option>)}
                                        {noShiftCount > 0 && <option value="__none__">Chưa gán ca</option>}
                                    </select>
                                </div>
                                <div className="filter-group">
                                    <label>Trạng thái</label>
                                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                                        <StatusFilterOptions />
                                    </select>
                                </div>
                            </div>
                            <div className="employees-filter-sheet-foot">
                                <button
                                    type="button"
                                    className="btn btn-outline"
                                    onClick={() => {
                                        onResetFilters?.() || onReload?.();
                                        setMobileFiltersOpen(false);
                                    }}
                                >
                                    <i className="fas fa-rotate"></i> Đặt lại
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => setMobileFiltersOpen(false)}
                                >
                                    Áp dụng
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {mobileListHeader}

                {/* Section 4: Employee List & Table */}
                <section className="employees-table-card">
                    <div className="employees-table-card__caption">
                        <span>Hiển thị <strong>{filteredEmployees.length}</strong> nhân viên</span>
                    </div>

                    {/* Desktop Table View */}
                    <div className="employees-table-wrap">
                        <table className="employees-table">
                            <thead><tr><th>Nhân viên</th><th>Phòng ban</th><th>Team</th><th>Leader</th><th>Chức danh</th><th>Ca</th><th>Ngày vào làm</th><th>Loại hợp đồng</th><th>Trạng thái</th><th>Tình trạng</th><th></th></tr></thead>
                            <tbody>{filteredEmployees.map((employee, index) => {
                                const name = getName(employee)
                                const workState = getEmployeeWorkState(employee)
                                const stage = getEmployeeStage(employee)
                                const avatar = employee.avatarDataUrl || employee.avatarUrl || employee.avatar
                                const days = daysUntil(employee.ngay_het_han || employee.contractEndDate || employee.ngay_het_han_hop_dong)
                                return <tr key={employee.id || index} onClick={() => openEmployee(employee)}>
                                    <td><div className="employee-identity"><span className="employee-avatar">{avatar ? <img src={avatar} alt="" loading="lazy" decoding="async" /> : name.charAt(0)}</span><span><strong>{name}</strong><small>{employee.email || asIdentityText(employee.sdt || employee.sđt, 'phone') || 'Chưa có thông tin liên hệ'}</small></span></div></td>
                                    <td>{employee.bo_phan || 'Chưa phân bổ'}</td>
                                    <td>{employee.team || '—'}</td>
                                    <td>{employee.is_leader ? 'Có' : '—'}</td>
                                    <td>{employee.vi_tri || 'Chưa cập nhật'}</td>
                                    <td>{getShift(employee) || 'Chưa gán ca'}</td>
                                    <td>{formatDateDisplay(employee.ngay_vao_lam) || '—'}</td>
                                    <td><span className="contract-cell">{employee.loai_hop_dong || employee.contractType || 'Chưa cập nhật'}{days !== null && days >= 0 && days <= 60 && <small>Còn {days} ngày</small>}</span></td>
                                    <td><span className={`employee-status ${workState === 'Đang làm việc' ? 'success' : workState === 'Tạm nghỉ' ? 'warning' : 'danger'}`}><i></i>{workState === 'Nghỉ việc' ? 'Đã nghỉ việc' : workState}</span></td>
                                    <td>{stage ? <span className={`employee-status ${stage === 'Chính thức' ? 'success' : 'warning'}`}><i></i>{stage}</span> : <span>—</span>}</td>
                                    <td className="employee-row-actions" onClick={(event) => event.stopPropagation()}>
                                        <button
                                            className="employee-row-menu"
                                            title="Thao tác"
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                const rowKey = employee.id || `row-${index}`
                                                if (openMenu?.id === rowKey) {
                                                    setOpenMenu(null)
                                                    return
                                                }
                                                const rect = event.currentTarget.getBoundingClientRect()
                                                setOpenMenu({
                                                    id: rowKey,
                                                    top: rect.bottom + 4,
                                                    right: window.innerWidth - rect.right
                                                })
                                            }}
                                        >
                                            <i className="fas fa-ellipsis"></i>
                                        </button>
                                        {openMenu?.id === (employee.id || `row-${index}`) && (
                                            <div
                                                className="employee-row-dropdown"
                                                style={{ top: openMenu.top, right: openMenu.right }}
                                                onClick={(event) => event.stopPropagation()}
                                            >
                                                <button type="button" onClick={() => openEmployee(employee, true)}>
                                                    <i className="fas fa-eye"></i> Xem
                                                </button>
                                                <button type="button" onClick={() => openEmployee(employee, false)}>
                                                    <i className="fas fa-edit"></i> Sửa
                                                </button>
                                                <button
                                                    type="button"
                                                    className="danger"
                                                    onClick={() => {
                                                        setOpenMenu(null)
                                                        onDelete?.(employee.id, name)
                                                    }}
                                                >
                                                    <i className="fas fa-trash"></i> Xóa
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            })}</tbody>
                        </table>
                        {!filteredEmployees.length && <div className="employee-card-empty">Không tìm thấy nhân viên phù hợp</div>}
                    </div>

                    {/* Section 4 (Mobile): Modern Card List */}
                    <div className="employees-mobile-list">
                        {mobileEmployees.map((employee, index) => {
                            const name = getName(employee)
                            const status = getTinhTrang(employee)
                            const avatar = employee.avatarDataUrl || employee.avatarUrl || employee.avatar
                            const rowKey = `mobile:${employee.id || mobilePageStart + index}`
                            const statusText = status === 'Nghỉ việc' ? 'Đã nghỉ' : (status || 'Chưa cập nhật')
                            const statusTone = status === 'Nghỉ việc'
                                ? 'danger'
                                : status === 'Thử việc'
                                    ? 'probation'
                                    : status === 'Tạm nghỉ'
                                        ? 'paused'
                                        : 'active'
                            const roleText = employee.vi_tri || employee.bo_phan || 'Chưa cập nhật'

                            return (
                                <div className="employees-mobile-card" key={employee.id || mobilePageStart + index}>
                                    <div
                                        className="employees-mobile-card-main"
                                        onClick={() => openEmployee(employee, true)}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`Xem thông tin ${name}`}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openEmployee(employee, true) }}
                                    >
                                        <div className={`employees-mobile-avatar${avatar ? ' has-img' : ''}`}>
                                            {avatar ? (
                                                <img src={avatar} alt="" loading="lazy" decoding="async" />
                                            ) : (
                                                name.charAt(0)
                                            )}
                                        </div>
                                        <div className="employees-mobile-details">
                                            <h3 className="employees-mobile-name">{name}</h3>
                                            <div className="employees-mobile-meta">
                                                {employee.employeeId && <span className="employees-mobile-id">{employee.employeeId}</span>}
                                                {employee.employeeId && (employee.vi_tri || employee.bo_phan) && <span className="employees-mobile-sep">•</span>}
                                                <span className="employees-mobile-role">{roleText}</span>
                                            </div>
                                            <div className="employees-mobile-status-wrap">
                                                <span className={`employees-mobile-badge employees-mobile-badge--${statusTone}`}>
                                                    <span className="badge-dot"></span>
                                                    {statusText}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="employees-mobile-action-btn"
                                        aria-label={`Thao tác với ${name}`}
                                        aria-expanded={openMenu?.id === rowKey}
                                        aria-haspopup="menu"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setOpenMenu(openMenu?.id === rowKey ? null : { id: rowKey })
                                        }}
                                    >
                                        <i className="fas fa-ellipsis"></i>
                                    </button>
                                    {openMenu?.id === rowKey && (
                                        <div className="employees-mobile-dropdown" role="menu" onClick={(e) => e.stopPropagation()}>
                                            <button type="button" onClick={() => { setOpenMenu(null); openEmployee(employee, true); }}>
                                                <i className="fas fa-eye"></i> Xem
                                            </button>
                                            <button type="button" onClick={() => { setOpenMenu(null); openEmployee(employee, false); }}>
                                                <i className="fas fa-edit"></i> Sửa
                                            </button>
                                            <button
                                                type="button"
                                                className="danger"
                                                onClick={() => {
                                                    setOpenMenu(null)
                                                    onDelete?.(employee.id, name)
                                                }}
                                            >
                                                <i className="fas fa-trash"></i> Xóa
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                        {!filteredEmployees.length && <div className="employee-card-empty">Không tìm thấy nhân viên phù hợp</div>}
                    </div>
                    {mobilePageCount > 1 && (
                        <nav className="employees-mobile-pagination" aria-label="Phân trang nhân viên">
                            <button type="button" disabled={currentMobilePage === 1} onClick={() => changeMobilePage(currentMobilePage - 1)}>
                                <span aria-hidden="true">‹</span> Trước
                            </button>
                            <span className="employees-mobile-pagination-status" role="status" aria-live="polite">
                                Trang {currentMobilePage} / {mobilePageCount}
                            </span>
                            <button type="button" disabled={currentMobilePage === mobilePageCount} onClick={() => changeMobilePage(currentMobilePage + 1)}>
                                Sau <span aria-hidden="true">›</span>
                            </button>
                        </nav>
                    )}
                </section>
            </>}

            {isModalOpen && (
                <Suspense fallback={null}>
                    <EmployeeModal companyId={companyId} employee={selectedEmployee} isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setSelectedEmployee(null); setIsReadOnly(false) }} onSave={onReload} readOnly={isReadOnly} departmentOptions={departments} teamOptions={teams} positionOptions={[...new Set(activeEmployees.map(e => e.vi_tri).filter(Boolean))]} />
                </Suspense>
            )}

            <ResetDataModal
                isOpen={isResetModalOpen}
                onClose={() => setIsResetModalOpen(false)}
                onConfirm={onResetData}
                totalEmployees={activeEmployees.length}
                adminEmail={adminEmail}
            />
        </div>
    )
}

export default EmployeeDirectory
