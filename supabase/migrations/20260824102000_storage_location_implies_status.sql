-- Nơi lưu ngụ ý trạng thái nào của tờ giấy.
--
-- Giấy "đang ở cơ quan" thì đương nhiên đã nộp; nó không thể vừa nằm ở cơ quan
-- vừa nằm trong tủ công ty. Ghi quan hệ này thành DỮ LIỆU để cảnh báo bất nhất,
-- thay vì dò tên nơi lưu trong code — sếp đổi tên tủ là code hỏng.
--
-- Cố ý KHÔNG tự đổi trạng thái: âm thầm sửa thứ người dùng không bấm là cách
-- nhanh nhất làm họ hết tin vào số liệu. Chỉ nhắc, và cho sửa bằng một cú bấm.
alter table public.document_storage_locations
  add column if not exists implies_status varchar;

alter table public.document_storage_locations
  drop constraint if exists document_storage_locations_implies_status_check;

alter table public.document_storage_locations
  add constraint document_storage_locations_implies_status_check
  check (
    implies_status is null
    or implies_status in ('CHUA_CO', 'DA_NHAN', 'DA_KY', 'DA_SCAN', 'DA_NOP', 'BI_TRA_LAI')
  );

update public.document_storage_locations
set implies_status = 'DA_NOP'
where name = 'Đang ở cơ quan';
