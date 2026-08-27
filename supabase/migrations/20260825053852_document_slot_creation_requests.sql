-- Đề xuất THÊM MỘT LOẠI TÀI LIỆU phát sinh, kèm sẵn tệp nhân viên đã tải.
--
-- Khác hẳn document_slot_change_requests: bảng kia xin MỞ KHOÁ một ô ĐÃ CÓ để
-- sửa (slot_id NOT NULL, duyệt xong mở 24 giờ). Bảng này xin TẠO MỘT Ô CHƯA CÓ
-- (chưa có slot_id nào để trỏ tới, duyệt xong sinh ra ô). Hai hệ quả duyệt khác
-- nhau về bản chất nên không gộp — gộp thì slot_id phải nới nullable và chỉ mục
-- "một phiếu chờ mỗi ô" mất tác dụng âm thầm với loại mới.
--
-- Yêu cầu: chạy sau 20260825085000 (task_node_checklist_results.contract_id).

create table if not exists public.document_slot_creation_requests (
  id varchar primary key default gen_random_uuid()::text,

  -- Cột bản lề cho mọi khoá ngoại ghép bên dưới.
  contract_id varchar not null references public.contracts(id) on delete restrict,
  service_line_id varchar not null references public.service_lines(id) on delete restrict,
  task_node_id varchar not null references public.task_nodes(id) on delete restrict,
  checklist_result_id varchar not null,

  -- Nhân viên tự đặt
  proposed_name varchar not null,
  description text,
  reason text not null,
  source varchar not null,
  quantity integer not null default 1,

  status varchar not null default 'draft',

  -- Giám đốc được sửa lại trước khi duyệt; null nghĩa là giữ nguyên đề xuất.
  approved_name varchar,
  approved_quantity integer,
  -- Nguồn CHÍNH THỨC do Giám đốc chốt. Không dùng `source` nhân viên đề xuất:
  -- nguồn quyết định tài liệu hiện ở ngăn nào của hồ sơ, để nhân viên tự chọn là
  -- giao cho họ quyền xếp giấy của cơ quan vào ngăn giấy công ty soạn.
  approved_source varchar,
  required_before_submit boolean not null default false,
  needs_director_approval boolean not null default false,

  -- Ô sinh ra khi duyệt. Vừa là kết quả, vừa là CHỐT IDEMPOTENT: duyệt lần hai
  -- thấy cột này đã có thì trả về nguyên si, không tạo ô thứ hai.
  created_slot_id varchar references public.dossier_document_slots(id) on delete set null,

  requested_by varchar references public.users(id) on delete set null,
  reviewed_by varchar references public.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint document_slot_creation_requests_status_check
    check (status in ('draft', 'pending', 'approved', 'rejected')),
  constraint document_slot_creation_requests_source_check
    check (source in ('KHACH_HANG', 'CONG_TY', 'CO_QUAN')),
  -- Cùng danh sách với dossier_document_slots.source — lệch một giá trị là ô
  -- giấy sinh ra sẽ vi phạm ràng buộc của bảng kia.
  constraint document_slot_creation_requests_approved_source_check
    check (approved_source is null or approved_source in ('KHACH_HANG', 'CONG_TY', 'CO_QUAN')),
  constraint document_slot_creation_requests_quantity_check
    check (quantity >= 1 and (approved_quantity is null or approved_quantity >= 1)),

  -- Từ chối thì BẮT BUỘC có lý do THẬT. `not null` chưa đủ: chuỗi rỗng hoặc vài
  -- dấu cách vẫn lọt, và nhân viên nhận về một ô trống không biết sửa gì.
  constraint document_slot_creation_requests_reject_note_check
    check (status <> 'rejected' or length(btrim(coalesce(review_note, ''))) > 0),

  -- Đã xử lý thì phải biết AI xử lý và LÚC NÀO.
  constraint document_slot_creation_requests_reviewer_check
    check (status not in ('approved', 'rejected')
           or (reviewed_by is not null and reviewed_at is not null)),

  -- Duyệt thì BẮT BUỘC đã có ô. Ràng buộc này biến idempotency thành cấu trúc:
  -- không thể có dòng approved mà chưa sinh ô, và cũng không thể sinh ô thứ hai
  -- vì cột chỉ chứa được một id.
  constraint document_slot_creation_requests_approved_slot_check
    check (status <> 'approved' or created_slot_id is not null),

  -- Chiều ngược lại cũng phải đúng: có ô nghĩa là đã duyệt. Nếu không, một lần
  -- rollback nửa vời để lại ô mồ côi mà trạng thái vẫn nói "chưa duyệt".
  constraint document_slot_creation_requests_slot_only_approved_check
    check (created_slot_id is null or status = 'approved'),

  -- Duyệt xong phải chốt được tên và số lượng chính thức.
  constraint document_slot_creation_requests_approved_fields_check
    check (status <> 'approved'
           or (length(btrim(coalesce(approved_name, ''))) > 0
               and approved_quantity is not null and approved_quantity >= 1
               and approved_source is not null))
);

