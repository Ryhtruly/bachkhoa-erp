-- Bổ sung biên nhận cho gói Đo Vẽ, và ghi rõ chỗ khác nhau giữa hai biên nhận.
--
-- ── Vì sao thiếu ────────────────────────────────────────────────────────────
-- Đợt seed đầu cho gói Đo Vẽ một tờ đi RA ở K05a (Phiếu nộp hồ sơ nội nghiệp)
-- mà không có gì NHẬN VỀ. Nộp xong không còn bằng chứng đã nộp: khách hỏi hồ sơ
-- tới đâu thì không có gì đưa ra, và nếu cơ quan làm mất thì cũng không chứng
-- minh được là đã nộp.
--
-- ── Hai biên nhận khác nhau ở đâu ───────────────────────────────────────────
-- Cả K05a lẫn K05b đều nộp ra cơ quan và đều nhận biên nhận. Khác nhau ở việc
-- làm gì với nó SAU ĐÓ:
--
--   K05a (Đo vẽ)   biên nhận chỉ LƯU làm bằng chứng đã nộp. Không mã theo dõi,
--                  không phải cập nhật trạng thái, không có hạn phải chờ.
--   K05b (Pháp lý) trên biên nhận có MÃ SỐ HỒ SƠ. Phải tra trạng thái ở cơ quan
--                  cho tới khi thủ tục hoàn thành.
--
-- Vì thế K05a KHÔNG có "Giấy hẹn trả kết quả" — giấy hẹn là công cụ theo dõi,
-- mà nhánh này không theo dõi. Thêm vào là bịa ra việc cho nhân viên.

-- ── CHẶN CHẠY ĐÈ ────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from public.document_checklist_templates
             where name = 'Biên nhận nộp hồ sơ đo đạc') then
    raise exception 'Đã có "Biên nhận nộp hồ sơ đo đạc" — seed này chạy rồi.';
  end if;
end $$;

insert into public.document_checklist_templates
    (task_type_id, name, source, is_required, needs_original, default_quantity, sort_order, note)
values
(null, 'Biên nhận nộp hồ sơ đo đạc', 'CO_QUAN', true, true, 1, 175,
 'Chỉ lưu làm bằng chứng đã nộp. Không có mã theo dõi nên không phải tra trạng thái — khác hẳn biên nhận một cửa của Pháp lý.');

insert into public.document_template_applicabilities
    (id, template_id, applicability_type, service_package_id, task_type_id, node_code, is_default)
select gen_random_uuid()::text, t.id, 'PACKAGE', 'sp_001', null, 'K05a', true
from public.document_checklist_templates t
where t.name = 'Biên nhận nộp hồ sơ đo đạc';

-- Ghi rõ vế còn lại vào chính tờ giấy, để người dùng đọc ghi chú là hiểu ngay
-- vì sao hai biên nhận không dùng chung một mẫu.
update public.document_checklist_templates
set note = 'Trên biên nhận có MÃ SỐ HỒ SƠ — dùng tra trạng thái ở cơ quan cho tới khi có kết quả. Chụp lại ngay khi nhận, bản chính kẹp hồ sơ.'
where name = 'Biên nhận hồ sơ một cửa';

-- ── KIỂM CHỨNG ──────────────────────────────────────────────────────────────
do $$
declare so_co_quan_do_ve int;
begin
  -- Gói Đo Vẽ phải có ít nhất hai tờ nhóm Cơ quan: trích lục lúc vào, biên nhận
  -- lúc nộp. Chỉ còn một tờ nghĩa là bản vá này không vào.
  select count(*) into so_co_quan_do_ve
  from public.document_template_applicabilities a
  join public.document_checklist_templates t on t.id = a.template_id
  where t.source = 'CO_QUAN'
    and (a.applicability_type = 'GLOBAL'
         or (a.applicability_type = 'PACKAGE' and a.service_package_id = 'sp_001'));
  if so_co_quan_do_ve < 2 then
    raise exception 'Gói Đo Vẽ mới có % tờ nhóm Cơ quan, chờ ít nhất 2.', so_co_quan_do_ve;
  end if;
end $$;

-- Ghi chú cũ của phiếu nộp viết "chưa ra cơ quan" — sai, K05a có ra cơ quan,
-- chỉ là không theo dõi vòng đời. Sửa cho khỏi mâu thuẫn với tờ biên nhận.
update public.document_checklist_templates
set note = 'Phiếu công ty lập khi nộp hồ sơ kỹ thuật. Đi cùng cặp với Biên nhận nộp hồ sơ đo đạc nhận về.'
where name = 'Phiếu nộp hồ sơ nội nghiệp';
