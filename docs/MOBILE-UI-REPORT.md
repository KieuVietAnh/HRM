# HrmSpeeGo — báo cáo giao diện mobile

## Phạm vi

Áp dụng cho ≤768px, lấy `/employees` hiện tại làm chuẩn. Không thiết kế lại trang chính `/employees`. Giữ màu SpeeGo, icon/logo, trạng thái semantic và các handler đang có. Không đổi API, database, auth, routing, quyền truy cập hay cách tính công/phép/phạt. Không commit, không push.

## Màn hình đã áp dụng

| Route / màn | Thay đổi |
| --- | --- |
| `/cham-cong-online` | Header, đồng hồ, card check-in/out, khối xác thực, lịch sử dạng card có nhãn. Kiểm tra chưa vào / đã vào / hoàn thành. |
| `/bang-cong` | Giữ day cards hiện có; mở rộng đúng đến 768px, chỉnh thông tin cá nhân và stats. |
| `/bang-cong-preview` | Header/bộ chọn tháng gọn; thao tác phụ trong menu; giữ summary cards và handler. Polish import/reset, chi tiết ngày, nhật ký Excel và pagination hiện có. |
| `/bang-phat` | Giữ card editable và tính tiền hiện có; đồng bộ header, input, khoảng cách, nút. |
| `/approvals` | Gửi đến, gửi đi, quản trị, mẫu yêu cầu, thống kê, tạo yêu cầu, tạo mẫu, chi tiết. Đồng bộ header, card, search/tab, form, action bar, picker, dialog từ chối và thống kê chi tiết. |
| `/bang-phep` | Mỗi nhân viên một card: mã/tên, thâm niên, tổng phép và 12 tháng. Search giữ nguyên. |
| `/ngay-nghi-phep` | Card ngày nghỉ thay bảng mobile; search và form thêm mới giữ nguyên. |
| `/holiday-settings` | Bốn tab ngày lễ, ca, phạt, phép; form một cột ở mobile, card gọn, nhãn nội dung/mức phạt, phân bổ phép 2 cột. |
| `/employees` | Trang chính giữ nguyên; polish form thông tin/giấy tờ, xem hồ sơ và lịch sử biến động/summary. Pagination 10 người đã có được giữ nguyên. |
| `/login`, `/employee-login` | Card/form mobile, giữ logo; input 16px và nút hiện/ẩn mật khẩu đủ touch target. Không đổi đăng nhập. |
| `/dashboard`, `/recruitment`, `/salary`, `/competency`, `/kpi`, `/grading/:employeeId?`, `/tasks` | Router hiện chỉ trỏ đến màn Demo dùng chung: chỉ đồng bộ container/card mobile. Không kích hoạt các feature legacy chưa có trong router. |
| `/`, `/attendance`, `/honor` | Giữ nguyên redirect; không cần sửa. |

Shell/header/drawer và truy cập nhanh được đồng bộ qua CSS. Sửa biên 768px nơi CSS cũ còn hiển thị sidebar desktop. Các điều kiện role/quyền và link vẫn dùng code cũ.

## File thay đổi trong vòng này

- `src/mobile.css`: stylesheet mobile chung; các rule giao diện nằm trong `@media (max-width: 768px)`. Rule ngoài media duy nhất ẩn nhãn mobile trên desktop.
- `src/main.jsx`: import stylesheet.
- `src/components/MobileActions.jsx`: gom button hiện có trên mobile, có aria-expanded và Escape; desktop trả lại nguyên children.
- `src/pages/AttendancePreview.jsx`: dùng wrapper thao tác và thêm data-label cho nhật ký Excel.
- `src/pages/OnlineAttendance.jsx`, `src/pages/LeaveBoard.jsx`, `src/pages/LeaveDays.jsx`, `src/pages/Approvals.jsx`: thêm data-label để render card bằng CSS, giữ nguyên giá trị/handler.
- `src/pages/HolidaySettings.jsx`: nhãn liên kết với input; nhãn chỉ hiển thị mobile, không đổi xử lý.
- `docs/MOBILE-UI-AUDIT.md`, `docs/MOBILE-UI-REPORT.md`: audit, kế hoạch và báo cáo.

Các thay đổi đã có trước vòng này trong `EmployeeDirectory.jsx`, `index.css` và font Inter được giữ lại. Không sửa chúng trong vòng triển khai toàn hệ thống này. Không thêm dependency hay framework.

## Thành phần và bảng

Bộ style dùng chung gồm button, input/filter, card/list, badge và dialog, lấy spacing/radius/typography từ `/employees`. Input nhập liệu có font 16px, control thường 40–44px, card radius 12px và shadow nhẹ.

