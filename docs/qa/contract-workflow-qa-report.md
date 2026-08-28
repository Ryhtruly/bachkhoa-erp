# QA report: Contract workflow

- Ngày kiểm thử: 2026-08-27
- URL: `http://127.0.0.1:3000/`
- Phạm vi: admin và nhân viên; UI, console, network request, workflow activation.
- Tài khoản đã kiểm tra: `admin`, `nguyenvana`.
- Trạng thái: đang kiểm thử tiếp; shell runner hiện bị `helper_unknown_error: setup refresh had errors`.
- Không sửa code hoặc database trong lượt QA này. Các thao tác trên UI dùng dữ liệu test hiện có.

## Kết quả đã xác nhận

| ID | Mức độ | Vai trò / luồng | Kết quả | Bằng chứng |
|---|---|---|---|---|
| BUG-001 | Cao | Admin mở workspace quy trình hợp đồng | Workspace vẫn hiển thị nhưng realtime subscription lỗi vì `getAccessToken is not defined`. | Console: `ContractWorkspace.jsx:335`; lỗi lặp lại khi mở/kích hoạt workflow. |
| BUG-002 | Trung bình | Admin kích hoạt workflow | Hệ thống cho kích hoạt sau cảnh báo node `K02` chưa gắn hạng mục khoán; API activation trả `200`, workflow chuyển `Đang vận hành`. Cần xác nhận chính sách: nếu thiếu mapping thì có nên cho kích hoạt hay phải chặn. | Modal cảnh báo hiển thị rõ; POST `/api/contracts/workflow/.../activate => 200`. |
| BUG-003 | Trung bình | Admin workflow / nhân viên Đo Vẽ | Workflow active nhưng checklist của `K02` hiển thị `Đã phân bổ 0 / Chưa phân bổ 31`. Nhân viên mở `K01` thấy thiếu `11/11` giấy bắt buộc và không thể nghiệm thu. Việc kích hoạt chưa có blocking validation cho trạng thái checklist này. | Admin node detail; employee task detail HĐ `002/BK-2026`. |
| BUG-004 | Trung bình | Nhân viên Đo Vẽ mở task | Màn hình task Đo Vẽ gọi API không thuộc phase/role: legal dossier/submission trả `403`, handover trả `400`, làm phát sinh console errors và request thừa. | Network: `GET /api/legal-dossiers/by-task-node/... => 403`, `GET /api/legal-submissions/by-task-node/... => 403`, `GET /api/handover/... => 400`. |
| BUG-005 | Thấp | Nhân viên bấm `Nhận trọn` khi đang có việc | UI có thông báo nghiệp vụ đúng, nhưng request từ chối `422` bị ghi thành console error. | POST `/api/employee-portal/tasks/.../claim => 422`; alert: yêu cầu nộp công việc hiện tại trước. |
| BUG-006 | Thấp | Nhân viên dashboard | Request avatar từ `localhost:9000` bị trình duyệt chặn bởi ORB/CORS. | Console: `ERR_BLOCKED_BY_ORB`. |

## PASS đã ghi nhận

- Admin đăng nhập thành công và nhìn thấy đầy đủ các nhóm module được cấp quyền.
- Nhân viên `nguyenvana` chỉ nhìn thấy `Lịch trình`, `Hồ Sơ Đo Vẽ`, `Lương`, đúng phạm vi tài khoản đã cung cấp.
- Admin mở workflow hợp đồng, xem node, mở modal cảnh báo và kích hoạt thành công.
- Sau kích hoạt, trạng thái workflow chuyển sang `Đang vận hành`, tiến độ hiển thị `0/3 bước`.
- Các API document-register/source-document chính của task Đo Vẽ trả `200` và giao diện hiển thị được trạng thái hồ sơ.

## Chưa hoàn tất

- Chưa chạy xong các luồng `tuongvy`, `myhang`, các tab Pháp lý/Lịch trình/Lương của nhân viên và các module còn lại của admin.
- Chưa đối chiếu log Docker và object list MinIO ở cuối lượt kiểm thử.
- Chưa kết luận cuối cùng về việc BUG-002/BUG-003 là lỗi sản phẩm hay policy cấu hình; cần kiểm tra thêm luồng Pháp lý và cấu hình checklist.

