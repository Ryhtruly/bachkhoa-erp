# Thiết kế duyệt từng lượt file và Tủ hồ sơ theo Hợp đồng + Hạng mục

Ngày: 2026-09-05

## Mục tiêu

Mỗi Tủ hồ sơ thuộc duy nhất một `contract_id + service_line_id`. Cấu trúc tủ
được dựng từ các loại giấy đã phân vào checklist runtime của đúng quy trình đó,
gom theo Node → Checklist → Loại giấy.

Loại giấy luôn hiện trong tủ. Chỉ file đã được Giám đốc duyệt đạt mới hiện bên
dưới loại giấy và được mở từ tủ.

## Bất biến nghiệp vụ

- Mỗi loại giấy thuộc đúng một nguồn: `KHACH_HANG`, `CONG_TY`, `CO_QUAN`.
- Một loại giấy nhận nhiều file/ảnh.
- Trạng thái duyệt nằm ở từng file để một loại giấy có thể đồng thời giữ file cũ
  đã đạt và file mới đang chờ duyệt.
- File cũ đã đạt luôn còn trong checklist nhân viên và Tủ hồ sơ.
- File mới của loại giấy đã đạt bắt buộc có lý do bổ sung/thay đổi.
- File mới chỉ vào Tủ hồ sơ sau khi được duyệt đạt.
- Từ chối bắt buộc ghi lý do; file bị từ chối và lý do còn nguyên trong workspace
  để nhân viên upload lại.
- Duyệt/từ chối trên hàng loại giấy chỉ áp dụng cho nhóm file `pending_review`;
  không đổi phán quyết của các file đã đạt từ lượt trước.
- Loại giấy do nhân viên tạo chỉ được học vào Mẫu giấy tờ đúng combo
  `service_package_id + task_type_id + node_code` sau khi loại đó có file đạt.

## Trạng thái

`checklist_result_document_type_files.status` nhận một trong:

- `draft`: nhân viên vừa thêm, chưa nộp;
- `pending_review`: đã nộp, đang chờ Giám đốc đọc;
- `approved`: đạt, được công bố vào Tủ hồ sơ;
- `rejected`: không đạt, kèm `rejection_reason`, không vào tủ.

`checklist_result_document_types.status` là trạng thái của lượt thao tác hiện tại
để tương thích API/UI. Nó không quyết định file nào được công bố; Tủ hồ sơ luôn
lọc theo trạng thái từng file.

## Luồng

1. Nhân viên upload file đầu tiên; file ở `draft`.
2. Nộp nghiệm thu chuyển các file `draft` sang `pending_review`.
3. Giám đốc mở toàn bộ file trên hàng loại giấy và bấm Đạt/Không đạt.
4. Đạt chuyển file đang chờ sang `approved`; Không đạt chuyển sang `rejected` và
   trả node về `rework_required`.
5. Nhân viên thấy file đạt có tích xanh, file sai có lý do và upload file mới.
6. Nếu loại giấy đã có file đạt, upload mới bắt buộc nhập `change_reason`; các
   file đạt cũ không bị hạ trạng thái.

## Tương thích database chưa migrate

Khi hai bảng runtime chưa tồn tại, response nhân viên không được gắn
`document_types: []`. Việc bỏ khóa này khiến UI dùng đúng dữ liệu legacy
`output_documents + review_by_template`, thay vì che mất checklist bị trả về.

## Giao diện

- Workspace nhân viên hiển thị trạng thái và lý do trên từng file.
- Nút upload luôn có cho loại giấy khi node được sửa. Với loại đã có file đạt,
  nút mở một hàng nhập lý do gọn trước khi chọn nhiều file.
- Màn Giám đốc giữ thao tác Đạt/Không đạt ở cấp loại giấy nhưng danh sách file
  cho thấy rõ file cũ đã đạt và file mới đang chờ.
- Tủ hồ sơ luôn hiện tên loại giấy; nút số file chỉ đếm/mở file `approved`.

## Kiểm thử bắt buộc

- DB cũ trả checklist legacy thay vì runtime rỗng.
- Tủ hiện mọi loại giấy nhưng chỉ trả file `approved`.
- Upload vào loại đã có file đạt thiếu lý do bị từ chối.
- Upload hợp lệ không đổi trạng thái file đạt cũ.
- Submit/review chỉ chuyển nhóm file của lượt mới.
- Từ chối trả node về làm lại và giữ đủ file/lý do.
- Hai giao diện tủ dùng cùng response và không lộ file chưa đạt.
