# Log — 12/08/2026

## Phạm vi và trạng thái

| FIX | Nội dung | Trạng thái | Ghi chú |
| --- | --- | --- | --- |
| FIX-01 | Tự sinh mã hợp đồng `xxx/BK-năm`, tăng dần toàn cục. | Đã triển khai | Áp dụng cho luồng tạo hợp đồng đang dùng; có test mã tăng dần. |
| FIX-02 | Cập nhật lương không được làm mất liên kết `employees.user_id`, để nhân viên vẫn mở timetable/lương. | Đã triển khai | Luồng cập nhật giữ lại liên kết tài khoản; có regression test. |
| FIX-03 | Chuẩn hoá địa chỉ theo dữ liệu địa điểm có sẵn (tỉnh/phường). | Đã triển khai | Thay ô nhập tự do ở form hợp đồng bằng selector; không tạo cấu trúc DB mới. |
| FIX-04 | Nhân viên nộp minh chứng/checklist không bị kẹt ở popup. | Đã triển khai | Bổ sung xử lý lỗi và hoàn tác object mới khi ghi ứng dụng thất bại; chưa chạy E2E với object thật vì không được thao tác MinIO. |
| FIX-05 | Gắn minh chứng/tài liệu hồ sơ đúng hợp đồng và loại hồ sơ. | Đã triển khai | Key file có ngữ cảnh hợp đồng/dịch vụ/node; không di chuyển hay sửa file có sẵn trên MinIO/Drive. |
| FIX-06 | Hồ sơ pháp lý và khảo sát hoàn thành phải bất biến. | Đã triển khai | Chặn ở backend, không chỉ khoá nút giao diện. |
| FIX-07 | Kiểm tra Redis và chuẩn hoá đường đọc/ghi tối thiểu. | Đã triển khai | Khi cache lỗi/miss, trả dữ liệu DB với nguồn `db-fallback`; không refactor CQRS lớn và không thay cấu hình Redis. |
| FIX-08 | Đổi nhãn `Outcome` sang tiếng Việt trong cấu hình workflow. | Đã triển khai | Chỉ đổi nhãn hiển thị, không đổi enum/API/dữ liệu lưu. |
| FIX-09 | Đổi thông báo kích hoạt workflow sang modal xác nhận. | Đã triển khai | Có xác nhận/hủy, tránh kích hoạt nhầm hoặc gửi lặp. |
| FIX-10 | Rà soát, siết quyền role/resource/action. | Đang hoàn thiện | Permission evaluator chuẩn hoá đã được thêm và chạy shadow cùng logic legacy; **chưa cutover thay thế enforcement legacy** để tránh đổi quyền đột ngột. |
| FIX-11 | Hiển thị Gantt/timeline đúng mốc ready, bắt đầu, từng lần nộp, hoàn tất và hạn node. | Đã triển khai | Timeline dùng các mốc workflow/acceptance có thật, bao gồm retry/submission history khi có. |
| FIX-12 | Các công việc timetable cùng ngày không chồng ngang. | Đã triển khai, chờ nghiệm thu UI | Event trùng/đè thời gian được gộp và xếp dọc; chiều cao group được tăng để đọc thêm thông tin. Có component test, nhưng chưa có ảnh nghiệm thu sau thay đổi kích thước cuối. |
| FIX-13 | Avatar nhân viên truy vấn/hiển thị không ổn định. | Đã triển khai | Chuẩn hoá URL/avatar fallback về initials khi URL không hợp lệ hoặc ảnh lỗi/404. |
| FIX-14 | Kiểm tra end-to-end hai luồng tạo hợp đồng (tự động và thủ công). | Không thực hiện | Có người khác phụ trách theo chỉ đạo; không sửa mã liên quan FIX-14. |

## Các hạng mục chưa hoàn tất / cần nghiệm thu

- **FIX-10:** cần quyết định và kiểm thử ma trận quyền trước khi chuyển enforcement từ legacy sang evaluator chuẩn hoá.
- **FIX-12:** cần người dùng xác nhận trực quan trên timetable thật sau thay đổi card xếp dọc và tăng chiều cao.
- **FIX-04/FIX-05/FIX-07:** logic đã có test đơn vị/focused test; chưa làm E2E trực tiếp với MinIO/Redis đang chạy Docker để tuân thủ ràng buộc không thao tác dữ liệu/dịch vụ.
- **FIX-14:** ngoài phạm vi commit này.

## Ràng buộc đã giữ

- Không migration, không sửa schema, không sửa dữ liệu DB.
- Không sửa/xoá/re-upload dữ liệu MinIO hoặc Redis.
- Không đụng FIX-14.

## Kiểm tra đã chạy

- Backend focused tests: 30 passed; bao gồm regression payroll.
- Frontend: 15 test files / 22 tests passed và production build passed; lint còn các warning tồn tại từ trước ở module finance.

## Task 5 — Atomic bootstrap contract template (19/08/2026)

- Đã thay kiểm tra `HEAD` rồi upload bằng đúng một lệnh `PutObject` có `IfNoneMatch="*"`; object đã có trả `FileExistsError`, lỗi storage khác được ném lại nguyên trạng.
- Giữ private bucket, object key và `ContentType` DOCX. Không thao tác cloud hoặc DB.
- RED: 2 test thất bại trên code cũ vì không gửi conditional create và không ánh xạ conflict. GREEN: `pytest --noconftest -p no:cacheprovider tests/test_bootstrap_contract_template.py -q` → 2 passed.