-- Cần cho khoá ngoại ghép của bảng nối tệp.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'uq_document_slot_creation_requests_id_contract'
  ) then
    alter table public.document_slot_creation_requests
      add constraint uq_document_slot_creation_requests_id_contract unique (id, contract_id);
  end if;
end $$;

-- Đề xuất phải thuộc đúng checklist của đúng Hợp đồng — chặn bằng cấu trúc.
alter table public.document_slot_creation_requests
  drop constraint if exists document_slot_creation_requests_checklist_fk;
alter table public.document_slot_creation_requests
  add constraint document_slot_creation_requests_checklist_fk
  foreign key (checklist_result_id, contract_id)
  references public.task_node_checklist_results (id, contract_id) on delete cascade;

-- Một tên giấy chỉ được đề xuất một lần cho mỗi mục checklist khi còn dang dở.
-- Đã duyệt hay đã từ chối thì cho đề xuất lại (nhân viên sửa rồi gửi lại).
create unique index if not exists uq_document_slot_creation_open
  on public.document_slot_creation_requests (checklist_result_id, lower(proposed_name))
  where status in ('draft', 'pending');

create index if not exists document_slot_creation_requests_queue_idx
  on public.document_slot_creation_requests (status, created_at);
create index if not exists document_slot_creation_requests_checklist_idx
  on public.document_slot_creation_requests (checklist_result_id);

alter table public.document_slot_creation_requests enable row level security;

comment on table public.document_slot_creation_requests is
  'Nhân viên đề xuất một loại tài liệu phát sinh. Chỉ status=approved mới sinh ô giấy và đưa tệp vào hồ sơ chính thức.';


-- ── Một đề xuất — NHIỀU tệp ─────────────────────────────────────────────────
--
-- Một lần phát sinh thường kèm nhiều ảnh scan hoặc nhiều tệp kỹ thuật. Tệp đã
-- nằm sẵn ở dossier_documents từ lúc tải lên (có document_id, object key,
-- checksum, quyền đọc qua backend); bảng này chỉ nói tệp nào thuộc đề xuất nào.
create table if not exists public.document_slot_creation_request_documents (
  id varchar primary key default gen_random_uuid()::text,
  contract_id varchar not null references public.contracts(id) on delete restrict,
  request_id varchar not null,
  document_id varchar not null,
  created_by varchar references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_slot_creation_request_document
  on public.document_slot_creation_request_documents (request_id, document_id);

create index if not exists slot_creation_request_documents_document_idx
  on public.document_slot_creation_request_documents (document_id);

-- Hai khoá ngoại ghép dùng CHUNG contract_id: đề xuất và tệp buộc phải cùng một
-- Hợp đồng, không lách được kể cả khi INSERT thẳng vào DB.
--
-- request → cascade: xoá đề xuất thì mối nối hết nghĩa.
-- document → restrict: xoá đề xuất KHÔNG được kéo tệp đi theo. Tệp vẫn nằm
--   nguyên ở kho để còn xem lại và gửi lại.
alter table public.document_slot_creation_request_documents
  drop constraint if exists slot_creation_request_documents_request_fk;
alter table public.document_slot_creation_request_documents
  add constraint slot_creation_request_documents_request_fk
  foreign key (request_id, contract_id)
  references public.document_slot_creation_requests (id, contract_id) on delete cascade;

alter table public.document_slot_creation_request_documents
  drop constraint if exists slot_creation_request_documents_document_fk;
alter table public.document_slot_creation_request_documents
  add constraint slot_creation_request_documents_document_fk
  foreign key (document_id, contract_id)
  references public.dossier_documents (id, contract_id) on delete restrict;

alter table public.document_slot_creation_request_documents enable row level security;

comment on table public.document_slot_creation_request_documents is
  'Tệp thuộc một đề xuất loại tài liệu phát sinh. Tệp lưu MỘT lần ở dossier_documents; bảng này chỉ là quan hệ.';
