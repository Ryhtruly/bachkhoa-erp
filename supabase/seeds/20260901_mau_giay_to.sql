-- Bộ mẫu giấy tờ — Master Data bốn trục: Gói → Hạng mục → Node → Loại giấy.
--
-- CHỈ tạo LOẠI GIẤY MẪU. Không tạo hợp đồng, không tạo ô giấy, không đụng MinIO.
--
-- ── Luật khai ───────────────────────────────────────────────────────────────
-- 1. Mỗi loại giấy thuộc ĐÚNG MỘT nhóm nguồn gốc (`source`) — nó quyết định tờ
--    giấy nằm ngăn nào của tủ hồ sơ, và phòng nào được sửa ô giấy đó.
-- 2. Mỗi (loại giấy, phạm vi) khai ĐÚNG MỘT bước. Giấy chỉ nộp ở bước SINH RA
--    nó; các bước sau kế thừa từ Tủ hồ sơ chứ không bắt nộp lại. Ba unique index
--    của bảng phạm vi đã ép đúng như vậy.
-- 3. MỌI dòng phạm vi đều có `node_code`. Không để tờ nào "chưa gán bước" —
--    giấy không bước nào nhận thì không hiện ở màn nhân viên nào, tức không ai
--    thu, và im lặng.
--
-- ── Ba tầng phạm vi ─────────────────────────────────────────────────────────
--   GLOBAL     giấy mọi gói mọi hạng mục đều cần (nhân thân, hợp đồng dịch vụ)
--   PACKAGE    giấy đặc trưng của một gói
--   TASK_TYPE  giấy đặc thù đúng một thủ tục
--
-- `task_type_id` trên chính loại giấy để NULL: đó là cột của sổ đời 1. Hệ thống
-- chạy đời 2 (contracts/services.py đặt document_register_version = 2 khi tạo
-- Hạng mục), và đời 2 đọc bảng phạm vi. Ghi cả hai nơi là tạo hai nguồn sự thật
-- sớm muộn lệch nhau.

-- ── CHẶN CHẠY ĐÈ ────────────────────────────────────────────────────────────
do $$
declare da_co int;
begin
  select count(*) into da_co from public.document_checklist_templates;
  if da_co > 0 then
    raise exception
      'Đang có % loại giấy trong Master Data. Seed này chỉ dành cho bộ mẫu rỗng — dọn trước hoặc bỏ qua.',
      da_co;
  end if;
end $$;

-- ── 1. LOẠI GIẤY ────────────────────────────────────────────────────────────
insert into public.document_checklist_templates
    (task_type_id, name, source, is_required, needs_original, default_quantity, sort_order, note)
values
-- ═══ Bộ chung toàn công ty ═══
(null, 'CCCD/CMND của người sử dụng đất', 'KHACH_HANG', true,  true,  2, 10, 'Bản sao có chứng thực; đối chiếu bản chính khi tiếp nhận'),
(null, 'Giấy chứng nhận quyền sử dụng đất (sổ đỏ/sổ hồng)', 'KHACH_HANG', true, true, 1, 20, 'Bản chính giữ trong két, trả khách khi bàn giao'),
(null, 'Giấy tờ hôn nhân (đăng ký kết hôn hoặc xác nhận độc thân)', 'KHACH_HANG', true, false, 1, 30, null),
(null, 'Giấy xác nhận thông tin cư trú', 'KHACH_HANG', true,  false, 1, 40, 'Thay cho sổ hộ khẩu đã bỏ'),
(null, 'Giấy uỷ quyền (khi người đi làm không phải chủ đứng tên)', 'KHACH_HANG', false, true, 1, 50, 'Phải công chứng'),
(null, 'Hợp đồng dịch vụ đã ký', 'CONG_TY', true,  true,  2, 60, 'Một bản giao khách, một bản lưu tủ hợp đồng'),
(null, 'Phiếu tiếp nhận hồ sơ', 'CONG_TY', true,  false, 1, 70, null),
(null, 'Biên bản bàn giao kết quả cho khách', 'CONG_TY', true, true, 2, 900, 'Có chữ ký khách; bản lưu vào tủ hợp đồng'),
(null, 'Phiếu nhập kho lưu trữ', 'CONG_TY', true,  false, 1, 950, 'Ghi rõ vị trí kệ/tủ khi đóng hồ sơ'),

