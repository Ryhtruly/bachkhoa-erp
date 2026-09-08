# K06, tủ hồ sơ và điều hướng duyệt từ chuông

Ngày: 2026-09-07

## 1. Mục tiêu

Chuẩn hóa một luồng duy nhất từ lúc nhân viên nộp tài liệu đến lúc Giám đốc duyệt,
đồng thời bảo đảm tủ hồ sơ ở mọi màn hình cùng phản ánh đúng dữ liệu của từng quy
trình/hạng mục.

Thay đổi gồm bốn phần liên thông:

1. Cổng công nợ riêng của Node K06.
2. Tủ hồ sơ dùng chung theo Node và loại giấy.
3. Thông báo nghiệm thu/duyệt nợ có deep-link tới đúng vị trí xử lý.
4. Giảm thời gian chờ sau khi upload tài liệu.

## 2. Nguyên tắc nghiệp vụ đã chốt

### 2.1. K06 và công nợ

- Nhân viên vẫn được xem checklist, thêm loại giấy, upload, gỡ và thay tài liệu
  trong K06 khi hợp đồng còn nợ.
- Công nợ chỉ khóa nút **Nộp nghiệm thu**, không khóa khu vực tài liệu.
- Nút **Xin duyệt nợ** nằm cạnh **Nhờ hỗ trợ** ở footer Workspace K06.
- Bấm **Xin duyệt nợ** mở modal. Lý do là trường bắt buộc. Các dữ kiện cam kết
  đang có trong hệ thống được giữ để phục vụ kiểm toán.
- Trong lúc yêu cầu đang chờ, nút đổi thành **Chờ duyệt nợ** và không gửi trùng.
- Nút **Nộp nghiệm thu** mở khi một trong hai điều kiện đúng:
  1. Tổng tiền đã được kế toán xác nhận thu đủ 100%; hoặc
  2. Yêu cầu nợ của đúng task node K06 đã được Giám đốc duyệt.
- Duyệt nợ chỉ mở cổng nghiệp vụ cho đúng Node K06, không đánh dấu hợp đồng đã
  thanh toán và không xóa số nợ thực tế.
- Khi cổng mở, K06 nộp nghiệm thu và được duyệt theo đúng cơ chế loại giấy của
  các Node khác.

### 2.2. Vị trí duyệt nợ của Giám đốc

Trong sidebar thiết lập K06, thứ tự là:

1. Thanh tiến độ công nợ, ví dụ `0 / 10.000.000 VND`.
2. Khung yêu cầu duyệt nợ đang chờ.
3. Hàng **Nhân sự** và các trường cấu hình Node còn lại.

Khung yêu cầu hiển thị người đề nghị, số nợ tại thời điểm đề nghị, lý do, dữ kiện
cam kết và hai hành động **Không duyệt** / **Duyệt cho nợ**. Từ chối phải có lý
do. Sau khi xử lý, khung biến mất khỏi trạng thái chờ.

### 2.3. Tủ hồ sơ của quy trình

Tủ hồ sơ không phải tab **Mẫu giấy tờ** và không dùng danh mục mẫu để tự sinh
giấy bắt buộc.

- **Mẫu giấy tờ** chỉ là danh mục gợi ý theo combo Gói + Hạng mục + Mã Node khi
  Giám đốc hoặc nhân viên thêm loại giấy vào checklist.
- **Tủ hồ sơ** thuộc riêng một service line/quy trình của hợp đồng.
- Cấu trúc hiển thị của tủ là:

```text
Tên/Mã Node
├── Tên loại giấy                         N file
│   ├── File đã được duyệt Đạt
│   └── File đã được duyệt Đạt
└── Tên loại giấy chưa có file đạt        0 file
```

- Không hiển thị tầng checklist trong tủ.
- Tên loại giấy lấy từ loại giấy đã được gán vào checklist runtime của chính quy
  trình đó.
- Tên loại giấy vẫn hiện khi chưa có file đạt.
- Chỉ file thuộc phiên bản hiện hành và đã được Giám đốc duyệt `Đạt` mới xuất
  hiện dưới loại giấy.
- File đang chờ duyệt, bị từ chối, đã gỡ hoặc thuộc quy trình khác không được
  hiện trong tủ.
- Bỏ khối file phẳng **Tệp đã nộp ở các bước trước** và UI legacy báo thiếu giấy,
  chia nhóm nguồn, xin miễn giấy trong ngữ cảnh tủ.

Một component đọc cùng một response `Node -> document types -> approved files`
được dùng ở bốn vị trí:

1. Tủ trong Workspace Node của nhân viên.
2. Tủ bên phải màn danh sách hợp đồng.
3. Tab **Hồ sơ đo vẽ** trong chi tiết hợp đồng, lọc đúng service line đo vẽ.
4. Tab **Hồ sơ pháp lý** trong chi tiết hợp đồng, lọc đúng service line pháp lý.

Nếu một hợp đồng có nhiều service line, mỗi tab chỉ render tủ của service line
thuộc tab đó; dữ liệu không được trộn giữa đo vẽ và pháp lý.

## 3. Kiến trúc lựa chọn

### Phương án A — component và deep-link dùng chung (chọn)

- Dùng `checklist_cabinet_by_node(service_line_id)` làm read model chuẩn của tủ.
- Tách phần render tủ thành component chỉ đọc, nhận danh sách Node/loại giấy/file.
- Mọi màn hình truyền đúng `service_line_id`, không tự ghép dữ liệu từ template.
- Notification trả metadata định danh đích; frontend điều hướng bằng ID rồi mở
  và focus đúng vùng xử lý.

Ưu điểm: một nguồn dữ liệu, không lệch giữa bốn màn, deep-link ổn định khi đổi
tên. Nhược điểm: cần nối lại một số màn legacy.

