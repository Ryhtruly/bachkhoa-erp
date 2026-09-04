-- Migration A — đưa cấu hình bước xuống DB, khai cụm nhận việc, đặt hạn cho
-- yêu cầu nhờ hỗ trợ, và để lại dấu vết khi suất khoán đổi người.
--
-- Gộp bốn việc vào một migration vì cả bốn đều là THÊM CỘT có mặc định hoặc cho
-- null — không khoá bảng lâu, không bắt buộc dữ liệu cũ phải có gì. Tách ra bốn
-- lần apply chỉ nhân bốn lần rủi ro thao tác mà không giảm rủi ro nào.
--
-- ── Vì sao đưa cấu hình xuống DB ─────────────────────────────────────────────
-- TASK_POOL_DEPARTMENTS_BY_NODE_CODE và TASK_POOL_ROLES_BY_NODE_CODE đang nằm
-- cứng trong workflow_runtime.py. Đổi một phòng ban phải sửa mã, build lại ảnh,
-- deploy lại backend — cho một thứ vốn là dữ liệu danh mục.
--
-- Cột mới để NULL nghĩa là "chưa khai", và backend rơi về đúng hằng số cũ. Nhờ
-- vậy migration này chạy xong mà chưa deploy mã mới thì hệ thống vẫn chạy y hệt
-- hôm qua. Ràng buộc cardinality > 0 chặn mảng RỖNG, vì rỗng là nghĩa thứ ba
-- lập lờ: không phải "chưa khai", cũng không phải "khai là không phòng nào".
--
-- ── Vì sao cluster_code nằm ở đây ────────────────────────────────────────────
-- Nhận việc theo cụm gom [K02→K03→K05a] cho Đo vẽ và [K01→K04→K05b→K06→K07] cho
-- Pháp lý. Khai ở DB thì sau này tách/gộp cụm là một câu update, không phải một
-- lần deploy. KHÔNG đặt CHECK liệt kê tên cụm: thêm cụm thứ ba mà phải chạy DDL
-- thì cấu hình lại quay về chỗ cũ.

begin;

-- ── 1. workflow_nodes: cấu hình bước ─────────────────────────────────────────
alter table public.workflow_nodes
  add column if not exists allowed_departments text[],
  add column if not exists default_roles       text[],
  add column if not exists sla_hours           integer,
  add column if not exists allow_pause         boolean not null default false,
  add column if not exists allow_gov_tracking  boolean not null default false,
  add column if not exists cluster_code        text;

alter table public.workflow_nodes
  drop constraint if exists workflow_nodes_allowed_departments_check,
  drop constraint if exists workflow_nodes_default_roles_check,
  drop constraint if exists workflow_nodes_sla_hours_check,
  drop constraint if exists workflow_nodes_cluster_code_check;

alter table public.workflow_nodes
  add constraint workflow_nodes_allowed_departments_check
    check (allowed_departments is null or cardinality(allowed_departments) > 0),
  add constraint workflow_nodes_default_roles_check
    check (default_roles is null or cardinality(default_roles) > 0),
  add constraint workflow_nodes_sla_hours_check
    check (sla_hours is null or sla_hours > 0),
  add constraint workflow_nodes_cluster_code_check
    check (cluster_code is null or length(btrim(cluster_code)) > 0);

comment on column public.workflow_nodes.allowed_departments is
  'Phòng ban được nhận bước này. NULL = chưa khai, backend rơi về hằng số trong mã.';
comment on column public.workflow_nodes.default_roles is
  'Vai trò mặc định khi gán việc. NULL = chưa khai, backend rơi về hằng số trong mã.';
comment on column public.workflow_nodes.sla_hours is
  'Thời lượng chuẩn của bước, giờ. CHƯA KHAI (NULL) cho mọi bước — chờ số thật '
  'từ nghiệp vụ. Thời lượng theo TỪNG hạng mục vẫn nằm ở '
  'workflow_instance_revisions.graph -> nodes -> duration_days/hours và được ưu '
  'tiên; cột này chỉ là mặc định danh mục khi graph khai 0.';