-- ═══ Gói Đo Vẽ ═══
(null, 'Trích lục bản đồ địa chính', 'CO_QUAN', true,  false, 1, 110, 'Xin tại Văn phòng Đăng ký đất đai trước khi ra hiện trường'),
(null, 'Sổ đo dã ngoại và số liệu đo RTK', 'CONG_TY', true,  false, 1, 120, 'Xuất từ máy đo, kèm file toạ độ gốc'),
(null, 'Ảnh hiện trạng thửa đất', 'CONG_TY', true,  false, 4, 130, 'Bốn hướng; thấy rõ mốc giới và công trình trên đất'),
(null, 'Biên bản xác định ranh giới, mốc giới thửa đất', 'CONG_TY', true, true, 1, 140, 'Phải có chữ ký chủ đất và các hộ liền kề'),
(null, 'Bản vẽ hiện trạng vị trí thửa đất', 'CONG_TY', true,  false, 2, 150, null),
(null, 'Hồ sơ kỹ thuật thửa đất', 'CONG_TY', true,  false, 2, 160, null),
(null, 'Phiếu nộp hồ sơ nội nghiệp', 'CONG_TY', true,  false, 1, 170, 'Sinh ở bước nộp nội nghiệp, chưa ra cơ quan'),

-- ═══ Gói Pháp Lý ═══
(null, 'Đơn đăng ký biến động đất đai (mẫu 09/ĐK)', 'CONG_TY', true, true, 2, 210, null),
(null, 'Tờ khai lệ phí trước bạ', 'CONG_TY', true,  false, 2, 220, null),
(null, 'Tờ khai thuế thu nhập cá nhân', 'CONG_TY', false, false, 2, 230, 'Không cần khi thuộc diện miễn thuế'),
(null, 'Phiếu đối soát pháp lý nội bộ', 'CONG_TY', true,  false, 1, 240, 'Rà trước khi nộp một cửa'),
(null, 'Thông báo nộp lệ phí, thuế', 'CO_QUAN', true,  false, 1, 250, null),
(null, 'Giấy chứng nhận đã cập nhật biến động', 'CO_QUAN', true, true, 1, 260, 'Kết quả cuối cùng trả cho khách'),

-- ═══ Dùng chung Gói Pháp Lý và Gói Xin Phép Xây Dựng ═══
(null, 'Biên nhận hồ sơ một cửa', 'CO_QUAN', true,  true,  1, 310, 'Chụp lại ngay khi nhận, bản chính kẹp hồ sơ'),
(null, 'Giấy hẹn trả kết quả', 'CO_QUAN', true,  true,  1, 320, 'Căn cứ theo dõi hạn trả kết quả'),

-- ═══ Gói Xin Phép Xây Dựng ═══
(null, 'Thông tin quy hoạch và chỉ giới xây dựng', 'CO_QUAN', true, false, 1, 410, 'Xin trước khi thiết kế'),
(null, 'Bản vẽ thiết kế xin phép xây dựng', 'CONG_TY', true, true, 2, 420, 'Có chữ ký và dấu của đơn vị đủ điều kiện'),
(null, 'Bản vẽ mặt bằng và mặt cắt công trình', 'CONG_TY', true, false, 2, 430, null),
(null, 'Đơn đề nghị cấp giấy phép xây dựng', 'CONG_TY', true, true, 2, 440, null),
(null, 'Giấy phép xây dựng', 'CO_QUAN', true,  true,  1, 450, 'Kết quả cuối cùng trả cho khách'),

