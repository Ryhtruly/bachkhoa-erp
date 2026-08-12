# Log — 12/08/2026

## Đã triển khai

- Hợp đồng: mã tăng dần toàn cục (tối thiểu ba chữ số) và tự điền trên giao diện.
- Hồ sơ/địa chỉ: chọn tỉnh-phường cho form hợp đồng; hồ sơ đã hoàn thành không còn chỉnh sửa được.
- Workflow: Việt hoá `Kết quả xử lý`, thay thông báo kích hoạt bằng modal, bổ sung mốc thực tế trên timeline và tránh thẻ timetable chồng ngang.
- File và avatar: key minh chứng theo hợp đồng/dịch vụ/node, xoá bù object mới khi ghi ứng dụng lỗi, avatar lỗi hiển thị initials.
- Phân quyền: evaluator normalized chạy shadow, không thay thế quyết định legacy; báo giá yêu cầu đăng nhập.
- Lương nhân viên: payroll fallback từ mức lương theo kỳ sang `employees.base_salary`, không hiển thị 0 đồng khi mức lương hiện hữu.

## Ràng buộc đã giữ

- Không migration, không sửa schema, không sửa dữ liệu DB.
- Không sửa/xoá/re-upload dữ liệu MinIO hoặc Redis.
- Không đụng FIX-14.

## Kiểm tra đã chạy

- Backend focused tests: 30 passed; bao gồm regression payroll.
- Frontend: 15 test files / 22 tests passed và production build passed; lint còn các warning tồn tại từ trước ở module finance.
