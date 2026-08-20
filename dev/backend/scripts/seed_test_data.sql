-- ════════════════════════════════════════════════════════════════════
-- DATA MẪU ĐỂ TEST — nạp nhanh, khỏi gõ tay.
-- Khách gắn source_channel='seed_test'. Xoá: chạy wipe_test_data.sql.
-- Admin id: 7189ae95-2e24-48c1-94a0-6c7538650360
-- ════════════════════════════════════════════════════════════════════

-- ── 6 khách: 3 doanh nghiệp (MST thật) + 3 cá nhân (CCCD) ──
insert into public.customers
  (id, customer_type, full_name, phone, address, tax_id, id_card_number, id_card_date, id_card_place,
   email, zalo_phone, representative_name, representative_role, source_channel, data_quality_status)
values
  ('seed-c1','business','CÔNG TY CỔ PHẦN FPT','0901000001','Số 10 phố Phạm Văn Bạch, Phường Cầu Giấy, TP Hà Nội',
    '0101248141',null,null,null,'lienhe@fpt.com.vn','0901000001','Trương Gia Bình','Chủ tịch HĐQT','seed_test','verified'),
  ('seed-c2','business','NGÂN HÀNG TMCP NGOẠI THƯƠNG VIỆT NAM','0901000002','198 Trần Quang Khải, Phường Hoàn Kiếm, TP Hà Nội',
    '0100112437',null,null,null,'vcb@test.vn','0901000002','Phạm Quang Dũng','Chủ tịch HĐQT','seed_test','verified'),
  ('seed-c3','business','CÔNG TY CỔ PHẦN SỮA VIỆT NAM','0901000003','10 Tân Trào, Phường Tân Phong, TP Hồ Chí Minh',
    '0300588569',null,null,null,'vnm@test.vn','0901000003','Mai Kiều Liên','Tổng giám đốc','seed_test','verified'),
  ('seed-c4','individual','Nguyễn Thị Hồng','0902000004','45 Nguyễn Huệ, Phường Bến Nghé, TP Hồ Chí Minh',
    null,'079301001234','2021-03-15','Cục CS QLHC về TTXH',null,'0902000004',null,null,'seed_test','verified'),
  ('seed-c5','individual','Trần Văn Nam','0902000005','12 Lê Lợi, Phường Bến Thành, TP Hồ Chí Minh',
    null,'001202005678','2022-06-20','Cục CS QLHC về TTXH',null,'0902000005',null,null,'seed_test','verified'),
  ('seed-c6','individual','Lê Thị Lan','0902000006','88 Hai Bà Trưng, Phường Đa Kao, TP Hồ Chí Minh',
    null,'079300987654','2020-11-05','Cục CS QLHC về TTXH',null,'0902000006',null,null,'seed_test','verified');

-- ── 8 hợp đồng + service_lines + receivables ──
-- Dùng CTE nạp từng bộ. total_value, priority đa dạng để test.
do $$
declare
  admin_id text := '7189ae95-2e24-48c1-94a0-6c7538650360';
  rows record;
begin
  for rows in
    select * from (values
      ('004/BK-2026','seed-c1','tt_013','Tách thửa','sp_002','Pháp Lý',25000000, date '2026-08-10','URGENT','Khách VIP cần gấp trước 20/8'),
      ('005/BK-2026','seed-c1','tt_020','Xin phép xây dựng mới','sp_003','Xin Phép Xây Dựng',40000000, date '2026-08-12','HIGH','Dự án lớn'),
      ('006/BK-2026','seed-c2','tt_011','Cấp đổi','sp_002','Pháp Lý',15000000, date '2026-08-14','NORMAL',null),
      ('007/BK-2026','seed-c3','tt_001','Đo hiện trạng','sp_001','Đo Vẽ',30000000, date '2026-08-15','HIGH','Nhà máy mới'),
      ('008/BK-2026','seed-c4','tt_013','Tách thửa','sp_002','Pháp Lý',12000000, date '2026-08-16','NORMAL',null),
      ('009/BK-2026','seed-c5','tt_002','Cắm mốc','sp_001','Đo Vẽ',8000000, date '2026-08-16','NORMAL',null),
      ('010/BK-2026','seed-c6','tt_012','Hợp thửa','sp_002','Pháp Lý',18000000, date '2026-08-17','URGENT','Xong trước Tết'),
      ('011/BK-2026','seed-c4','tt_016','Chuyển nhượng','sp_002','Pháp Lý',22000000, date '2026-08-17','NORMAL',null)
    ) as v(cid, cust, tt, ttname, sp, spname, val, dsign, prio, preason)
  loop
    insert into public.contracts (id, customer_id, service_type, total_value, date_signed, status, created_at)
      values (rows.cid, rows.cust, rows.ttname, rows.val, rows.dsign, null,
        now() + (substring(rows.cid from '^[0-9]+')::int) * interval '1 second');
    insert into public.service_lines
      (id, contract_id, service_package_id, service_package, task_type_id, service_type, price,
       priority, priority_reason, priority_set_by, priority_set_at)
      values (gen_random_uuid(), rows.cid, rows.sp, rows.spname, rows.tt, rows.ttname, rows.val,
        rows.prio, rows.preason,
        case when rows.prio<>'NORMAL' then admin_id end,
        case when rows.prio<>'NORMAL' then now() end);
    insert into public.receivables (id, contract_id, paid_amount, remaining_amount)
      values (gen_random_uuid(), rows.cid, 0, rows.val);
  end loop;
end $$;