-- ═══ Riêng từng Hạng mục — Gói Đo Vẽ ═══
(null, 'Sơ đồ hiện trạng sử dụng đất', 'CONG_TY', true, false, 2, 510, null),
(null, 'Biên bản bàn giao mốc giới tại thực địa', 'CONG_TY', true, true, 1, 520, 'Ký tại hiện trường ngay sau khi cắm mốc'),
(null, 'Bản vẽ hoàn công công trình', 'CONG_TY', true, false, 2, 530, null),
(null, 'Bản trích đo địa chính phục vụ cấp đổi', 'CONG_TY', true, false, 2, 540, null),
(null, 'Bản vẽ hợp thửa', 'CONG_TY', true, false, 2, 550, 'Thể hiện thửa mới sau khi gộp'),
(null, 'Bản vẽ tách thửa', 'CONG_TY', true, false, 2, 560, 'Thể hiện từng thửa sau khi tách, có đánh số'),
(null, 'Xác nhận nguồn gốc và thời điểm sử dụng đất của UBND cấp xã', 'CO_QUAN', true, true, 1, 570, null),
(null, 'Bản vẽ vị trí khu đất xin chuyển mục đích', 'CONG_TY', true, false, 2, 580, null),
(null, 'Bảng tính diện tích và toạ độ đỉnh thửa', 'CONG_TY', true, false, 2, 590, null),

-- ═══ Riêng từng Hạng mục — Gói Pháp Lý ═══
(null, 'Giấy phép xây dựng đã cấp', 'KHACH_HANG', true, true, 1, 610, 'Khách nộp lại để đối chiếu khi hoàn công'),
(null, 'Đơn đề nghị cấp đổi Giấy chứng nhận', 'CONG_TY', true, false, 2, 620, null),
(null, 'Đơn đề nghị hợp thửa đất', 'CONG_TY', true, false, 2, 630, null),
(null, 'Văn bản thoả thuận phân chia thửa đất', 'CONG_TY', true, true, 2, 640, 'Khi thửa có nhiều đồng sở hữu'),
(null, 'Xác nhận tình trạng tranh chấp và quy hoạch của UBND cấp xã', 'CO_QUAN', true, true, 1, 650, null),
(null, 'Văn bản chấp thuận chủ trương chuyển mục đích sử dụng đất', 'CO_QUAN', true, true, 1, 660, null),
(null, 'Hợp đồng chuyển nhượng đã công chứng', 'CONG_TY', true, true, 3, 670, 'Ba bản: khách, cơ quan, lưu công ty'),
(null, 'Hợp đồng tặng cho đã công chứng', 'CONG_TY', true, true, 3, 680, 'Ba bản: khách, cơ quan, lưu công ty'),
(null, 'Giấy chứng tử của người để lại di sản', 'KHACH_HANG', true, true, 1, 690, null),
(null, 'Văn bản khai nhận và phân chia di sản thừa kế', 'CONG_TY', true, true, 3, 700, 'Phải công chứng và niêm yết đủ thời hạn'),
(null, 'Đơn đề nghị gia hạn sử dụng đất nông nghiệp', 'CONG_TY', true, false, 2, 710, null),

-- ═══ Riêng từng Hạng mục — Gói Xin Phép Xây Dựng ═══
(null, 'Bản vẽ phối cảnh công trình', 'CONG_TY', false, false, 1, 810, null),
(null, 'Ảnh hiện trạng công trình trước cải tạo', 'KHACH_HANG', true, false, 4, 820, null),
(null, 'Giấy phép xây dựng sắp hết hạn', 'KHACH_HANG', true, true, 1, 830, 'Bản gốc để đối chiếu khi gia hạn');

-- ── 2. PHẠM VI ÁP DỤNG ──────────────────────────────────────────────────────
-- Nối theo TÊN vì tên là duy nhất trong bộ này. Mỗi dòng là một nhánh độc lập
-- của cây Gói → Hạng mục → Node.
insert into public.document_template_applicabilities
    (id, template_id, applicability_type, service_package_id, task_type_id, node_code, is_default)
