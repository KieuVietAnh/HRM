# Lương theo ngày hiệu lực và chốt tháng

## Áp dụng

1. Chạy migration `supabase/migrations/20261109120000_salary_history_and_payroll_lock.sql` bằng luồng migration hiện có hoặc Supabase SQL Editor **trước khi đưa frontend mới lên**.
2. Mức lương hiện có được giữ làm mốc chuyển đổi `legacy`. Mốc này không chứng minh lương thực tế của các tháng trước. HR cần đối chiếu bảng đã thanh toán; có thể nhập bổ sung các mốc cũ trước khi chốt.
3. Sau đó triển khai frontend. Thay đổi này chưa được áp dụng vào database thật trong phiên phát triển.

## Nhập liệu

- Hồ sơ nhân sự → **Mức lương theo ngày hiệu lực**: nhập lương chính thức/tháng, tỷ lệ thử việc và ngày hiệu lực. Có thể xem lại lịch sử ngay trong hồ sơ.
- Ví dụ thử việc 10 ngày: nhập tỷ lệ `80`, chọn ngày hiệu lực là ngày bắt đầu hưởng mức đó, chọn **Ngày làm chính thức** là ngày thứ 11. Hệ thống dùng công thực tế theo ngày ở mỗi giai đoạn; HR quyết định ngày chuyển chính thức.
- Ví dụ tăng lương: nhập mốc `01/09/2026 = 12000000`, rồi `01/10/2026 = 13000000`. Bổ sung mốc cũ không ghi đè mốc mới nhất trên hồ sơ. Có thể điều chỉnh cùng một mốc ngày khi chưa có kỳ chốt liên quan.
- Nhập tiền VNĐ nguyên: `13000000`, `13.000.000`, `13,000,000`. Mức `0` hợp lệ; không dùng `13tr`.
- Excel/CSV thêm hai cột **NGÀY HIỆU LỰC LƯƠNG**, **TỶ LỆ LƯƠNG THỬ VIỆC**. Ngày theo `dd/mm/yyyy` hoặc `yyyy-mm-dd`. CSV giữ nguyên chuỗi ngày để tránh đảo ngày/tháng.
- File thiếu cột lương hoặc ô lương trống sẽ giữ mức lương cũ. File có mức lương thay đổi nhưng không có ngày hiệu lực sẽ áp dụng từ ngày import theo múi giờ Việt Nam. Muốn nhập cho kỳ cũ phải ghi rõ ngày.
- Tỷ lệ thử việc ban đầu là `100%` để không tự giảm lương hồ sơ cũ; HR nhập tỷ lệ thực tế của từng người. Từ ngày chính thức, hưởng `100%`.

## Tính và chốt

- Mở **Bảng công → Bảng lương**. Công chuẩn mặc định `26`, có thể đổi theo tháng trước khi chốt.
- Lương theo công = tổng `mức lương có hiệu lực × tỷ lệ hưởng × công giai đoạn / công chuẩn tháng`. Công nghỉ hưởng lương nằm trong công ngày đã tổng hợp. Tiền được làm tròn VNĐ một lần sau khi cộng các ngày.
- **Lương KPIs = lương theo công × tỷ lệ KPI**. Cột lương đã chuyển từ mức lương tháng trên hồ sơ sang số tính theo công, có chi tiết từng mức và số công để đối chiếu. Chưa bổ sung công thức thực lĩnh, thưởng, BHXH, thuế hay phụ cấp mới.
- Nếu thiếu mức lương cho ngày có công, tổng công lệch chi tiết, công chuẩn không hợp lệ hoặc tải dữ liệu thất bại, hệ thống không cho chốt. Mức `legacy` phải được HR xác nhận đã đối chiếu trước khi chốt.
- Chốt lưu cố định công, tiền lương, KPI, thông tin đang hiển thị, phạt và số phép. Mở lại kỳ đã chốt sẽ dùng bản lưu, không tính lại từ hồ sơ hiện tại.
- Database chặn sửa/xóa bản chốt, chặn sửa trực tiếp lịch sử, chặn mức lương có hiệu lực thuộc hoặc trước kỳ chốt gần nhất. Thay đổi hồ sơ và ghi lịch sử cùng một transaction, bao gồm import. Nếu lịch sử lương đổi trong lúc đang xem, phải tải lại trước khi chốt.
- Không có thao tác mở lại kỳ đã chốt trong thay đổi này. Đối chiếu xong các kỳ cũ trước khi chốt kỳ mới nhất, vì sau đó không thể bổ sung mức lương lùi vào kỳ đã khóa.

## Kiểm chứng

- Test tính lương: tăng lương theo tháng, thay đổi giữa tháng, 10 công thử việc 80%, công lẻ/nghỉ hưởng lương, mức 0 và dữ liệu thiếu.
- Test giao diện: tính hai giai đoạn, bản chốt giữ nguyên sau thay đổi hồ sơ/công, tải lỗi, xác nhận mức cũ và công chuẩn sai.
- Test importer: giữ lương khi CSV không có lương; giữ đúng ngày hiệu lực và tỷ lệ trong CSV mới.
- Test PostgreSQL bằng PGlite tạm: chạy migration thật, ghi lịch sử nguyên tử, bổ sung mốc cũ, điều chỉnh cùng ngày, chặn sửa/xóa/chốt thiếu dữ liệu và phát hiện lịch sử vừa thay đổi. Không ghi vào database thật.

```powershell
node --test src/utils/payrollSalary.test.mjs src/utils/helpers.test.mjs src/components/PayrollSheet.test.mjs src/pages/Employees.test.mjs
node node_modules/vite/bin/vite.js build

# Tùy chọn chạy migration với PostgreSQL nhúng, không thêm dependency ứng dụng:
npm.cmd install --prefix .tmp-payroll-db --no-save --package-lock=false --ignore-scripts @electric-sql/pglite
$env:PGLITE_MODULE_PATH = (Resolve-Path '.tmp-payroll-db/node_modules/@electric-sql/pglite/dist/index.js').Path
node --test supabase/tests/salary_history.test.mjs
```

Toàn bộ test frontend tại thời điểm sửa: **217 test, 204 pass, 4 fail, 9 skip**. Bốn lỗi cũng tái hiện trên code gốc: ba test thiếu workbook mẫu tháng 7/8; một test `daily-detail preview recalculates workdays after matching the employee shift` lệch kết quả tính giờ. Test PostgreSQL riêng: **1 pass**. Build production thành công.
