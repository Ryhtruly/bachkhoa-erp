# Tạo và mở Word hợp đồng không lưu DOCX trên server

## Mục tiêu

Khi người dùng tạo hợp đồng, hệ thống phải cho họ chọn vị trí lưu tệp Word trên máy. Backend không được ghi DOCX vào `static/generated_docs` hoặc MinIO. Nút **Mở tài liệu** vẫn phải hoạt động và phải tạo lại đúng nội dung/bố cục của bản đã phát hành lúc tạo hợp đồng.

## Quyết định

- Không dùng MinIO trong đợt này. MinIO private là lựa chọn có thể dùng trong tương lai nếu cần lưu bản DOCX bền vững.
- Không lưu DOCX đã tạo trên filesystem hay object storage.
- Dùng `contract_generated_documents` để lưu snapshot dữ liệu render, tên tệp, thời điểm phát hành và nhận diện phiên bản template.
- Mỗi template Word phải bất biến theo phiên bản. Template mới có tệp/định danh mới; không được ghi đè template đã từng được dùng để phát hành hợp đồng.

## Luồng tạo hợp đồng

1. `POST /api/contracts/generate` kiểm tra quyền `contract:create`, chuẩn hóa dữ liệu và tạo hợp đồng như hiện nay.
2. Trong cùng giao dịch, backend tạo bản ghi `ContractGeneratedDocument` ở trạng thái `generated`, chứa toàn bộ dữ liệu thay thế placeholder, filename đề xuất và mã phiên bản template.
3. Backend không gọi cơ chế ghi `static/generated_docs`; DOCX chỉ được render trong bộ nhớ khi endpoint tài liệu được gọi.
4. Frontend nhận định danh hợp đồng/tài liệu, sau đó gọi endpoint nội dung tài liệu trong user gesture để lấy Blob.
5. Trên Chrome/Edge (và trình duyệt hỗ trợ File System Access API), frontend gọi `showSaveFilePicker` để người dùng chọn nơi lưu.
6. Trình duyệt không hỗ trợ API này hiển thị thông báo hướng dẫn dùng Chrome hoặc Edge. Không dùng fallback `<a download>` vì fallback đó tự tải về thư mục mặc định và vi phạm yêu cầu chọn nơi lưu.
7. Việc người dùng hủy hộp chọn file không rollback hợp đồng: hợp đồng và snapshot đã được lưu thành công; chỉ thao tác lưu cục bộ bị hủy.

## Luồng mở tài liệu

1. Nút **Mở tài liệu** gọi endpoint tài liệu theo id hợp đồng/tài liệu.
2. Endpoint yêu cầu quyền `contract:read`, tải snapshot và đúng template phiên bản đã ghi.
3. Backend render DOCX vào bộ nhớ từ snapshot, trả `application/vnd.openxmlformats-officedocument.wordprocessingml.document` với filename đã chốt.
4. Trình duyệt hoặc ứng dụng Word đã cài quyết định cách mở DOCX. Ứng dụng web không hứa hẹn preview DOCX native trong tab.

## Tính bất biến

Nội dung được render lại từ snapshot, không từ các trường hợp đồng hiện hành. Vì vậy việc đổi khách hàng, địa chỉ hay giá trị hợp đồng sau đó không làm thay đổi Word đã phát hành. Bất biến ở đây là nội dung và bố cục; byte ZIP của DOCX có thể khác metadata kỹ thuật khi được render lại.

## Dữ liệu cũ và phạm vi

- Chỉ hợp đồng tạo mới đi theo luồng snapshot trong đợt này.
- Các URL cũ trỏ đến `static/generated_docs` tiếp tục hoạt động để không làm hỏng lịch sử.
- Không tự di chuyển hoặc xóa tệp cũ. Việc di trú sang MinIO hay dọn tệp cũ là một thay đổi riêng, chỉ thực hiện sau khi có yêu cầu rõ ràng và đối soát.

## Xử lý lỗi

- Không tạo được snapshot hay không tìm được template phiên bản: trả lỗi, không đánh dấu hợp đồng có tài liệu.
- Không render được khi mở: trả lỗi rõ ràng, không tạo file rác.
- Không hỗ trợ chọn vị trí lưu: giữ hợp đồng, thông báo giới hạn trình duyệt, không tự download.

## Kiểm thử

- Backend: snapshot được tạo cùng hợp đồng; không ghi vào `static/generated_docs`; endpoint render từ snapshot, kiểm tra quyền đọc và từ chối khi thiếu template/snapshot.
- Frontend: Chrome/Edge gọi picker với filename snapshot; hủy picker chỉ báo hủy; không hỗ trợ picker không tạo thẻ download tự động.
- Hồi quy: nút Mở tài liệu gọi endpoint snapshot mới; liên kết lịch sử vẫn giữ nguyên.