### Phương án B — sửa riêng từng màn

Nhanh hơn lúc đầu nhưng tạo bốn cách nhóm giấy và nhiều API refresh khác nhau.
Loại bỏ vì đây chính là nguyên nhân giao diện hiện tại nói khác nhau.

### Phương án C — suy đoán đích thông báo từ label/nội dung

Không cần đổi contract notification nhưng dễ mở sai Node khi trùng tên hoặc nội
dung thay đổi. Loại bỏ.

## 4. Notification và deep-link

Chuông chỉ hiển thị việc còn cần người đang đăng nhập xử lý.

### 4.1. Nghiệm thu loại giấy

Khi nhân viên nộp nghiệm thu, Giám đốc nhận item có:

```json
{
  "type": "checklist_review",
  "contract_id": "...",
  "service_line_id": "...",
  "task_node_id": "...",
  "node_key": "...",
  "target_type": "checklist_review",
  "target_id": "<checklist_result_id>"
}
```

Bấm item thực hiện tuần tự: mở Contracts, mở đúng hợp đồng và service line, chọn
đúng Node, mở Dropup **Chờ duyệt**, cuộn/focus đúng checklist hoặc loại giấy đang
chờ. Không tìm đích bằng chuỗi tên.

### 4.2. Yêu cầu duyệt nợ

Khi nhân viên gửi yêu cầu nợ, Giám đốc nhận item tương tự với
`target_type = debt_review` và `target_id = request_id`. Bấm item mở đúng K06,
cuộn/focus khung duyệt nợ nằm giữa thanh công nợ và hàng Nhân sự.

Item tự biến mất khỏi chuông khi acceptance hoặc debt request không còn trạng
thái `pending`. Realtime hiện có tiếp tục kích hoạt nạp lại summary; polling chỉ
là fallback.

## 5. API và bảo vệ phía server

- Tái sử dụng API debt request/review và bảng `handover_debt_requests` hiện có.
- Endpoint nộp nghiệm thu K06 tiếp tục kiểm tra `debt.gate_open` ở server; UI
  disabled không phải hàng rào bảo mật duy nhất.
- Các endpoint thêm loại giấy/upload/gỡ file không dùng cổng công nợ để khóa K06.
  Chúng chỉ kiểm tra phân công, trạng thái Node và quyền tài liệu thông thường.
- Response tủ được scope bắt buộc bằng `service_line_id`; server chỉ trả file đã
  đạt trong `files`, nhưng vẫn trả loại giấy với `file_count = 0`.
- Notification summary bổ sung ID đích và không trả item đã xử lý.

## 6. Tối ưu upload

Mục tiêu là giảm thời gian người dùng chờ mà không báo thành công giả:

- Một thao tác chọn nhiều file dùng một request multipart hiện có.
- Không gọi đồng thời nhiều lượt refresh toàn Workspace sau cùng một upload.
- Sau response upload thành công, cập nhật cụm loại giấy từ response hoặc thực
  hiện đúng một lần revalidation có scope; các phần không liên quan không nạp lại.
- Cổng nghiệm thu được nạp lại một lần sau khi dữ liệu file đã thành công.
- Có trạng thái tiến trình tại đúng loại giấy đang upload; nút khác không bị khóa
  toàn màn.
- Chỉ hiện thành công khi storage và transaction DB đã hoàn tất. Lỗi từng file
  phải chỉ rõ tên file thất bại.

## 7. UI

- Giữ mật độ giao diện hiện tại, không thêm panel cao chiếm chỗ thường trực.
- Tủ: hàng Node là accordion; hàng loại giấy có badge số file nhỏ; click tên loại
  giấy xổ file ngay bên dưới.
- Loại giấy `0 file` vẫn có mặt nhưng không có vùng file rỗng lớn.
- Footer K06 chia hai nhóm: trái gồm **Nhờ hỗ trợ** và **Xin duyệt nợ**; phải là
  **Nộp nghiệm thu**.
- Khung duyệt nợ chỉ render khi pending; khi mở từ chuông có focus ring ngắn để
  Giám đốc nhận ra đúng vị trí.

## 8. Kiểm thử chấp nhận

### Backend

- K06 còn nợ, chưa có override: upload tài liệu được; nộp nghiệm thu bị chặn.
- K06 đủ 100%: nộp nghiệm thu được.
- K06 còn nợ nhưng request đúng Node đã approved: nộp nghiệm thu được, nợ thực
  vẫn giữ nguyên.
- Override của Node khác không mở K06 hiện tại.
- Cabinet chỉ trả file đã approved, vẫn trả loại giấy 0 file và không trộn service
  line.
- Notification có đủ ID đích và biến mất khi việc đã xử lý.

### Frontend

- Footer K06 đúng vị trí ba nút và trạng thái chờ duyệt nợ.
- Chỉ nút nộp bị khóa bởi công nợ; upload không bị disabled vì công nợ.
- Khung duyệt nợ nằm đúng giữa thanh tiền và Nhân sự.
- Cả bốn nơi render cùng cấu trúc tủ, không còn UI sổ giấy legacy trong hai tab
  hồ sơ.
- Click notification mở/focus đúng checklist review hoặc debt review.
- Một upload thành công không tạo nhiều lượt refresh Workspace.

## 9. Ngoài phạm vi

- Không thay đổi cách cấu hình tab Mẫu giấy tờ.
- Không coi duyệt nợ là thanh toán hoặc xóa công nợ.
- Không duyệt trạng thái ở cấp file; Giám đốc tiếp tục duyệt ở cấp loại giấy.
- Không thay đổi cấu trúc tiền khoán ngoài việc K06 chỉ hoàn thành sau nghiệm thu
  hợp lệ.
