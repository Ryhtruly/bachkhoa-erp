-- Thêm 5 loại hồ sơ mới
INSERT INTO public.task_types (id, name) VALUES 
  ('tt_gps_001', 'Đo GPS'),
  ('tt_kt_001', 'Kiểm tra hiện trạng'),
  ('tt_ve_001', 'Hỗ trợ vẽ theo yêu cầu'),
  ('tt_ks_001', 'Khảo sát'),
  ('tt_nop_001', 'Hỗ trợ nộp hồ sơ')
ON CONFLICT (name) DO NOTHING;

-- Cập nhật đơn giá cho các loại hồ sơ có sẵn (nếu chưa có rate)
-- Cắm mốc: main=1,200,000, support=300,000
INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_cam_moc_main', tt.id, 'main', 1200000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Cắm mốc'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'main' AND r.effective_to IS NULL);

INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_cam_moc_support', tt.id, 'support', 300000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Cắm mốc'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'support' AND r.effective_to IS NULL);

-- Hoàn công: main=1,100,000, support=200,000
INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_hoan_cong_main', tt.id, 'main', 1100000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Hoàn công'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'main' AND r.effective_to IS NULL);

INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_hoan_cong_support', tt.id, 'support', 200000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Hoàn công'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'support' AND r.effective_to IS NULL);

-- Cấp đổi: main=1,100,000, support=200,000
INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_cap_doi_main', tt.id, 'main', 1100000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Cấp đổi'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'main' AND r.effective_to IS NULL);

INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_cap_doi_support', tt.id, 'support', 200000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Cấp đổi'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'support' AND r.effective_to IS NULL);

-- Hợp thửa: main=1,200,000, support=200,000
INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_hop_thua_main', tt.id, 'main', 1200000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Hợp thửa'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'main' AND r.effective_to IS NULL);

INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_hop_thua_support', tt.id, 'support', 200000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Hợp thửa'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'support' AND r.effective_to IS NULL);

-- Tách Thửa: main=900,000, support=200,000
INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_tach_thua_main', tt.id, 'main', 900000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Tách Thửa'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'main' AND r.effective_to IS NULL);

INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_tach_thua_support', tt.id, 'support', 200000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Tách Thửa'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'support' AND r.effective_to IS NULL);

-- Cấp sổ lần đầu: main=1,100,000, support=200,000
INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_cap_so_main', tt.id, 'main', 1100000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Cấp sổ lần đầu'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'main' AND r.effective_to IS NULL);

INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_cap_so_support', tt.id, 'support', 200000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Cấp sổ lần đầu'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'support' AND r.effective_to IS NULL);

-- Chuyển mục đích: main=1,100,000, support=200,000
INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_chuyen_md_main', tt.id, 'main', 1100000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Chuyển mục đích'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'main' AND r.effective_to IS NULL);

INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_chuyen_md_support', tt.id, 'support', 200000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Chuyển mục đích'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'support' AND r.effective_to IS NULL);

-- Đo GPS: main=1,200,000, support=0
INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_do_gps_main', tt.id, 'main', 1200000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Đo GPS'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'main' AND r.effective_to IS NULL);

INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_do_gps_support', tt.id, 'support', 0, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Đo GPS'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'support' AND r.effective_to IS NULL);

-- Kiểm tra hiện trạng: main=300,000, support=150,000
INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_kt_hientrang_main', tt.id, 'main', 300000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Kiểm tra hiện trạng'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'main' AND r.effective_to IS NULL);

INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_kt_hientrang_support', tt.id, 'support', 150000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Kiểm tra hiện trạng'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'support' AND r.effective_to IS NULL);

-- Điều chỉnh bản vẽ: main=500,000, support=0
INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_dieu_chinh_bv_main', tt.id, 'main', 500000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Điều chỉnh bản vẽ'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'main' AND r.effective_to IS NULL);

INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_dieu_chinh_bv_support', tt.id, 'support', 0, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Điều chỉnh bản vẽ'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'support' AND r.effective_to IS NULL);

-- Xin phép xây dựng: main=1,500,000, support=0
INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_xin_phep_xd_main', tt.id, 'main', 1500000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Xin phép xây dựng'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'main' AND r.effective_to IS NULL);

INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_xin_phep_xd_support', tt.id, 'support', 0, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Xin phép xây dựng'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'support' AND r.effective_to IS NULL);

-- Xác định diện tích: main=700,000, support=200,000
INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_xac_dinh_dt_main', tt.id, 'main', 700000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Xác định diện tích'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'main' AND r.effective_to IS NULL);

INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_xac_dinh_dt_support', tt.id, 'support', 200000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Xác định diện tích'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'support' AND r.effective_to IS NULL);

-- Hỗ trợ vẽ theo yêu cầu: main=350,000, support=0
INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_ht_ve_main', tt.id, 'main', 350000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Hỗ trợ vẽ theo yêu cầu'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'main' AND r.effective_to IS NULL);

INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_ht_ve_support', tt.id, 'support', 0, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Hỗ trợ vẽ theo yêu cầu'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'support' AND r.effective_to IS NULL);

-- Khảo sát: main=400,000, support=0
INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_khao_sat_main', tt.id, 'main', 400000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Khảo sát'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'main' AND r.effective_to IS NULL);

INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_khao_sat_support', tt.id, 'support', 0, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Khảo sát'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'support' AND r.effective_to IS NULL);

-- Hỗ trợ nộp hồ sơ: main=350,000, support=0
INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_ht_nop_main', tt.id, 'main', 350000, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Hỗ trợ nộp hồ sơ'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'main' AND r.effective_to IS NULL);

INSERT INTO public.task_type_rates (id, task_type_id, role, rate, effective_from) 
SELECT 'ttr_ht_nop_support', tt.id, 'support', 0, '2025-01-01'
FROM public.task_types tt WHERE tt.name = 'Hỗ trợ nộp hồ sơ'
AND NOT EXISTS (SELECT 1 FROM public.task_type_rates r WHERE r.task_type_id = tt.id AND r.role = 'support' AND r.effective_to IS NULL);