comment on column public.workflow_nodes.allow_pause is
  'Bước được phép tạm dừng (chờ cơ quan / chờ đo vẽ / chờ nội bộ).';
comment on column public.workflow_nodes.allow_gov_tracking is
  'Bước có nhật ký theo dõi tiến độ cơ quan. Chỉ K05b.';
comment on column public.workflow_nodes.cluster_code is
  'Cụm nhận việc. Nhận cụm là gán nhân viên vào mọi bước cùng cluster_code trong '
  'cùng hạng mục.';

-- Khai giá trị cho bộ mã chuẩn. Dùng UPDATE chứ không UPSERT: bước nào không có
-- trong danh mục thì thôi, không tự sinh dòng danh mục ma.
--
-- sla_hours cố tình để NULL — xem comment cột. Điền số bịa ở đây là dựng ra một
-- kế hoạch không ai duyệt, rồi cả hệ thống báo trễ theo nó.
update public.workflow_nodes set
  allowed_departments = array['SALES', 'LEGAL', 'SURVEY'],
  default_roles       = array['MAIN'],
  cluster_code        = 'LEGAL_DOSSIER'
where code = 'K01';

update public.workflow_nodes set
  allowed_departments = array['SURVEY'],
  default_roles       = array['MAIN', 'ASSISTANT'],
  cluster_code        = 'SURVEY_TECH'
where code = 'K02';

update public.workflow_nodes set
  allowed_departments = array['SURVEY'],
  default_roles       = array['MAIN'],
  cluster_code        = 'SURVEY_TECH'
where code = 'K03';

update public.workflow_nodes set
  allowed_departments = array['LEGAL'],
  default_roles       = array['MAIN'],
  cluster_code        = 'LEGAL_DOSSIER'
where code = 'K04';

-- K05a: nộp nội nghiệp, phòng Đo vẽ. Tạm dừng được (chờ cơ quan / chờ đo vẽ sửa)
-- nhưng KHÔNG có nhật ký tiến độ cơ quan — nộp xong là hết việc với cơ quan.
update public.workflow_nodes set
  allowed_departments = array['SURVEY'],
  default_roles       = array['SUBMITTER'],
  allow_pause         = true,
  cluster_code        = 'SURVEY_TECH'
where code = 'K05a';

-- K05b: theo dõi một cửa rồi rút kết quả. Đây là bước DUY NHẤT có nhật ký cơ quan.
update public.workflow_nodes set
  allowed_departments = array['LEGAL'],
  default_roles       = array['SUBMITTER'],
  allow_pause         = true,
  allow_gov_tracking  = true,
  cluster_code        = 'LEGAL_DOSSIER'
where code = 'K05b';

update public.workflow_nodes set
  allowed_departments = array['LEGAL'],
  default_roles       = array['MAIN'],
  cluster_code        = 'LEGAL_DOSSIER'
where code = 'K06';

update public.workflow_nodes set
  allowed_departments = array['LEGAL'],
  default_roles       = array['MAIN'],
  cluster_code        = 'LEGAL_DOSSIER'
where code = 'K07';

-- ── 2. task_node_help_requests: hạn nhận hỗ trợ ──────────────────────────────
--
-- Nhờ hỗ trợ mà không ai nhận thì việc phải quay về người gửi, không nằm treo vô
-- hạn. Hết hạn được kiểm LƯỜI lúc đọc (không cron, không tiến trình nền), nên
-- cần đúng một cột mốc và một trạng thái kết.
alter table public.task_node_help_requests
  add column if not exists expires_at timestamp with time zone;

-- Trạng thái viết thường cho khớp ba giá trị đang có ('open'/'claimed'/'cancelled').
alter table public.task_node_help_requests
  drop constraint if exists task_node_help_requests_status_check;
alter table public.task_node_help_requests
  add constraint task_node_help_requests_status_check
    check (status::text = any (array['open', 'claimed', 'cancelled', 'expired']));

