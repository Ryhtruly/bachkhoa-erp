# Finance UI/UX Upgrade Design

**Date:** 2026-08-22

## Goal

Nâng cấp UI/UX toàn bộ 13 tab của phân hệ “Thu Chi Sổ Quỹ” theo hướng nhất quán, responsive, dễ thao tác và an toàn cho các workflow tài chính.

## Scope

- 13 tab: báo cáo tháng, nhật ký thu chi, quỹ tiền mặt, quỹ ngân hàng, chứng từ in, thu công nợ, công nợ phải thu, đề xuất tạm ứng, quyết toán hoàn ứng, lương khoán nhiệm vụ, bảng giá khoán, lương văn phòng & hoa hồng, thiết lập tài chính.
- UI primitives dùng chung: `Modal`, `FormRow`, `DataTable`, `FilterBar`, `Select`, `DatePicker`.
- Print preview và print CSS của chứng từ, sổ quỹ và bảng lương.

## Non-goals

- Không thay đổi schema, API contract hoặc quy trình phê duyệt backend.
- Không dùng `display: none` để che dữ liệu nghiệp vụ hoặc thay đổi quyền truy cập.
- Không xóa dữ liệu, dependency hay thay đổi Docker trong đợt này.

## Design decisions

1. Sửa các lỗi P0 trước: modal chốt lương, dữ liệu fallback mẫu, trạng thái lỗi API và overflow khi in.
2. Giữ `Select`/`DatePicker` hiện tại làm nền tảng; chỉ bổ sung behavior/accessibility còn thiếu.
3. Bảng dữ liệu giữ khả năng cuộn ngang trên mobile nhưng bổ sung ưu tiên cột, nhãn truy cập và trạng thái rõ ràng.
4. Responsive theo các mốc 1440, 1280, 1024, 768 và 390px.
5. Mọi thay đổi behavior phải có regression test trước khi sửa production code.

## Acceptance criteria

- Không còn dữ liệu nhân viên/hợp đồng mẫu xuất hiện khi API trả rỗng.
- Modal payroll dùng đúng warning, label xác nhận và loading state.
- Các screen chính có loading/error/empty state phân biệt.
- Layout dashboard, cashflow toolbar, modal form và print preview không tạo overflow ngang ngoài chủ đích.
- Full frontend test, lint và production build hoàn tất; cảnh báo có sẵn được ghi nhận riêng.