select gen_random_uuid()::text, t.id, v.loai, v.goi, v.hang_muc, v.node, true
from (values
  -- ═══ GLOBAL — mọi gói, mọi hạng mục ═══
  ('CCCD/CMND của người sử dụng đất',                              'GLOBAL', null, null, 'K01'),
  ('Giấy chứng nhận quyền sử dụng đất (sổ đỏ/sổ hồng)',            'GLOBAL', null, null, 'K01'),
  ('Giấy tờ hôn nhân (đăng ký kết hôn hoặc xác nhận độc thân)',    'GLOBAL', null, null, 'K01'),
  ('Giấy xác nhận thông tin cư trú',                               'GLOBAL', null, null, 'K01'),
  ('Giấy uỷ quyền (khi người đi làm không phải chủ đứng tên)',     'GLOBAL', null, null, 'K01'),
  ('Hợp đồng dịch vụ đã ký',                                       'GLOBAL', null, null, 'K01'),
  ('Phiếu tiếp nhận hồ sơ',                                        'GLOBAL', null, null, 'K01'),
  ('Biên bản bàn giao kết quả cho khách',                          'GLOBAL', null, null, 'K06'),
  ('Phiếu nhập kho lưu trữ',                                       'GLOBAL', null, null, 'K07'),

  -- ═══ PACKAGE — Gói Đo Vẽ ═══
  ('Trích lục bản đồ địa chính',                       'PACKAGE', 'sp_001', null, 'K01'),
  ('Sổ đo dã ngoại và số liệu đo RTK',                 'PACKAGE', 'sp_001', null, 'K02'),
  ('Ảnh hiện trạng thửa đất',                          'PACKAGE', 'sp_001', null, 'K02'),
  ('Biên bản xác định ranh giới, mốc giới thửa đất',   'PACKAGE', 'sp_001', null, 'K02'),
  ('Bản vẽ hiện trạng vị trí thửa đất',                'PACKAGE', 'sp_001', null, 'K03'),
  ('Hồ sơ kỹ thuật thửa đất',                          'PACKAGE', 'sp_001', null, 'K03'),
  ('Phiếu nộp hồ sơ nội nghiệp',                       'PACKAGE', 'sp_001', null, 'K05a'),

  -- ═══ PACKAGE — Gói Pháp Lý ═══
  ('Đơn đăng ký biến động đất đai (mẫu 09/ĐK)',        'PACKAGE', 'sp_002', null, 'K04'),
  ('Tờ khai lệ phí trước bạ',                          'PACKAGE', 'sp_002', null, 'K04'),
  ('Tờ khai thuế thu nhập cá nhân',                    'PACKAGE', 'sp_002', null, 'K04'),
  ('Phiếu đối soát pháp lý nội bộ',                    'PACKAGE', 'sp_002', null, 'K04'),
  ('Thông báo nộp lệ phí, thuế',                       'PACKAGE', 'sp_002', null, 'K06'),
  ('Giấy chứng nhận đã cập nhật biến động',            'PACKAGE', 'sp_002', null, 'K06'),

  -- ═══ PACKAGE — hai gói cùng dùng, hai dòng riêng biệt ═══
  ('Biên nhận hồ sơ một cửa',                          'PACKAGE', 'sp_002', null, 'K05b'),
  ('Biên nhận hồ sơ một cửa',                          'PACKAGE', 'sp_003', null, 'K05b'),
  ('Giấy hẹn trả kết quả',                             'PACKAGE', 'sp_002', null, 'K05b'),
  ('Giấy hẹn trả kết quả',                             'PACKAGE', 'sp_003', null, 'K05b'),

  -- ═══ PACKAGE — Gói Xin Phép Xây Dựng ═══
  ('Thông tin quy hoạch và chỉ giới xây dựng',         'PACKAGE', 'sp_003', null, 'K01'),
  ('Bản vẽ thiết kế xin phép xây dựng',                'PACKAGE', 'sp_003', null, 'K03'),
  ('Bản vẽ mặt bằng và mặt cắt công trình',            'PACKAGE', 'sp_003', null, 'K03'),
  ('Đơn đề nghị cấp giấy phép xây dựng',               'PACKAGE', 'sp_003', null, 'K04'),
  ('Giấy phép xây dựng',                               'PACKAGE', 'sp_003', null, 'K06'),

  -- ═══ TASK_TYPE — Gói Đo Vẽ (đủ 9 hạng mục) ═══
  ('Sơ đồ hiện trạng sử dụng đất',                     'TASK_TYPE', null, 'tt_001', 'K03'),
  ('Biên bản bàn giao mốc giới tại thực địa',          'TASK_TYPE', null, 'tt_002', 'K02'),
  ('Bản vẽ hoàn công công trình',                      'TASK_TYPE', null, 'tt_003', 'K03'),
  ('Bản trích đo địa chính phục vụ cấp đổi',           'TASK_TYPE', null, 'tt_004', 'K03'),
  ('Bản vẽ hợp thửa',                                  'TASK_TYPE', null, 'tt_005', 'K03'),
  ('Bản vẽ tách thửa',                                 'TASK_TYPE', null, 'tt_006', 'K03'),
  ('Xác nhận nguồn gốc và thời điểm sử dụng đất của UBND cấp xã', 'TASK_TYPE', null, 'tt_007', 'K01'),
  ('Bản vẽ vị trí khu đất xin chuyển mục đích',        'TASK_TYPE', null, 'tt_008', 'K03'),
  ('Bảng tính diện tích và toạ độ đỉnh thửa',          'TASK_TYPE', null, 'tt_009', 'K03'),

  -- ═══ TASK_TYPE — Gói Pháp Lý (đủ 10 hạng mục) ═══
  ('Giấy phép xây dựng đã cấp',                        'TASK_TYPE', null, 'tt_010', 'K01'),
  ('Đơn đề nghị cấp đổi Giấy chứng nhận',              'TASK_TYPE', null, 'tt_011', 'K04'),
  ('Đơn đề nghị hợp thửa đất',                         'TASK_TYPE', null, 'tt_012', 'K04'),
  ('Văn bản thoả thuận phân chia thửa đất',            'TASK_TYPE', null, 'tt_013', 'K04'),
  ('Xác nhận tình trạng tranh chấp và quy hoạch của UBND cấp xã', 'TASK_TYPE', null, 'tt_014', 'K01'),
  ('Văn bản chấp thuận chủ trương chuyển mục đích sử dụng đất',   'TASK_TYPE', null, 'tt_015', 'K01'),
  ('Hợp đồng chuyển nhượng đã công chứng',             'TASK_TYPE', null, 'tt_016', 'K04'),
  ('Hợp đồng tặng cho đã công chứng',                  'TASK_TYPE', null, 'tt_017', 'K04'),
  ('Giấy chứng tử của người để lại di sản',            'TASK_TYPE', null, 'tt_018', 'K01'),
  ('Văn bản khai nhận và phân chia di sản thừa kế',    'TASK_TYPE', null, 'tt_018', 'K04'),
  ('Đơn đề nghị gia hạn sử dụng đất nông nghiệp',      'TASK_TYPE', null, 'tt_019', 'K04'),

  -- ═══ TASK_TYPE — Gói Xin Phép Xây Dựng (đủ 3 hạng mục) ═══
  ('Bản vẽ phối cảnh công trình',                      'TASK_TYPE', null, 'tt_020', 'K03'),
  ('Ảnh hiện trạng công trình trước cải tạo',          'TASK_TYPE', null, 'tt_021', 'K01'),
  ('Giấy phép xây dựng sắp hết hạn',                   'TASK_TYPE', null, 'tt_022', 'K01')
) as v(ten, loai, goi, hang_muc, node)
join public.document_checklist_templates t on t.name = v.ten;

-- ── 3. KIỂM CHỨNG ───────────────────────────────────────────────────────────
do $$
declare treo int; thieu int;
begin
  -- Không tờ nào được thiếu bước.
  select count(*) into treo
  from public.document_checklist_templates t
  where not exists (
    select 1 from public.document_template_applicabilities a
    where a.template_id = t.id and a.node_code is not null);
  if treo > 0 then
    raise exception 'Còn % loại giấy chưa gán bước.', treo;
  end if;

  -- Mọi Hạng mục phải nhận được ít nhất một tờ riêng của nó.
  select count(*) into thieu
  from public.task_types tt
  where not exists (
    select 1 from public.document_template_applicabilities a
    where a.applicability_type = 'TASK_TYPE' and a.task_type_id = tt.id);
  if thieu > 0 then
    raise exception 'Còn % Hạng mục chưa có loại giấy riêng nào.', thieu;
  end if;
end $$;