Chuyển sang card: lịch sử chấm công online, bảng phép, ngày nghỉ, nhật ký Excel và thống kê chi tiết đề xuất. Tái sử dụng card đã có: nhân viên, bảng công tổng hợp, bảng công cá nhân, bảng phạt và thống kê đề xuất.

Ma trận công theo ngày và bảng so sánh tuần vẫn cuộn ngang trong vùng riêng, không làm trang cuộn ngang. Không tính lại dữ liệu hoặc tạo thêm API/pagination trùng lặp. Nhật ký Excel tiếp tục dùng pagination cũ; pagination nhân viên tiếp tục 10 người/trang, sau search/filter và reset trang khi bộ lọc thay đổi.

## Kiểm tra

- Responsive: 375, 390, 430, 768 và desktop 1366px.
- Screenshot trước/sau 390px và desktop; ảnh sau cho toàn bộ route/subview được kiểm tra, có gallery side-by-side với `/employees`.
- Flow: drawer mở/đóng bằng Escape; thêm/xem nhân viên và giấy tờ; pagination/search; lịch sử/summary; import/reset bảng công; chi tiết ngày; ma trận/nhật ký Excel; thêm dòng phạt; search nghỉ phép/bảng phép; picker người theo dõi; dialog từ chối/thống kê; phân bổ phép; font input login.
- UI QA dùng Playwright + dữ liệu giả lập tại browser. RPC chỉ đọc được giả lập; mọi mutation bị chặn. Không kiểm thử ghi database thật, đăng nhập thật hoặc camera/GPS trên thiết bị thật.
- Source tests: **179 total — 170 pass, 9 skip, 0 fail**. Các skip phụ thuộc workbook ngoài fixture sẵn có. Dự án không khai báo `npm test`; đã chạy toàn bộ `src/**/*.test.mjs`.
- Production build: thành công. Còn warning Vite CJS, xlsx static/dynamic import và bundle lớn sẵn có; không mở rộng phạm vi để sửa chúng.
- `git diff --check`: pass.

Kết quả vòng cuối: **28 route/subview × 5 viewport = 140 checks**, không overflow ngoài ý muốn, không lỗi JavaScript. **33 flow checks** ở 375/390/768px đều pass. Hai trạng thái chấm công bổ sung có thêm 10 checks. Ảnh `/employees` 390px khớp hoàn toàn baseline. Desktop 1366px có **26/28 ảnh khớp byte-for-byte**; hai ảnh khác chỉ ở dấu hai chấm animation của đồng hồ và 32×5 pixel raster avatar sidebar. Không có thay đổi desktop layout trong ảnh đối chiếu. Build cuối thành công; source tests cuối vẫn 170 pass / 9 skip / 0 fail.

## Artifacts và giới hạn

Local: `http://127.0.0.1:5177/`.

Ảnh và dữ liệu QA: `node_modules/.cache/system-mobile/`. `review.html` có chọn route và viewport để so trước/sau với reference. `after/qa.json` ghi kết quả responsive; `flows/qa.json` ghi kết quả tương tác. Các script QA nằm trong cache, không phải code sản phẩm.

Không có regression desktop về layout/hành vi trong những màn được kiểm tra. So ảnh có thể khác ở animation dấu hai chấm đồng hồ và vài pixel raster của avatar; chúng không phải thay đổi desktop CSS. Các sai khác do fixture số dư phép đã được đối chiếu riêng. Trang chính `/employees` được so ảnh với baseline, không redesign.

Remaining intentional differences: nội dung/semantic badge của từng nghiệp vụ giữ riêng; ma trận ngày/bảng tuần giữ dạng so sánh nhiều cột; các route Demo vẫn là Demo. QA browser với fixture không thay thế kiểm tra trên thiết bị iOS/Android thật.

## Vòng kiểm tra bổ sung

Kiểm tra trạng thái không có dữ liệu và lỗi mạng trên 7 màn nghiệp vụ ở 5 viewport: thêm **70 checks**, không lỗi JavaScript hoặc overflow. Làm gọn khối bảng công chưa có dữ liệu và card thông báo tải/lỗi của bảng công/bảng phạt trong `src/mobile.css`, chỉ ≤768px. Chạy lại 10 checks dữ liệu thường của hai màn này; desktop vẫn khớp baseline. Build thành công (11.52s). Không có thay đổi logic nên không chạy lại bộ test nghiệp vụ đã pass. Screenshot bổ sung tại `states-empty/`, `states-error/` trong thư mục QA. Không commit/push.
