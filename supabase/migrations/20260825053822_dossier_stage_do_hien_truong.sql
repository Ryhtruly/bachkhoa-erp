-- Thêm giai đoạn 'do-hien-truong' cho đầu ra của K02.
--
-- STAGE_BY_NODE_CODE hiện chỉ ánh xạ K03→K06; K02 không có giai đoạn nào. Mà
-- K02 mới là bước sinh ra ảnh hiện trạng, toạ độ GPS, số liệu đo và bản kỹ
-- thuật gốc.
--
-- Nhồi đầu ra K02 vào 'chuan-hoa-ky-thuat' sẽ làm tài liệu THÔ của K02 và tài
-- liệu ĐÃ CHUẨN HOÁ của K03 nằm chung một giai đoạn — đọc lại hồ sơ sáu tháng
-- sau không phân biệt được cái nào là bản gốc, cái nào là bản đã xử lý.
--
--   K02 → do-hien-truong      : ảnh hiện trạng, toạ độ GPS, số liệu đo, bản kỹ thuật gốc
--   K03 → chuan-hoa-ky-thuat  : bản vẽ và tài liệu kỹ thuật đã xử lý, chuẩn hoá

alter table public.dossier_documents
  drop constraint if exists dossier_documents_stage_check;
alter table public.dossier_documents
  add constraint dossier_documents_stage_check
  check (stage in ('ho-so-goc', 'do-hien-truong', 'chuan-hoa-ky-thuat',
                   'soan-ho-so', 'nop-co-quan', 'ket-qua'));
