> Hướng dẫn môi trường kiểm thử local và tài khoản seed: [LOCAL_TESTING.md](./LOCAL_TESTING.md).
> `seed.sql` chỉ dành cho Supabase local; không chạy file này trong SQL Editor hay production.

# SQL Supabase — copy sang DB mới (FULL)

## File cần copy

| File | Mô tả |
|------|--------|
| [`full_setup.sql`](./full_setup.sql) | **Copy file này** — đầy đủ users + toàn bộ module HR |
| [`schema.sql`](./schema.sql) | Bản sao giống `full_setup.sql` |

## Cách chạy

1. Supabase → **SQL Editor** → New query  
2. Mở `full_setup.sql` → Ctrl+A → Ctrl+C → dán → **Run**  
3. Điền `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

## Có những gì?

### Bảng cấu trúc
| Bảng | Mục đích |
|------|----------|
| `users` | Nhân sự, login, password, role |
| `employee_status_history` | Lịch sử đổi trạng thái |
| `performance_reviews` | Đánh giá / grading |
| **`hr_records`** | **Toàn bộ module còn lại** (thay Firebase) |
| `employee_leave_settings` | Phép năm/tháng dạng JSONB theo công ty và nhân sự; chạy migration `20260924100000_employee_leave_settings.sql` sau các migration xác thực |
| `employee_leave_days` | Từng ngày nghỉ phép (tên tài khoản, ngày nghỉ, trạng thái duyệt); chạy migration `20260924143000_employee_leave_days.sql` và `20261003120000_employee_leave_day_approval.sql` |

### Trong `hr_records` (cột `collection`)
- **Lương / phúc lợi:** `salaryGrades`, `employeeSalaries`, `promotionHistory`, `payrolls`
- **Bảo hiểm / thuế:** `insuranceInfo`, `taxInfo`, `dependents`
- **Chấm công:** `attendanceLogs`, `attendanceAdjustments`, `manualWorkdays`, `attendanceMonthSummaries` (snapshot bảng công theo tháng)
- **Bảng phạt:** bảng Postgres riêng `attendance_penalties` (nhập tay theo ngày/nhân sự) — migration `20260911180000_attendance_penalties_table.sql`
- **KPI:** `kpiTemplates`, `employeeKPIs`, `kpiConversions`, `kpiResults`
- **Giao việc:** `tasks`, `taskLogs`
- **Tuyển dụng:** `recruitmentPlans`, `candidates`, `candidateStatusLogs`
- **Năng lực / đào tạo:** `competencyFramework`, `employee_competency_assessment`, `trainings`, `trainingParticipants`, `trainingResults`
- **Phê duyệt:** `approvalRequests`

App vẫn gọi `fbGet` / `fbPush`… nhưng **đã trỏ sang Supabase** (`src/services/firebase.js`).

### Bật Bảng phép trên database đang dùng

Chạy riêng [`migrations/20260924100000_employee_leave_settings.sql`](./migrations/20260924100000_employee_leave_settings.sql) trong Supabase SQL Editor sau các migration xác thực nhân sự. Migration chỉ tạo bảng phép, hàm kiểm tra công ty và chính sách truy cập; không sửa dữ liệu nhân sự hoặc chấm công.

Để bật trang **Ngày nghỉ phép**, chạy thêm [`migrations/20260924143000_employee_leave_days.sql`](./migrations/20260924143000_employee_leave_days.sql). Bảng này lưu tên từ hồ sơ đăng nhập và ngày nghỉ, không sửa đơn duyệt phép hoặc chấm công.

Chạy tiếp [`migrations/20260924160000_employee_leave_day_reason.sql`](./migrations/20260924160000_employee_leave_day_reason.sql) để lưu lý do nghỉ phép cho bản ghi mới. Ngày nghỉ đã có vẫn được giữ nguyên.

Chạy [`migrations/20261003120000_employee_leave_day_approval.sql`](./migrations/20261003120000_employee_leave_day_approval.sql) để bật trạng thái chờ duyệt và quyền HR/admin duyệt ngày nghỉ. Các bản ghi đã tồn tại được giữ ở trạng thái đã duyệt; yêu cầu mới mặc định chờ duyệt.

Chạy [`migrations/20261004050000_employee_leave_days_grants.sql`](./migrations/20261004050000_employee_leave_days_grants.sql) nếu API báo `permission denied for table employee_leave_days`. File này cấp quyền cho cả đăng nhập Supabase Auth và đăng nhập tài khoản (role `anon`).

Chạy [`migrations/20261004051000_hr_records_anon_access.sql`](./migrations/20261004051000_hr_records_anon_access.sql) nếu API báo `permission denied for table hr_records` hoặc `permission denied for function get_online_attendance_today`.

Chạy [`migrations/20261004060000_approvals_full_access.sql`](./migrations/20261004060000_approvals_full_access.sql) nếu trang Đề xuất báo `permission denied for table users`. File này mở quyền đọc nhân sự và các hàm gửi/duyệt đề xuất.

Chạy [`migrations/20261004073000_team_leader_account_login.sql`](./migrations/20261004073000_team_leader_account_login.sql) nếu `my_team_leader` trả 400 khi đăng nhập bằng tài khoản.

Chạy [`migrations/20261004080000_users_team.sql`](./migrations/20261004080000_users_team.sql) để lưu mục Team trên hồ sơ nhân sự.

Chạy [`migrations/20261004081000_attendance_shift_for_profile.sql`](./migrations/20261004081000_attendance_shift_for_profile.sql) nếu Chấm công online báo `function public.attendance_shift_for_profile(users, jsonb) does not exist`.

Chạy [`migrations/20261004082000_team_leader_title_match.sql`](./migrations/20261004082000_team_leader_title_match.sql) để lưu mục Leader trên hồ sơ và để đề xuất tìm đúng người duyệt.

Chạy [`migrations/20261003130000_approval_monthly_leave_limit.sql`](./migrations/20261003130000_approval_monthly_leave_limit.sql) để hiển thị số lượt sử dụng phép năm trong tháng và giới hạn tối đa 2 lần/tháng cho đề xuất nghỉ phép.

Chạy [`migrations/20261104100000_attendance_punch_corrections.sql`](./migrations/20261104100000_attendance_punch_corrections.sql) để bật yêu cầu điều chỉnh giờ vào/ra: nhân viên gửi yêu cầu từ **Bảng công cá nhân**, HR/quản lý duyệt tại **Duyệt điều chỉnh công**. Giờ chấm công chỉ được cập nhật sau khi duyệt.

Chạy [`migrations/20261104120000_multiple_daily_attendance.sql`](./migrations/20261104120000_multiple_daily_attendance.sql) sau [`migrations/20261102100000_employee_shift_registrations.sql`](./migrations/20261102100000_employee_shift_registrations.sql) để cho phép đăng ký nhiều ca/ngày và chấm nhiều cặp vào/ra, bao gồm ca qua đêm.

Sau đó chạy [`migrations/20261104130000_multi_punch_correction_support.sql`](./migrations/20261104130000_multi_punch_correction_support.sql) để đồng bộ giờ đã được HR duyệt sửa vào cặp chấm công tương ứng.

Chạy tiếp [`migrations/20261104140000_online_attendance_account_login.sql`](./migrations/20261104140000_online_attendance_account_login.sql) để chấm công online hoạt động với tài khoản đăng nhập nội bộ và liên kết bản ghi với hồ sơ nhân viên. Sau đó chạy [`migrations/20261104150000_attendance_pair_corrections.sql`](./migrations/20261104150000_attendance_pair_corrections.sql) để sửa đúng từng lượt chấm trong ca sau khi HR duyệt.

Chạy [`migrations/20261104160000_admin_assign_employee_shifts.sql`](./migrations/20261104160000_admin_assign_employee_shifts.sql) để admin gán một hoặc nhiều ca trực tiếp cho nhân viên trên trang **Đăng ký ca**; ca được duyệt ngay.

## Tài khoản mặc định
- Email: `admin@company.local`
- Password: `123456`
- Role: `admin`

## Kiểm tra

```sql
select id, email, name, role from public.users;
select public.check_credentials('admin@company.local', '123456');
select collection, count(*) from public.hr_records group by 1 order by 1;
```

## Lưu ý
- **Không cần Firebase** cho HR nữa (sau khi chạy SQL + cấu hình `.env` Supabase).
- Có thể chạy lại file SQL nhiều lần (idempotent).
- Dữ liệu cũ trên Firebase **không tự chuyển** — chỉ DB mới trống; nhập lại hoặc import sau.
