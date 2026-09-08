/**
 * Sổ tài liệu V2 — trợ giúp dùng chung cho phần giao diện.
 *
 * Khi CSDL chưa chạy đợt migration EXPAND, máy chủ trả 503 cho mọi thao tác V2.
 * Đó là trạng thái BIẾT TRƯỚC, không phải sự cố — nên người dùng phải đọc được
 * một câu tiếng Việt tử tế thay vì "Internal Server Error" hay mã lỗi.
 *
 * Phần nghiệp vụ cũ (V1) không bị ảnh hưởng và vẫn dùng bình thường.
 */

export const THONG_BAO_CHUA_KICH_HOAT =
  'Tính năng sổ tài liệu V2 chưa được kích hoạt. Vui lòng liên hệ quản trị.'

/** Lỗi này có phải do schema V2 chưa sẵn sàng không. */
export const laLoiChuaKichHoat = (error) => Number(error?.status) === 503

/**
 * Câu chữ hiển thị cho người dùng.
 *
 * 503 → câu cố định ở trên. Lỗi khác → giữ nguyên thông điệp của máy chủ, vì đó
 * mới là thứ giúp người dùng biết mình làm sai chỗ nào; nuốt hết thành một câu
 * chung là lấy mất manh mối của họ.
 */
export const loiHienThi = (error, macDinh = 'Thao tác không thành công.') => {
  if (laLoiChuaKichHoat(error)) return THONG_BAO_CHUA_KICH_HOAT
  return error?.message || macDinh
}