-- Yêu cầu cũ chưa có mốc: áp đúng luật 4 giờ tính từ lúc gửi. Câu này KHÔNG đổi
-- status của dòng nào — nó chỉ đặt mốc, việc chuyển sang 'expired' để lượt đọc
-- kế tiếp làm. Yêu cầu treo lâu hơn 4 giờ vì thế sẽ hết hạn ở lần đọc đầu tiên
-- sau khi deploy, và quyền trở về người gửi — đúng ý nghĩa vốn có của nó.
update public.task_node_help_requests
set expires_at = created_at + interval '4 hours'
where status = 'open' and expires_at is null;

-- Chỉ dòng còn mở mới phải quét. Index từng phần giữ cho lượt kiểm lười rẻ kể cả
-- khi bảng đã dài.
create index if not exists task_node_help_requests_expiring_idx
  on public.task_node_help_requests (expires_at)
  where status = 'open' and expires_at is not null;

comment on column public.task_node_help_requests.expires_at is
  'Quá mốc này mà chưa ai nhận thì yêu cầu thành expired, quyền và SLA trở về '
  'người gửi. Kiểm lười lúc đọc, không có tiến trình nền.';

-- ── 3. work_pay_entitlements: dấu vết suất khoán đã chuyển người ─────────────
--
-- B nhận hỗ trợ thay A ở một bước thì tiền khoán bước đó phải sang B. Không XOÁ
-- dòng của A: mất dấu ai từng giữ suất, và mất luôn số tiền để đối chiếu khi có
-- tranh chấp.
alter table public.work_pay_entitlements
  add column if not exists is_replaced boolean not null default false,
  add column if not exists replaced_by character varying(50);

alter table public.work_pay_entitlements
  drop constraint if exists work_pay_entitlements_replaced_by_fkey,
  drop constraint if exists work_pay_entitlements_replaced_check,
  drop constraint if exists work_pay_entitlements_replaced_self_check;

alter table public.work_pay_entitlements
  add constraint work_pay_entitlements_replaced_by_fkey
    foreign key (replaced_by) references public.work_pay_entitlements(id)
    on delete set null,
  -- Trỏ sang dòng thay thế thì bắt buộc phải đã đánh dấu bị thay. Thiếu vế này
  -- là có dòng vừa trỏ đi vừa còn được tính lương.
  add constraint work_pay_entitlements_replaced_check
    check (replaced_by is null or is_replaced),
  add constraint work_pay_entitlements_replaced_self_check
    check (replaced_by is distinct from id);

create index if not exists work_pay_entitlements_replaced_idx
  on public.work_pay_entitlements (replaced_by)
  where replaced_by is not null;

comment on column public.work_pay_entitlements.is_replaced is
  'Suất đã chuyển sang người khác. Giữ nguyên amount để còn đối chiếu — việc loại '
  'khỏi bảng lương do view active_work_pay_entitlements làm.';
comment on column public.work_pay_entitlements.replaced_by is
  'Dòng thay thế cho suất này.';

-- ── 4. View bảng lương ───────────────────────────────────────────────────────
--
-- Ép lọc ở MỘT chỗ thay vì trông chờ mười hai truy vấn lương đều nhớ viết
-- "and not is_replaced". Quên một chỗ là A được cộng tiền của việc B làm.
--
-- View chỉ bỏ suất đã chuyển người, KHÔNG đụng tới status — mỗi truy vấn giữ
-- nguyên bộ lọc trạng thái của nó, nên thay bảng bằng view là thay thẳng, không
-- đổi ngữ nghĩa chỗ nào.
--
-- select * cố định danh sách cột LÚC TẠO. Thêm cột vào bảng gốc sau này phải
-- chạy lại "create or replace view" ở migration đó, nếu không cột mới không có
-- trong view và truy vấn đọc nó sẽ báo lỗi ngay — hỏng ồn ào, không hỏng ngầm.
create or replace view public.active_work_pay_entitlements as
select * from public.work_pay_entitlements where not is_replaced;

comment on view public.active_work_pay_entitlements is
  'Suất khoán còn hiệu lực. Mọi truy vấn TÍNH LƯƠNG đọc view này, không đọc '
  'thẳng work_pay_entitlements.';

commit;
