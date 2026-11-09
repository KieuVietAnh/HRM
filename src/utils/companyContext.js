// HrmSpeeGo là hệ thống đơn công ty. ID này chỉ dùng làm khóa ổn định cho
// state giao diện; các hàm lưu trữ legacy bỏ qua tham số companyId.
export const LEGACY_COMPANY_ID = 'speego-original'

export const getCompanyIdForUser = () => LEGACY_COMPANY_ID

export const getCompanyNameForContext = (company, user) => {
  const candidates = [
    company?.name,
    company?.company_name,
    company?.ten_cong_ty,
    user?.company_name,
    user?.companyName,
    user?.ten_cong_ty,
    user?.tenCongTy,
    user?.company?.name
  ]
  const name = candidates.find(value => String(value || '').trim())
  return String(name || 'SpeeGo Logistics').trim()
}
