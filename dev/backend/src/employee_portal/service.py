import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from enum import StrEnum

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.core.redis_utils import get_cached_json, set_cached_json
from src.finance.repository import priority_multiplier
from src.contracts.workflow_runtime import (
    WIP_ITEM_LIMIT,
    expire_stale_help_requests,
    refresh_node_config,
    wip_limit_reached,
    workflow_node_duration,
    task_pool_department_code,
    task_pool_departments,
    task_pool_roles,
)
from src.db.models import (
    Attendance,
    Department,
    Employee,
    LeaveRecord,
    User,
)

# Runtime execution/pay tables (task_nodes, task_node_assignments,
# work_pay_entitlements, employee_compensation_terms, employee_pay_adjustments)
# have no ORM models: the dynamic workflow schema is graph-driven and queried
# with raw SQL throughout src/contracts and src/finance. Mirrors the status
# values and period logic in FinanceRepository.list_payroll_formatted so the
# two payroll views can't silently disagree.
class ChecklistStatus(StrEnum):
    """Canonical checklist states stored in task_node_checklist_results.status."""

    NOT_STARTED = "pending"
    PENDING_APPROVAL = "pending_approval"
    LATE_PENDING_APPROVAL = "late_pending_approval"
    APPROVED = "approved"
    LATE_APPROVED = "late_approved"
    REJECTED = "failed"
    NOT_APPLICABLE = "not_applicable"


_TASKS_QUERY = text(
    """
    select n.id, n.node_key, n.node_code, n.occurrence_no,
           -- Tên và mô tả phải là thứ giám đốc đặt trong QUY TRÌNH này, không
           -- phải tên chung trong danh mục. Đặt tên bước là "Bàn giao kết quả"
           -- mà nhân viên vẫn thấy "Nhận kết quả & bàn giao" thì hai bên nói về
           -- cùng một việc bằng hai cái tên khác nhau.
           coalesce(
             nullif(coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->>'name', ''),
             wn.name
           ) as node_name,
           coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->>'description' as node_description,
           coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key as node_definition,
           -- Cờ nghiệp vụ của bước — để màn nhân viên chỉ hiện panel đặc biệt đúng
           -- chỗ (bàn giao / hồ sơ nộp cơ quan), không bày nhầm lên mọi bước.
           coalesce((coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->>'is_handover')::boolean, false) as is_handover,
           coalesce((coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->>'requires_gov_submission')::boolean, false) as requires_gov_submission,
           -- Tạm dừng: đồng hồ phải ĐÓNG BĂNG THẤY ĐƯỢC. Không trả mấy trường này
           -- thì nhân viên vẫn thấy mình sắp trễ trong lúc chờ cơ quan, và cả tính
           -- năng tạm dừng vô nghĩa với họ.
           n.pause_reason_type, n.paused_at, n.paused_note, n.paused_seconds,
           -- Cờ cấu hình của bước, đọc từ DANH MỤC. Giao diện chọn khối nghiệp
           -- vụ theo ba cờ này chứ không theo mã K — đổi bước nào được tạm dừng
           -- là một câu update, không phải một lần deploy.
           coalesce(wn.allow_pause, false) as allow_pause,
           coalesce(wn.allow_gov_tracking, false) as allow_gov_tracking,
           wn.cluster_code,
           -- Bước bị kéo về sửa đọc hạn MỚI này, không đọc deadline_at cũ — hạn cũ
           -- gần như chắc chắn đã trôi qua, dùng lại là vừa mở lại đã đỏ quá hạn.
           n.rework_deadline_at,
           n.status, n.outcome, n.started_at, n.submitted_at, n.deadline_at,
           n.is_overdue, n.completed_at,
           n.execution_data,
           a.role_code, a.is_primary, wi.service_line_id, sl.contract_id, sl.priority
    from public.task_node_assignments a
    join public.task_nodes n on n.id = a.task_node_id
    join public.workflow_instances wi on wi.id = n.workflow_instance_id
    join public.service_lines sl on sl.id = wi.service_line_id
    join public.workflow_nodes wn on wn.code = n.node_code
    left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
    left join public.workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
    where a.employee_id = :employee_id
      and a.assignment_status not in ('replaced', 'declined')
    order by n.deadline_at asc nulls last, n.updated_at desc
    """
)

_TASK_POOL_QUERY = text(
    """
    select n.id, n.node_key, n.node_code, n.status, n.deadline_at, n.execution_data,
           wi.id as workflow_instance_id, wi.service_line_id, sl.contract_id, sl.priority,
           coalesce(w.name, nullif(sl.property_address, '')) as location_label,
           coalesce(tt.name, sl.service_type, n.node_code) as service_line_name,
           coalesce(cu.full_name, 'Khách hàng') as customer_name,
           coalesce(
             nullif(coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->>'name', ''),
             wn.name
           ) as node_name,
           coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->>'description' as node_description,
           coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key as node_definition,
           coalesce((
             select jsonb_agg(a.role_code order by a.created_at)
             from public.task_node_assignments a
             where a.task_node_id = n.id
               and a.assignment_status in ('proposed', 'assigned', 'accepted')
           ), '[]'::jsonb) as occupied_roles,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                 'role_code', a.role_code, 'employee_id', a.employee_id
             ) order by a.created_at)
             from public.task_node_assignments a
             where a.task_node_id = n.id
               and a.assignment_status in ('proposed', 'assigned', 'accepted')
           ), '[]'::jsonb) as occupied_assignments,
           case when n.node_code = 'K03' then (
             select a.employee_id
             from public.task_nodes k02
             join public.task_node_assignments a on a.task_node_id = k02.id
             where k02.workflow_instance_id = n.workflow_instance_id
               and k02.node_code = 'K02' and k02.status = 'accepted'
               and a.role_code = 'MAIN'
               and a.assignment_status in ('assigned', 'accepted', 'completed')
             order by k02.accepted_at desc nulls last limit 1
           ) end as preferred_employee_id,
           case when n.node_code = 'K03' then (
             select k02.accepted_at + interval '30 minutes'
             from public.task_nodes k02
             where k02.workflow_instance_id = n.workflow_instance_id
               and k02.node_code = 'K02' and k02.status = 'accepted'
             order by k02.accepted_at desc nulls last limit 1
           ) end as preference_until
    from public.task_nodes n
    join public.workflow_instances wi on wi.id = n.workflow_instance_id and wi.status = 'running'
    join public.service_lines sl on sl.id = wi.service_line_id
    join public.contracts c on c.id = sl.contract_id
    left join public.customers cu on cu.id = c.customer_id
    left join public.task_types tt on tt.id = sl.task_type_id
    join public.workflow_nodes wn on wn.code = n.node_code
    left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
    left join public.workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
    left join lateral (
      select sr.ward_code from public.survey_records sr
      where sr.service_line_id = sl.id order by sr.created_at limit 1
    ) srec on true
    left join public.wards w on w.code = srec.ward_code
    where n.status in ('ready', 'in_progress')
    order by case sl.priority when 'URGENT' then 0 when 'HIGH' then 1 else 2 end,
             n.deadline_at asc nulls last, n.created_at
    """
)

_HELP_POOL_QUERY = text(
    """
    select h.id as help_request_id, h.reason, h.proposed_amount, h.created_at,
           h.requested_by_employee_id,
           n.id, n.node_key, n.node_code, n.status, n.deadline_at,
           wi.id as workflow_instance_id, wi.service_line_id, sl.contract_id, sl.priority,
           coalesce(w.name, nullif(sl.property_address, '')) as location_label,
           coalesce(tt.name, sl.service_type, n.node_code) as service_line_name,
           coalesce(cu.full_name, 'Khách hàng') as customer_name,
           coalesce(
             nullif(coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->>'name', ''),
             wn.name
           ) as node_name,
           coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key as node_definition,
           e.full_name as yielded_by_name
    from public.task_node_help_requests h
    join public.task_nodes n on n.id = h.task_node_id
    join public.workflow_instances wi on wi.id = n.workflow_instance_id and wi.status = 'running'
    join public.service_lines sl on sl.id = wi.service_line_id
    join public.contracts c on c.id = sl.contract_id
    join public.employees e on e.id = h.requested_by_employee_id
    join public.workflow_nodes wn on wn.code = n.node_code
    left join public.customers cu on cu.id = c.customer_id
    left join public.task_types tt on tt.id = sl.task_type_id
    left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
    left join public.workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
    left join lateral (
      select sr.ward_code from public.survey_records sr
      where sr.service_line_id = sl.id order by sr.created_at limit 1
    ) srec on true
    left join public.wards w on w.code = srec.ward_code
    -- Lời nhờ hiển thị cho MỌI người, kể cả chính người nhờ và người phòng khác:
    -- có nhìn thấy thì mới biết bước đang kẹt mà còn xoay. Quyền NHẬN vẫn siết
    -- nguyên ở claim_node_help (không tự nhận bước mình nhờ, không nhận bước
    -- ngoài phòng ban), nên mở rộng tầm nhìn không mở rộng quyền.
    where h.status = 'open'
    order by case sl.priority when 'URGENT' then 0 when 'HIGH' then 1 else 2 end,
             h.created_at
    """
)

_MY_ITEMS_QUERY = text(
    """
    with my_instances as (
      select distinct n.workflow_instance_id
      from public.task_node_assignments a
      join public.task_nodes n on n.id = a.task_node_id
      where a.employee_id = :employee_id
        and a.assignment_status in ('assigned', 'accepted')
        and n.status not in ('accepted', 'cancelled', 'skipped')
    )
    select
      wi.id as workflow_instance_id,
      wi.service_line_id,
      sl.contract_id,
      sl.priority,
      -- Tiền hợp đồng cho thanh công nợ ở K06. Bước bàn giao chỉ đóng được khi
      -- đã thu đủ hoặc có đơn nợ được duyệt, nên con số này phải thấy ngay tại
      -- chỗ làm việc thay vì bắt mở sang màn Thu chi.
      coalesce(c.total_value, 0) as contract_total_value,
      -- Số đã thu tính từ PHIẾU THU đã duyệt, không có cột sẵn trên hợp đồng.
      -- Dùng lại đúng nguồn mà debt_summary() dùng, để thanh công nợ ở màn này
      -- không bao giờ nói khác cổng chặn bàn giao.
      coalesce((
        select sum(t.amount) from public.cashflow_transactions t
        where t.contract_id = c.id
          and t.transaction_type = any(:income_types)
          and t.status = any(:approved_statuses)
      ), 0) as contract_paid_amount,
      coalesce(tt.name, sl.service_type, 'Hạng mục') as service_line_name,
      coalesce(cu.full_name, 'Khách hàng') as customer_name,
      coalesce(w.name, nullif(sl.property_address, '')) as location_label,
      (
        select jsonb_agg(s.node order by s.node_code, s.occurrence_no)
        from (
          select
            n2.node_code,
            n2.occurrence_no,
            jsonb_build_object(
              'id', n2.id,
              'node_code', n2.node_code,
              'status', n2.status,
              'name', coalesce(
                nullif(coalesce(r_act.graph, r_def2.graph)->'nodes'->n2.node_key->>'name', ''),
                wn2.name
              ),
              'mine', exists (
                select 1 from public.task_node_assignments a2
                where a2.task_node_id = n2.id
                  and a2.employee_id = :employee_id
                  and a2.assignment_status in ('assigned', 'accepted')
              )
            ) as node
          from public.task_nodes n2
          join public.workflow_nodes wn2 on wn2.code = n2.node_code
          left join public.workflow_instance_revisions r_def2
            on r_def2.id = n2.defined_by_revision_id
          where n2.workflow_instance_id = wi.id
            and n2.status not in ('cancelled', 'skipped')
        ) s
      ) as nodes
    from my_instances mi
    join public.workflow_instances wi on wi.id = mi.workflow_instance_id
    join public.service_lines sl on sl.id = wi.service_line_id
    join public.contracts c on c.id = sl.contract_id
    left join public.customers cu on cu.id = c.customer_id
    left join public.task_types tt on tt.id = sl.task_type_id
    left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
    left join lateral (
      select sr.ward_code from public.survey_records sr
      where sr.service_line_id = sl.id order by sr.created_at limit 1
    ) srec on true
    left join public.wards w on w.code = srec.ward_code
    order by case sl.priority when 'URGENT' then 0 when 'HIGH' then 1 else 2 end, wi.id
    """
)

# Lịch sử: Hạng mục mà PHẦN VIỆC CỦA NGƯỜI NÀY đã xong hết.
#
# Đây là phần bù của `_MY_ITEMS_QUERY`: chỗ kia lấy Hạng mục còn bước dở của họ
# (chính là "Tải của bạn"), chỗ này lấy Hạng mục không còn bước dở nào. Cộng hai
# lại ra đúng số Hạng mục người đó từng đụng vào.
#
# Hai điều cố ý KHÔNG làm:
#   - Không lọc theo ngày. Đây là lịch sử, không phải bảng thành tích hôm nay.
#   - Không đòi cả Hạng mục phải đóng. Người đo xong K01–K03 mà K07 của phòng khác
#     chưa chạy thì phần của họ vẫn là đã xong; cờ `workflow_done` nói riêng chuyện
#     Hạng mục đã đóng trọn vẹn hay chưa.
_COMPLETED_ITEMS_QUERY = text(
    """
    with my_instances as (
      select n.workflow_instance_id,
             count(*) filter (where n.status = 'accepted') as my_node_count,
             max(n.accepted_at) as last_accepted_at
      from public.task_node_assignments a
      join public.task_nodes n on n.id = a.task_node_id
      where a.employee_id = :employee_id
        and a.assignment_status in ('assigned', 'accepted')
      group by n.workflow_instance_id
      having not exists (
        select 1
        from public.task_node_assignments a2
        join public.task_nodes n2 on n2.id = a2.task_node_id
        where a2.employee_id = :employee_id
          and a2.assignment_status in ('assigned', 'accepted')
          and n2.workflow_instance_id = n.workflow_instance_id
          and n2.status not in ('accepted', 'cancelled', 'skipped')
      )
    )
    select
      wi.id as workflow_instance_id,
      wi.service_line_id,
      sl.contract_id,
      coalesce(tt.name, sl.service_type, 'Hạng mục') as service_line_name,
      coalesce(cu.full_name, 'Khách hàng') as customer_name,
      coalesce(w.name, nullif(sl.property_address, '')) as location_label,
      mi.my_node_count,
      mi.last_accepted_at,
      -- Hạng mục đã đóng trọn vẹn chưa — khác với "phần của tôi đã xong".
      not exists (
        select 1 from public.task_nodes t
        where t.workflow_instance_id = wi.id
          and t.status not in ('accepted', 'cancelled', 'skipped')
      ) as workflow_done,
      (
        select jsonb_agg(s.node order by s.node_code, s.occurrence_no)
        from (
          select
            n2.node_code,
            n2.occurrence_no,
            jsonb_build_object(
              'id', n2.id,
              'node_code', n2.node_code,
              'status', n2.status,
              'accepted_at', n2.accepted_at,
              'name', coalesce(
                nullif(coalesce(r_act.graph, r_def2.graph)->'nodes'->n2.node_key->>'name', ''),
                wn2.name
              ),
              'mine', exists (
                select 1 from public.task_node_assignments a2
                where a2.task_node_id = n2.id
                  and a2.employee_id = :employee_id
                  and a2.assignment_status in ('assigned', 'accepted')
              )
            ) as node
          from public.task_nodes n2
          join public.workflow_nodes wn2 on wn2.code = n2.node_code
          left join public.workflow_instance_revisions r_def2
            on r_def2.id = n2.defined_by_revision_id
          where n2.workflow_instance_id = wi.id
            and n2.status not in ('cancelled', 'skipped')
        ) s
      ) as nodes
    from my_instances mi
    join public.workflow_instances wi on wi.id = mi.workflow_instance_id
    join public.service_lines sl on sl.id = wi.service_line_id
    join public.contracts c on c.id = sl.contract_id
    left join public.customers cu on cu.id = c.customer_id
    left join public.task_types tt on tt.id = sl.task_type_id
    left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
    left join lateral (
      select sr.ward_code from public.survey_records sr
      where sr.service_line_id = sl.id order by sr.created_at limit 1
    ) srec on true
    left join public.wards w on w.code = srec.ward_code
    order by mi.last_accepted_at desc nulls last, wi.id
    """
)

# Tiền của RIÊNG nhân viên trên từng Hạng mục: đã chốt (entitlement) so với tổng
# khoán của các suất họ đang giữ. Thẻ "250k/550k" đọc thẳng từ đây.
_MY_ITEMS_MONEY_QUERY = text(
    """
    with duoc_giao as (
      select n.workflow_instance_id, coalesce(sum(wr.amount), 0) as amount_total
      from public.task_node_checklist_assignments ca
      join public.task_node_checklist_results r on r.id = ca.checklist_result_id
      join public.task_nodes n on n.id = r.task_node_id
      left join public.work_item_rates wr on wr.id = ca.work_item_rate_id
      where ca.employee_id = :employee_id
        and ca.status not in ('replaced', 'cancelled')
        and n.workflow_instance_id = any(:instance_ids)
      group by n.workflow_instance_id
    ), da_chot as (
      select workflow_instance_id, coalesce(sum(amount), 0) as amount_earned
      from public.active_work_pay_entitlements
      where employee_id = :employee_id
        and workflow_instance_id = any(:instance_ids)
        and status in ('eligible', 'approved', 'paid')
      group by workflow_instance_id
    )
    select coalesce(d.workflow_instance_id, c.workflow_instance_id) as workflow_instance_id,
           coalesce(d.amount_total, 0) as amount_total,
           coalesce(c.amount_earned, 0) as amount_earned
    from duoc_giao d
    full outer join da_chot c on c.workflow_instance_id = d.workflow_instance_id
    """
)

# Khoán và người phụ trách của TỪNG bước trong chuỗi — để sơ đồ chuỗi nói được
# "bước này bao nhiêu tiền, ai đang giữ". Đơn giá đọc từ bảng giá Giám đốc công bố
# (work_item_rates), không ghi cứng theo mã bước: cùng một bước K02 nhưng gói
# Tách thửa và gói Cấp đổi có giá khác nhau.
_ITEM_NODE_DETAIL_QUERY = text(
    """
    select
      n.id as task_node_id,
      -- Số ĐÃ CHỐT lúc nghiệm thu, nếu bước đã xong. Bảng giá đổi sau đó thì con
      -- số này KHÔNG đổi — nhân viên được trả theo giá lúc làm, không theo giá
      -- hôm nay. Đọc qua VIEW nên suất đã chuyển cho người nhận hỗ trợ không bị
      -- cộng nhầm cho người nhường.
      (
        select sum(e.amount)
        from public.active_work_pay_entitlements e
        where e.task_node_id = n.id and e.employee_id = :employee_id
          and e.status <> 'void'
      ) as settled_amount,
      coalesce((
        select sum(wr.amount)
        from public.task_node_checklist_results r
        join public.work_item_rates wr on wr.work_item_id = r.work_item_id
        where r.task_node_id = n.id
          and coalesce(r.is_payable, false)
          and wr.status = 'published'
          and current_date <@ wr.effective_period
          and wr.role_code = coalesce((
            select a.role_code from public.task_node_assignments a
            where a.task_node_id = n.id and a.employee_id = :employee_id
              and a.assignment_status in ('assigned', 'accepted')
            limit 1
          ), 'MAIN')
      ), 0) as amount,
      (
        select e.full_name
        from public.task_node_assignments a
        join public.employees e on e.id = a.employee_id
        where a.task_node_id = n.id
          and a.assignment_status in ('proposed', 'assigned', 'accepted')
        order by a.is_primary desc, a.created_at
        limit 1
      ) as assignee_name,
      -- Bước đã được đẩy lên Bể việc chưa. Thiếu cờ này thì bàn làm việc vẫn
      -- bày nút "Nhờ hỗ trợ" sau khi đã nhờ, nhân viên bấm lại và ăn 409.
      exists (
        select 1 from public.task_node_help_requests h
        where h.task_node_id = n.id and h.status = 'open'
      ) as help_request_open,
      -- Chỉ người đã nhờ mới rút lại được, nên id chỉ trả cho đúng người đó.
      (
        select h.id from public.task_node_help_requests h
        where h.task_node_id = n.id and h.status = 'open'
          and h.requested_by_employee_id = :employee_id
        limit 1
      ) as my_help_request_id
    from public.task_nodes n
    where n.workflow_instance_id = any(:instance_ids)
      and n.status not in ('cancelled', 'skipped')
    """
)

# Bối cảnh chuỗi cho thẻ Bể việc: một thẻ là trọn chuỗi của một Hạng mục, nên
# phải biết cả những bước CHƯA nằm trong Bể việc (bước sau sẽ tự về tay người nhận).
_POOL_CHAIN_QUERY = text(
    """
    select n.workflow_instance_id, n.id as task_node_id, n.node_code, n.status, n.occurrence_no,
           coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key as node_definition,
           (
             select count(*) from public.task_node_checklist_results r
             where r.task_node_id = n.id and coalesce(r.is_required, true)
           ) as output_count,
           coalesce((
             select sum(wr.amount)
             from public.task_node_checklist_results r
             join public.work_item_rates wr on wr.work_item_id = r.work_item_id
             where r.task_node_id = n.id and coalesce(r.is_payable, false)
               and wr.role_code = 'MAIN' and wr.status = 'published'
               and current_date <@ wr.effective_period
           ), 0) as main_amount
    from public.task_nodes n
    join public.workflow_instances wi on wi.id = n.workflow_instance_id
    left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
    left join public.workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
    where n.workflow_instance_id = any(:instance_ids)
      and n.status not in ('cancelled', 'skipped')
    order by n.node_code, n.occurrence_no
    """
)

# ---- Chi tiết một thẻ Bể việc trước khi bấm nhận -------------------------------
# Nhân viên đang cam kết làm trọn chuỗi và ăn khoán theo đó, nên trước khi bấm
# phải thấy đủ: làm những bước nào, mỗi bước phải nộp ra cái gì, mục nào có tiền,
# và tổng cộng được bao nhiêu.

_POOL_DETAIL_HEADER_QUERY = text(
    """
    select
      n.id as task_node_id, n.node_code, n.workflow_instance_id,
      n.deadline_at, n.status,
      coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key as node_definition,
      wi.service_line_id, sl.contract_id, sl.priority,
      nullif(sl.target_property, '') as parcel_address,
      nullif(sl.property_certificate_number, '') as certificate_number,
      coalesce(tt.name, sl.service_type, n.node_code) as service_line_name,
      coalesce(cu.full_name, 'Khách hàng') as customer_name,
      nullif(cu.phone, '') as customer_phone,
      coalesce(w.name, nullif(sl.property_address, '')) as location_label
    from public.task_nodes n
    join public.workflow_instances wi on wi.id = n.workflow_instance_id and wi.status = 'running'
    join public.service_lines sl on sl.id = wi.service_line_id
    join public.contracts c on c.id = sl.contract_id
    left join public.customers cu on cu.id = c.customer_id
    left join public.task_types tt on tt.id = sl.task_type_id
    left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
    left join public.workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
    left join lateral (
      select sr.ward_code from public.survey_records sr
      where sr.service_line_id = sl.id order by sr.created_at limit 1
    ) srec on true
    left join public.wards w on w.code = srec.ward_code
    where n.id = :task_node_id
    """
)

_POOL_DETAIL_STEPS_QUERY = text(
    """
    select n.id as task_node_id, n.node_code, n.node_key, n.status, n.occurrence_no,
           coalesce(
             nullif(coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->>'name', ''),
             wn.name
           ) as node_name,
           coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key as node_definition
    from public.task_nodes n
    join public.workflow_instances wi on wi.id = n.workflow_instance_id
    join public.workflow_nodes wn on wn.code = n.node_code
    left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
    left join public.workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
    where n.workflow_instance_id = :instance_id
      and n.status not in ('cancelled', 'skipped')
    order by n.node_code, n.occurrence_no
    """
)

_POOL_DETAIL_CHECKLIST_QUERY = text(
    """
    select r.task_node_id, r.id, r.checklist_name, r.is_required,
           coalesce(r.is_payable, false) as is_payable,
           coalesce((
             select wr.amount from public.work_item_rates wr
             where wr.work_item_id = r.work_item_id and wr.role_code = 'MAIN'
               and wr.status = 'published' and current_date <@ wr.effective_period
             limit 1
           ), 0) as main_amount,
           coalesce((
             select wr.amount from public.work_item_rates wr
             where wr.work_item_id = r.work_item_id and wr.role_code = 'ASSISTANT'
               and wr.status = 'published' and current_date <@ wr.effective_period
             limit 1
           ), 0) as assistant_amount
    from public.task_node_checklist_results r
    where r.task_node_id = any(:node_ids)
    order by r.checklist_name
    """
)

_TASK_POOL_RATES_QUERY = text(
    """
    select r.task_node_id, wr.role_code, coalesce(sum(wr.amount), 0) as amount
    from public.task_node_checklist_results r
    join public.work_item_rates wr on wr.work_item_id = r.work_item_id
    where r.task_node_id = any(:task_node_ids)
      and coalesce(r.is_payable, false)
      and wr.status = 'published'
      and current_date <@ wr.effective_period
    group by r.task_node_id, wr.role_code
    """
)

_EMPLOYEE_POOL_GUARDS_QUERY = text(
    """
    select
      count(distinct n.id) filter (where n.status = 'in_progress') as active_in_progress,
      -- Tải dở dang đếm theo HẠNG MỤC đang giữ, đúng thứ nhân viên nhìn thấy
      -- ("2/3 hạng mục"). Suất thợ phụ không tính: đi phụ một buổi thực địa
      -- không phải là ôm trách nhiệm cả hạng mục.
      count(distinct n.workflow_instance_id) filter (
        where a.role_code <> 'ASSISTANT'
          and n.status not in ('accepted', 'cancelled', 'skipped')
      ) as held_items
    from public.task_node_assignments a
    join public.task_nodes n on n.id = a.task_node_id
    where a.employee_id = :employee_id
      and a.assignment_status in ('assigned', 'accepted')
    """
)

_DAILY_SUMMARY_QUERY = text(
    """
    with today_nodes as (
      select distinct n.id, n.status, n.submitted_at, n.accepted_at,
             coalesce((n.execution_data->>'actual_duration_seconds')::bigint, 0) as duration_seconds
      from public.task_node_assignments a
      join public.task_nodes n on n.id = a.task_node_id
      where a.employee_id = :employee_id
        and a.assignment_status not in ('replaced', 'declined', 'cancelled')
        and (
          n.submitted_at >= date_trunc('day', now())
          or n.accepted_at >= date_trunc('day', now())
          or n.status = 'in_progress'
        )
    ), today_pay as (
      select coalesce(sum(amount), 0) as amount
      from public.active_work_pay_entitlements
      where employee_id = :employee_id
        and earned_at >= date_trunc('day', now())
        and status in ('eligible', 'approved', 'paid')
    )
    select count(*) filter (where status in ('submitted', 'accepted')) as submitted_count,
           count(*) filter (where status = 'accepted') as accepted_count,
           count(*) filter (where status = 'in_progress') as in_progress_count,
           coalesce(sum(duration_seconds), 0) as duration_seconds,
           (select amount from today_pay) as earned_amount
    from today_nodes
    """
)

_TASK_ASSIGNEES_QUERY = text(
    """
    select a.task_node_id, e.id as employee_id, e.full_name, e.avatar_url,
           a.role_code, a.is_primary
    from public.task_node_assignments a
    join public.employees e on e.id = a.employee_id
    where a.task_node_id = any(:task_node_ids)
      and a.assignment_status not in ('replaced', 'declined', 'cancelled')
      and coalesce(e.is_active, true)
    order by a.task_node_id, a.is_primary desc, a.created_at asc
    """
)

_TASK_CHECKLIST_QUERY = text(
    """
    select r.id, r.task_node_id, r.checklist_key, r.checklist_name, r.is_required,
           r.status, r.require_evidence, r.approver_role, r.is_overdue, r.late_reason,
           -- Ghi chú của Giám đốc khi trả việc. Không trả trường này thì nhân
           -- viên mở ra chỉ thấy "Cần bổ sung" mà không biết bổ sung cái gì.
           r.note as director_note,
           r.submitted_at, r.evidence_data,
           -- Cấu hình tài liệu đầu ra lấy thẳng từ graph đang chạy. Không khai thì
           -- là null, và giao diện không hiện khu tài liệu — luồng minh chứng cũ
           -- giữ nguyên.
           (
             select item->'output_documents'
             from jsonb_array_elements(coalesce(
               coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->'checklist',
               '[]'::jsonb)) item
             where item->>'key' = r.checklist_key
             limit 1
           ) as output_documents,
           -- Phán quyết của Giám đốc cho TỪNG TỜ. Thiếu trường này thì nhân viên
           -- bị trả bài không đọc được vì sao — dải băng đỏ trên giao diện không
           -- có dữ liệu để hiện.
           --
           -- Khoá theo template_id vì giao diện bày theo LOẠI giấy đầu ra, và lấy
           -- bản MỚI NHẤT mỗi ô giấy: nộp lại tệp sửa thì phải thấy tệp mới đang
           -- chờ duyệt, không phải lý do từ chối của tệp đã bị thay.
           coalesce(rv.review_by_template, '{}'::jsonb) as review_by_template
    from public.task_node_checklist_results r
    left join lateral (
       select jsonb_object_agg(t.template_id, jsonb_build_object(
                'document_id',      t.document_id,
                'file_name',        t.file_name,
                'review_status',    t.review_status,
                'rejection_reason', t.rejection_reason)) as review_by_template
      from (
        select distinct on (s.template_id)
               s.template_id, l.document_id, d.file_name, l.review_status, l.rejection_reason
        from public.checklist_result_document_links l
        join public.dossier_documents d on d.id = l.document_id
        join public.dossier_document_slots s on s.id = d.slot_id
        where l.checklist_result_id = r.id
          and d.doc_status = 'DANG_DUNG'
          and s.template_id is not null
        order by s.template_id, d.uploaded_at desc, d.id desc
      ) t
    ) rv on true
    join public.task_nodes n on n.id = r.task_node_id
    join public.workflow_instances wi on wi.id = n.workflow_instance_id
    left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
    left join public.workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
    where r.task_node_id = any(:task_node_ids)
    order by r.checklist_name asc
    """
)

_CURRENT_PAYROLL_QUERY = text(
    """
    with period as (
      select cast(:period_start as date) as start_date,
             (cast(:period_start as date) + interval '1 month')::date as end_date
    ), employee_base as (
      select base_salary
      from public.employees
      where id = :employee_id
    ), base as (
      select base_salary
      from public.employee_compensation_terms, period
      where employee_id = :employee_id
        and status = 'published'
        and effective_from < period.end_date
        and (effective_to is null or effective_to >= period.start_date)
      order by effective_from desc
      limit 1
    ), piece as (
      select count(*) as tasks_completed, coalesce(sum(amount), 0) as piece_amount
      from public.active_work_pay_entitlements, period
      where employee_id = :employee_id
        and status in ('eligible', 'approved', 'paid')
        and earned_at >= period.start_date
        and earned_at < period.end_date
    ), adjustments as (
      select coalesce(sum(amount), 0) as adjustment_amount
      from public.employee_pay_adjustments, period
      where employee_id = :employee_id
        and status = 'approved'
        and effective_date >= period.start_date
        and effective_date < period.end_date
    )
    select coalesce((select base_salary from base), (select base_salary from employee_base), 0) as base_salary,
           (select tasks_completed from piece) as tasks_completed,
           (select piece_amount from piece) as piece_amount,
           (select adjustment_amount from adjustments) as adjustment_amount
    """
)


def _date_value(value):
    return value.isoformat() if value else None


def _number_value(value):
    return float(value) if isinstance(value, Decimal) else value


def checklist_submission_state(
    *, deadline_at: datetime | None, submitted_at: datetime, late_reason: str | None
) -> tuple[str, bool, str | None]:
    """Return the authoritative checklist status derived from the parent Node deadline."""
    is_overdue = bool(deadline_at and submitted_at > deadline_at)
    normalized_late_reason = (late_reason or "").strip() or None
    if is_overdue and not normalized_late_reason:
        raise HTTPException(
            status_code=422,
            detail="Checklist đã quá hạn; bắt buộc nhập lý do nộp trễ.",
        )
    return (
        ChecklistStatus.LATE_PENDING_APPROVAL if is_overdue else ChecklistStatus.PENDING_APPROVAL,
        is_overdue,
        normalized_late_reason,
    )


_HELD_OPEN_STATUSES = ("in_progress", "ready", "rework_required", "submitted")


def _held_items(db: Session, employee_id: str) -> list[dict]:
    """Các Hạng mục nhân viên đang giữ, gom theo chuỗi chứ không theo từng bước.

    Nhân viên nhận trọn chuỗi của một Hạng mục nên bàn làm việc phải nói bằng
    ngôn ngữ Hạng mục: đang ở bước nào, còn mấy bước, đã chốt bao nhiêu tiền
    trên tổng bao nhiêu. Liệt kê rời từng node là bắt họ tự ghép lại trong đầu.
    """
    from src.finance.services import APPROVED_TX_STATUSES, INCOME_TX_TYPES

    rows = db.execute(_MY_ITEMS_QUERY, {
        "employee_id": employee_id,
        "income_types": list(INCOME_TX_TYPES),
        "approved_statuses": list(APPROVED_TX_STATUSES),
    }).mappings().all()
    if not rows:
        return []

    instance_ids = [row["workflow_instance_id"] for row in rows]
    money_by_instance = {
        money["workflow_instance_id"]: money
        for money in db.execute(
            _MY_ITEMS_MONEY_QUERY,
            {"employee_id": employee_id, "instance_ids": instance_ids},
        ).mappings().all()
    }
    detail_by_node = {
        detail["task_node_id"]: detail
        for detail in db.execute(
            _ITEM_NODE_DETAIL_QUERY,
            {"employee_id": employee_id, "instance_ids": instance_ids},
        ).mappings().all()
    }

    items = []
    for row in rows:
        # Hệ số ưu tiên là của cả Hạng mục, hỏi một lần rồi dùng cho mọi bước.
        he_so_uu_tien = priority_multiplier(db, row["priority"])
        nodes = []
        for node in list(row["nodes"] or []):
            detail = detail_by_node.get(node["id"], {})
            nodes.append({
                **node,
                # Đã nghiệm thu thì lấy SỐ ĐÃ CHỐT; chưa thì lấy bảng giá hôm
                # nay làm ước tính. Giao diện đọc `amount_is_settled` để biết ghi
                # "dự kiến" hay không — bày số trần lúc bước còn chạy là hứa một
                # khoản chưa chắc có.
                "amount": _number_value(
                    detail.get("settled_amount")
                    if detail.get("settled_amount") is not None
                    else (detail.get("amount") or 0)
                ),
                "amount_is_settled": detail.get("settled_amount") is not None,
                "bonus_amount": _number_value(
                    float(
                        detail.get("settled_amount")
                        if detail.get("settled_amount") is not None
                        else (detail.get("amount") or 0)
                    ) * max(0.0, he_so_uu_tien - 1.0)
                ),
                "assignee_name": detail.get("assignee_name"),
                "help_request_open": bool(detail.get("help_request_open")),
                "my_help_request_id": detail.get("my_help_request_id"),
            })
        my_nodes = [node for node in nodes if node.get("mine")]
        # "Bước hiện tại" phải là bước còn phải làm. Rơi về bước đầu danh sách sẽ
        # hiện một bước đã nghiệm thu xong, và nút Mở ra làm trỏ vào việc đã đóng.
        pending_mine = [
            node for node in my_nodes
            if node.get("status") not in ("accepted", "completed")
        ]
        current = next(
            (node for node in pending_mine if node.get("status") in _HELD_OPEN_STATUSES),
            pending_mine[0] if pending_mine else None,
        )
        money = money_by_instance.get(row["workflow_instance_id"], {})
        items.append({
            "workflow_instance_id": row["workflow_instance_id"],
            "service_line_id": row["service_line_id"],
            "service_line_name": row["service_line_name"],
            "contract_id": row["contract_id"],
            "customer_name": row["customer_name"],
            "location_label": row["location_label"],
            "priority": row["priority"] or "NORMAL",
            "contract_total_value": _number_value(row["contract_total_value"]),
            "contract_paid_amount": _number_value(row["contract_paid_amount"]),
            "nodes": nodes,
            "current_task_node_id": (current or {}).get("id"),
            "current_node_code": (current or {}).get("node_code"),
            "current_node_name": (current or {}).get("name"),
            "current_node_status": (current or {}).get("status"),
            "current_help_request_open": bool((current or {}).get("help_request_open")),
            "current_help_request_id": (current or {}).get("my_help_request_id"),
            "steps_total": len(nodes),
            "steps_done": sum(1 for node in nodes if node.get("status") == "accepted"),
            "amount_total": _number_value(money.get("amount_total") or 0),
            "amount_earned": _number_value(money.get("amount_earned") or 0),
        })
    return items


class EmployeePortalService:
    @staticmethod
    def build_profile(db: Session, employee: Employee) -> dict:
        department = None
        if employee.department_id:
            department = db.query(Department).filter(Department.id == employee.department_id).first()
        user = db.query(User).filter(User.id == employee.user_id).first()
        tasks = db.execute(_TASKS_QUERY, {"employee_id": employee.id}).mappings().all()
        checklist_by_task = {}
        assignees_by_task = {}
        task_node_ids = [task["id"] for task in tasks]
        if task_node_ids:
            assignee_rows = db.execute(
                _TASK_ASSIGNEES_QUERY, {"task_node_ids": task_node_ids}
            ).mappings().all()
            for row in assignee_rows:
                assignees_by_task.setdefault(row["task_node_id"], []).append(
                    {
                        "employee_id": row["employee_id"],
                        "full_name": row["full_name"],
                        "avatar_url": row["avatar_url"],
                        "role_code": row["role_code"],
                        "is_primary": bool(row["is_primary"]),
                    }
                )
            checklist_rows = db.execute(
                _TASK_CHECKLIST_QUERY, {"task_node_ids": task_node_ids}
            ).mappings().all()
            for row in checklist_rows:
                checklist_by_task.setdefault(row["task_node_id"], []).append(
                    {
                        "id": row["id"],
                        "key": row["checklist_key"],
                        "name": row["checklist_name"],
                        "is_required": bool(row["is_required"]),
                        "status": row["status"],
                        "require_evidence": bool(row["require_evidence"]),
                        "approver_role": row["approver_role"],
                        "is_overdue": bool(row["is_overdue"]),
                        "late_reason": row["late_reason"],
                        "director_note": row["director_note"],
                        "submitted_at": _date_value(row["submitted_at"]),
                        "evidence_files": (row["evidence_data"] or {}).get("files", []),
                        "output_documents": list(row["output_documents"] or []),
                        "review_by_template": dict(row["review_by_template"] or {}),
                    }
                )
        # Tên loại giấy: một truy vấn cho tất cả id được nhắc tới.
        #
        # Không nhét vào truy vấn checklist bằng lateral — lateral chỉ thấy bảng
        # khai TRƯỚC nó, mà graph nằm ở hai bảng revision join sau. Tách ra vừa
        # chạy được vừa đọc được.
        #
        # Thiếu bản đồ này thì giao diện bày nguyên UUID lên màn nhân viên.
        ma_loai_giay = {
            str(doc.get("template_id"))
            for items in checklist_by_task.values()
            for item in items
            for doc in (item.get("output_documents") or [])
            if isinstance(doc, dict) and doc.get("template_id")
        }
        ten_loai_giay = {}
        if ma_loai_giay:
            ten_loai_giay = {
                row[0]: row[1]
                for row in db.execute(
                    text("select id, name from public.document_checklist_templates"
                         " where id = any(:ids)"),
                    {"ids": list(ma_loai_giay)},
                ).all()
            }
        for items in checklist_by_task.values():
            for item in items:
                item["template_names"] = {
                    str(doc.get("template_id")): ten_loai_giay.get(str(doc.get("template_id")))
                    for doc in (item.get("output_documents") or [])
                    if isinstance(doc, dict) and doc.get("template_id")
                }

        leave_records = (
            db.query(LeaveRecord)
            .filter(LeaveRecord.employee_id == employee.id)
            .order_by(LeaveRecord.start_date.desc().nulls_last())
            .all()
        )
        attendance = (
            db.query(Attendance)
            .filter(Attendance.employee_id == employee.id)
            .order_by(Attendance.date.desc().nulls_last())
            .all()
        )
        period_start = date.today().replace(day=1)
        payroll_row = db.execute(
            _CURRENT_PAYROLL_QUERY,
            {"employee_id": employee.id, "period_start": period_start},
        ).mappings().first()

        return {
            "employee": {
                "id": employee.id,
                "full_name": employee.full_name,
                "avatar_url": employee.avatar_url,
                "department": department.name if department else employee.department,
                "job_title": employee.job_title,
                "email": user.email if user else None,
                "join_date": _date_value(employee.join_date),
                "base_salary": _number_value(employee.base_salary or 0),
                "is_active": bool(employee.is_active),
            },
            "tasks": [
                {
                    "id": task["id"],
                    "node_code": task["node_code"],
                    "node_key": task["node_key"],
                    "service_line_id": task["service_line_id"],
                    "priority": task["priority"] or "NORMAL",
                    "contract_id": task["contract_id"],
                    "name": task["node_name"],
                    "description": task["node_description"],
                    "is_handover": bool(task["is_handover"]),
                    "requires_gov_submission": bool(task["requires_gov_submission"]),
                    "role_code": task["role_code"],
                    "is_primary": bool(task["is_primary"]),
                    "status": task["status"],
                    "outcome": task["outcome"],
                    "started_at": _date_value(task["started_at"]),
                    "submitted_at": _date_value(task["submitted_at"]),
                    "deadline_at": _date_value(task["deadline_at"]),
                    "deadline": _date_value(task["deadline_at"]),
                    "allow_pause": bool(task["allow_pause"]),
                    "allow_gov_tracking": bool(task["allow_gov_tracking"]),
                    "cluster_code": task["cluster_code"],
                    "pause_reason_type": task["pause_reason_type"],
                    "paused_at": _date_value(task["paused_at"]),
                    "paused_note": task["paused_note"],
                    "paused_seconds": int(task["paused_seconds"] or 0),
                    "rework_deadline_at": _date_value(task["rework_deadline_at"]),
                    "is_overdue": bool(task["is_overdue"]),
                    "completion_date": _date_value(task["completed_at"]),
                    "actual_duration_seconds": int(
                        (task["execution_data"] or {}).get("actual_duration_seconds") or 0
                    ),
                    "inherited_files": (task["execution_data"] or {}).get("inherited_files", []),
                    "field_started_at": (task["execution_data"] or {}).get("field_started_at"),
                    "checklist": checklist_by_task.get(task["id"], []),
                    "assignees": assignees_by_task.get(task["id"], []),
                }
                for task in tasks
            ],
            "held_items": _held_items(db, employee.id),
            "leave_records": [
                {
                    "id": leave.id,
                    "leave_type": leave.leave_type,
                    "start_date": _date_value(leave.start_date),
                    "end_date": _date_value(leave.end_date),
                    "status": leave.status,
                    "deduction_amount": _number_value(leave.deduction_amount),
                }
                for leave in leave_records
            ],
            "attendance": [
                {
                    "id": record.id,
                    "date": _date_value(record.date),
                    "check_in": _date_value(record.check_in),
                    "check_out": _date_value(record.check_out),
                    "status": record.status,
                }
                for record in attendance
            ],
            "latest_payroll": EmployeePortalService._format_payroll_row(period_start, payroll_row),
        }

    @staticmethod
    def get_task_pool(db: Session, employee: Employee) -> dict:
        # Nạp cấu hình bước trước khi lọc theo phòng ban: chính vòng lọc ngay bên
        # dưới gọi task_pool_departments. Nạp sau là lọc bằng hằng số dự phòng
        # rồi mới có cấu hình — bể việc hiện sai đúng một lượt.
        refresh_node_config(db)
        # Lời nhờ quá hạn phải rụng TRƯỚC khi dựng bể việc, nếu không nó còn nằm
        # đó mời người ta nhận một việc đã trả về chủ cũ.
        expire_stale_help_requests(db)
        department = None
        if employee.department_id:
            department = db.query(Department).filter(Department.id == employee.department_id).first()
        department_code = str((department.code if department else employee.department) or "").upper()
        cache_key = f"task_pool:{employee.department_id or department_code.lower()}"
        cached = get_cached_json(cache_key)
        if cached is None:
            rows = [
                row for row in db.execute(_TASK_POOL_QUERY).mappings().all()
                if department_code in task_pool_departments(
                    row["node_code"], row["node_definition"] or {}
                )
            ]
            task_node_ids = [row["id"] for row in rows]
            rates_by_node: dict[str, dict[str, float]] = {}
            if task_node_ids:
                rate_rows = db.execute(
                    _TASK_POOL_RATES_QUERY, {"task_node_ids": task_node_ids}
                ).mappings().all()
                for rate in rate_rows:
                    rates_by_node.setdefault(rate["task_node_id"], {})[rate["role_code"]] = float(
                        rate["amount"] or 0
                    )
            # Bối cảnh chuỗi: thẻ Bể việc bán trọn Hạng mục nên phải kèm các bước
            # phía sau và tổng khoán cả chuỗi, không chỉ mỗi bước đang mở.
            chain_by_instance: dict[str, dict] = {}
            instance_ids = list({row["workflow_instance_id"] for row in rows})
            if instance_ids:
                for chain_row in db.execute(
                    _POOL_CHAIN_QUERY, {"instance_ids": instance_ids}
                ).mappings().all():
                    bucket = chain_by_instance.setdefault(
                        chain_row["workflow_instance_id"],
                        {"codes": [], "steps": 0, "outputs": 0, "amount": 0.0},
                    )
                    bucket["steps"] += 1
                    node_department = task_pool_department_code(
                        chain_row["node_code"], chain_row["node_definition"] or {}
                    )
                    # Chỉ cộng phần việc của phòng mình: thợ đo không được hứa
                    # tiền khoán của bước pháp lý phía sau.
                    if node_department == department_code:
                        if chain_row["node_code"] not in bucket["codes"]:
                            bucket["codes"].append(chain_row["node_code"])
                        bucket["outputs"] += int(chain_row["output_count"] or 0)
                        bucket["amount"] += float(chain_row["main_amount"] or 0)

            cached = []
            for row in rows:
                chain = chain_by_instance.get(row["workflow_instance_id"], {})
                cached.append({
                    "id": row["id"],
                    "node_key": row["node_key"],
                    "node_code": row["node_code"],
                    "status": row["status"],
                    "name": row["node_name"],
                    "description": row["node_description"],
                    "service_line_id": row["service_line_id"],
                    "service_line_name": row["service_line_name"],
                    "contract_id": row["contract_id"],
                    "customer_name": row["customer_name"],
                    "priority": row["priority"] or "NORMAL",
                    "deadline_at": _date_value(row["deadline_at"]),
                    "pool_department_code": task_pool_department_code(
                        row["node_code"], row["node_definition"] or {}
                    ),
                    "claim_roles": list(task_pool_roles(
                        row["node_code"], row["node_definition"] or {}
                    )),
                    "occupied_roles": list(row["occupied_roles"] or []),
                    "occupied_assignments": list(row["occupied_assignments"] or []),
                    "preferred_employee_id": row["preferred_employee_id"],
                    "preference_until": _date_value(row["preference_until"]),
                    "role_amounts": rates_by_node.get(row["id"], {}),
                    "inherited_files": (row["execution_data"] or {}).get("inherited_files", []),
                    "field_started_at": (row["execution_data"] or {}).get("field_started_at"),
                    "location_label": row["location_label"],
                    "chain_codes": list(chain.get("codes") or []),
                    "step_count": int(chain.get("steps") or 0),
                    "output_count": int(chain.get("outputs") or 0),
                    "chain_amount": _number_value(chain.get("amount") or 0),
                })
            set_cached_json(cache_key, cached, ttl_seconds=60)

        guard = db.execute(
            _EMPLOYEE_POOL_GUARDS_QUERY, {"employee_id": employee.id}
        ).mappings().first() or {}
        now = datetime.now(timezone.utc)
        items = []
        for row in cached:
            if any(
                assignment.get("employee_id") == employee.id
                for assignment in row.get("occupied_assignments", [])
            ):
                continue
            occupied = set(row.get("occupied_roles", []))
            available_roles = [
                role for role in row.get("claim_roles", task_pool_roles(row["node_code"]))
                if role not in occupied
            ]
            # Thợ chính đã ra hiện trường bấm bắt đầu đo thì suất thợ phụ đóng lại:
            # người nhận sau không còn hỗ trợ được gì mà công ty vẫn mất 100.000đ.
            if row.get("field_started_at"):
                available_roles = [role for role in available_roles if role != "ASSISTANT"]
            if not available_roles:
                continue
            preference_until = None
            if row.get("preference_until"):
                preference_until = datetime.fromisoformat(
                    str(row["preference_until"]).replace("Z", "+00:00")
                )
                if preference_until.tzinfo is None:
                    preference_until = preference_until.replace(tzinfo=timezone.utc)
            preference_active = bool(preference_until and preference_until > now)
            preferred_for_me = row.get("preferred_employee_id") == employee.id and preference_active
            # Ba nhóm thẻ trên Bể việc là ba loại cam kết khác nhau, không phải ba
            # cách lọc cùng một thứ: nhận trọn chuỗi (chịu trách nhiệm tới cùng),
            # suất thợ phụ (khoán cố định, chỉ K02), và nhận hộ một bước.
            groups = []
            if any(role != "ASSISTANT" for role in available_roles):
                groups.append("CHAIN")
            if "ASSISTANT" in available_roles:
                groups.append("ASSIST")

            items.append({
                **row,
                "groups": groups,
                "available_roles": available_roles,
                "is_preferred_for_me": preferred_for_me,
                "preference_locked": bool(
                    preference_active
                    and row.get("preferred_employee_id")
                    and not preferred_for_me
                ),
                "preference_seconds_remaining": max(
                    0, int((preference_until - now).total_seconds())
                ) if preference_active else 0,
            })
        items.sort(
            key=lambda item: (
                not item["is_preferred_for_me"],
                {"URGENT": 0, "HIGH": 1}.get(item.get("priority"), 2),
                item.get("deadline_at") or "9999",
            )
        )
        # Nhóm "Cần hỗ trợ": bước đồng đội nhường lại. Không cache chung với Bể
        # việc vì lời nhờ xuất hiện/biến mất theo từng người — chính người nhường
        # không được thấy thẻ của mình.
        help_items = []
        for row in db.execute(
            _HELP_POOL_QUERY, {"employee_id": employee.id}
        ).mappings().all():
            phong_lam_duoc = task_pool_departments(
                row["node_code"], row["node_definition"] or {}
            )
            la_cua_minh = row["requested_by_employee_id"] == employee.id
            dung_phong = not phong_lam_duoc or department_code in phong_lam_duoc
            if la_cua_minh:
                ly_do_khong_nhan = "Đây là bước bạn đã nhờ — chờ đồng đội nhận."
            elif not dung_phong:
                ly_do_khong_nhan = "Bước này thuộc phòng khác, bạn xem để nắm tình hình."
            else:
                ly_do_khong_nhan = None
            help_items.append({
                "id": row["id"],
                "help_request_id": row["help_request_id"],
                "node_key": row["node_key"],
                "node_code": row["node_code"],
                "status": row["status"],
                "name": row["node_name"],
                "service_line_id": row["service_line_id"],
                "service_line_name": row["service_line_name"],
                "contract_id": row["contract_id"],
                "customer_name": row["customer_name"],
                "location_label": row["location_label"],
                "priority": row["priority"] or "NORMAL",
                "deadline_at": _date_value(row["deadline_at"]),
                "reason": row["reason"],
                "yielded_by_name": row["yielded_by_name"],
                "proposed_amount": _number_value(row["proposed_amount"] or 0),
                "groups": ["HELP"],
                "available_roles": ["MAIN"],
                "is_mine": la_cua_minh,
                "can_claim": ly_do_khong_nhan is None,
                "cannot_claim_reason": ly_do_khong_nhan,
            })

        held = int(guard.get("held_items") or 0)
        return {
            "department_code": department_code,
            "items": items,
            "help_items": help_items,
            "restrictions": {
                "active_in_progress": int(guard.get("active_in_progress") or 0),
                "held_items": held,
                "wip_limit": WIP_ITEM_LIMIT,
                "wip_locked": wip_limit_reached(held),
            },
        }

    @staticmethod
    def get_pool_item_detail(db: Session, employee: Employee, task_node_id: str) -> dict:
        """Bảng kê trước khi nhận: làm bước nào, nộp ra cái gì, mục nào có tiền.

        Nhân viên bấm "Nhận trọn" là cam kết đi tới cùng cả chuỗi, nên không thể
        bắt họ quyết định khi chỉ nhìn thấy một con số tổng.
        """
        refresh_node_config(db)
        expire_stale_help_requests(db, task_node_id=task_node_id)
        header = db.execute(
            _POOL_DETAIL_HEADER_QUERY, {"task_node_id": task_node_id}
        ).mappings().first()
        if not header:
            raise LookupError("Công việc không tồn tại hoặc quy trình không còn vận hành")

        department = None
        if employee.department_id:
            department = db.query(Department).filter(Department.id == employee.department_id).first()
        department_code = str((department.code if department else employee.department) or "").upper()

        rows = db.execute(
            _POOL_DETAIL_STEPS_QUERY, {"instance_id": header["workflow_instance_id"]}
        ).mappings().all()
        # Chỉ liệt kê phần việc của phòng mình. Bước của phòng khác vẫn nằm trong
        # chuỗi nhưng không phải thứ người này nhận, kê ra là hứa nhầm tiền.
        mine = [
            row for row in rows
            if task_pool_department_code(row["node_code"], row["node_definition"] or {}) == department_code
        ]
        node_ids = [row["task_node_id"] for row in mine]

        checklist_by_node: dict[str, list[dict]] = {}
        if node_ids:
            for row in db.execute(
                _POOL_DETAIL_CHECKLIST_QUERY, {"node_ids": node_ids}
            ).mappings().all():
                checklist_by_node.setdefault(row["task_node_id"], []).append({
                    "id": row["id"],
                    "name": row["checklist_name"],
                    "is_required": bool(row["is_required"]),
                    "is_payable": bool(row["is_payable"]),
                    "amount": _number_value(row["main_amount"] or 0),
                    "assistant_amount": _number_value(row["assistant_amount"] or 0),
                })

        steps = []
        total_main = 0.0
        total_assistant = 0.0
        for row in mine:
            definition = row["node_definition"] or {}
            checklist = checklist_by_node.get(row["task_node_id"], [])
            amount = sum(item["amount"] for item in checklist if item["is_payable"])
            assistant_amount = sum(
                item["assistant_amount"] for item in checklist if item["is_payable"]
            )
            roles = task_pool_roles(row["node_code"], definition)
            total_main += amount
            if "ASSISTANT" in roles:
                total_assistant += assistant_amount
            steps.append({
                "task_node_id": row["task_node_id"],
                "node_code": row["node_code"],
                "name": row["node_name"],
                "status": row["status"],
                # Thời lượng SLA của bước, do Giám đốc đặt trong khung quy trình.
                "duration_seconds": int(
                    workflow_node_duration(definition).total_seconds()
                ),
                "amount": _number_value(amount),
                "has_assistant_slot": "ASSISTANT" in roles,
                "assistant_amount": _number_value(assistant_amount),
                "checklist": checklist,
            })

        return {
            "task_node_id": task_node_id,
            "service_line_name": header["service_line_name"],
            "contract_id": header["contract_id"],
            "customer_name": header["customer_name"],
            "customer_phone": header["customer_phone"],
            "parcel_address": header["parcel_address"],
            "certificate_number": header["certificate_number"],
            "location_label": header["location_label"],
            "priority": header["priority"] or "NORMAL",
            "deadline_at": _date_value(header["deadline_at"]),
            "steps": steps,
            "total_amount": _number_value(total_main),
            "assistant_total_amount": _number_value(total_assistant),
        }

    @staticmethod
    def get_daily_summary(db: Session, employee: Employee) -> dict:
        cache_key = f"employee_daily_summary:{employee.id}:{date.today().isoformat()}"
        cached = get_cached_json(cache_key)
        if cached is not None:
            return cached
        row = db.execute(_DAILY_SUMMARY_QUERY, {"employee_id": employee.id}).mappings().first() or {}
        payload = {
            "submitted_count": int(row.get("submitted_count") or 0),
            "accepted_count": int(row.get("accepted_count") or 0),
            "in_progress_count": int(row.get("in_progress_count") or 0),
            "duration_seconds": int(row.get("duration_seconds") or 0),
            "earned_amount": float(row.get("earned_amount") or 0),
        }
        set_cached_json(cache_key, payload, ttl_seconds=60)
        return payload

    @staticmethod
    def get_completed_items(db: Session, employee: Employee) -> dict:
        """Lịch sử Hạng mục mà phần việc của người này đã xong hết.

        Trả về cả chuỗi K của Hạng mục — giống dãy bước bên tab Giám đốc — nhưng
        đánh dấu bước nào là của họ, và gắn minh chứng họ đã nộp vào đúng bước đó.
        Nhân viên bấm vào con số "đã hoàn thành" là để xem lại mình đã làm gì, nên
        đưa mỗi con số mà không có đường mở ra xem thì bằng không.
        """
        rows = db.execute(
            _COMPLETED_ITEMS_QUERY, {"employee_id": employee.id}
        ).mappings().all()

        items: list[dict] = []
        my_node_ids: list[str] = []
        for row in rows:
            nodes = list(row["nodes"] or [])
            for node in nodes:
                node["checklist"] = []
                if node.get("mine") and node.get("id"):
                    my_node_ids.append(node["id"])
            items.append(
                {
                    "workflow_instance_id": row["workflow_instance_id"],
                    "service_line_id": row["service_line_id"],
                    "contract_id": row["contract_id"],
                    "service_line_name": row["service_line_name"],
                    "customer_name": row["customer_name"],
                    "location_label": row["location_label"],
                    "my_node_count": int(row["my_node_count"] or 0),
                    "last_accepted_at": _date_value(row["last_accepted_at"]),
                    "workflow_done": bool(row["workflow_done"]),
                    "nodes": nodes,
                }
            )

        if my_node_ids:
            checklist_rows = db.execute(
                _TASK_CHECKLIST_QUERY, {"task_node_ids": my_node_ids}
            ).mappings().all()
            by_node: dict[str, list[dict]] = {}
            for row in checklist_rows:
                by_node.setdefault(row["task_node_id"], []).append(
                    {
                        "id": row["id"],
                        "name": row["checklist_name"],
                        "status": row["status"],
                        "submitted_at": _date_value(row["submitted_at"]),
                        "evidence_files": (row["evidence_data"] or {}).get("files", []),
                    }
                )
            for item in items:
                for node in item["nodes"]:
                    node["checklist"] = by_node.get(node.get("id"), [])

        return {"count": len(items), "items": items}

    @staticmethod
    def _calculate_payroll_history(
        db: Session, employee: Employee, target_month_date: date | None = None
    ) -> tuple[list[dict], dict | None, dict | None]:
        current_period_start = date.today().replace(day=1)
        if not target_month_date:
            target_month_date = current_period_start

        # 1. Fetch piece work aggregated by month in 1 fast query
        piece_rows = db.execute(text("""
            select (date_trunc('month', earned_at))::date as m_start,
                   count(*) as tasks_completed,
                   coalesce(sum(amount), 0) as piece_amount
            from public.active_work_pay_entitlements
            where employee_id = :emp_id
              and status in ('eligible', 'approved', 'paid')
            group by date_trunc('month', earned_at)
        """), {"emp_id": employee.id}).mappings().all()
        piece_map = {r["m_start"]: r for r in piece_rows}

        # 2. Fetch adjustments aggregated by month in 1 fast query
        adj_rows = db.execute(text("""
            select (date_trunc('month', effective_date))::date as m_start,
                   coalesce(sum(amount), 0) as adjustment_amount
            from public.employee_pay_adjustments
            where employee_id = :emp_id
              and status = 'approved'
            group by date_trunc('month', effective_date)
        """), {"emp_id": employee.id}).mappings().all()
        adj_map = {r["m_start"]: r for r in adj_rows}

        # 3. Fetch locked/paid payroll periods from payroll_periods table
        pp_rows = db.execute(text("""
            select period_month, status, locked_at, paid_at
            from public.payroll_periods
            where status in ('Locked', 'Paid')
        """)).mappings().all()
        period_status_map = {r["period_month"]: r for r in pp_rows}

        # 4. Fetch compensation terms in 1 fast query
        terms = db.execute(text("""
            select effective_from, effective_to, base_salary
            from public.employee_compensation_terms
            where employee_id = :emp_id
              and status = 'published'
            order by effective_from desc
        """), {"emp_id": employee.id}).mappings().all()

        emp_default_base = float(employee.base_salary or 0)

        def get_base_salary_for_month(m_date: date) -> float:
            if m_date.month == 12:
                next_m = m_date.replace(year=m_date.year + 1, month=1)
            else:
                next_m = m_date.replace(month=m_date.month + 1)
            for t in terms:
                eff_from = t["effective_from"]
                eff_to = t["effective_to"]
                if eff_from < next_m and (eff_to is None or eff_to >= m_date):
                    return float(t["base_salary"] or 0)
            return emp_default_base

        # Xác định tập hợp các kỳ hợp lệ:
        # - Kỳ hiện tại (Tháng này đang tạm tính)
        # - Kỳ được chọn (nếu có)
        # - Các kỳ đã được Giám đốc / Kế toán chốt duyệt hoặc thanh toán
        # - Các kỳ thực tế có phát sinh tiền khoán hoặc phụ cấp
        valid_period_dates = set()
        valid_period_dates.add(current_period_start)
        if target_month_date:
            valid_period_dates.add(target_month_date)

        join_first = employee.join_date.replace(day=1) if employee.join_date else None
        for p_month in period_status_map.keys():
            if join_first is None or p_month >= join_first:
                valid_period_dates.add(p_month)

        for p_month in piece_map.keys():
            valid_period_dates.add(p_month)
        for p_month in adj_map.keys():
            valid_period_dates.add(p_month)

        period_dates = sorted(list(valid_period_dates), reverse=True)

        payroll_history = []
        selected_payroll = None
        latest_payroll = None

        for p_date in period_dates:
            p_data = piece_map.get(p_date)
            a_data = adj_map.get(p_date)
            b_salary = get_base_salary_for_month(p_date)
            p_amount = float(p_data["piece_amount"]) if p_data else 0.0
            t_count = int(p_data["tasks_completed"]) if p_data else 0
            adj_amount = float(a_data["adjustment_amount"]) if a_data else 0.0

            pp_info = period_status_map.get(p_date)
            period_status = "Open" if p_date == current_period_start else (pp_info["status"] if pp_info else "Closed")

            formatted = {
                "month": p_date.isoformat(),
                "status": period_status,
                "tasks_completed": t_count,
                "base_salary": b_salary,
                "piece_amount": p_amount,
                "adjustment_amount": adj_amount,
                "bonus": p_amount + adj_amount,
                "total_salary": b_salary + p_amount + adj_amount,
                "is_current": (p_date == current_period_start),
                "is_locked": (period_status == "Locked"),
                "is_paid": (period_status == "Paid"),
            }

            payroll_history.append(formatted)
            if p_date == current_period_start and latest_payroll is None:
                latest_payroll = formatted
            if p_date == target_month_date and selected_payroll is None:
                selected_payroll = formatted

        if selected_payroll is None:
            selected_payroll = latest_payroll or (payroll_history[0] if payroll_history else None)

        return payroll_history, selected_payroll, latest_payroll

    @staticmethod
    def get_my_payroll(db: Session, employee: Employee, selected_month: str | None = None) -> dict:
        """Tính riêng phiếu lương cá nhân và toàn bộ lịch sử bảng lương theo các kỳ (tối ưu cao với Redis)."""
        cache_key = f"bachkhoa:portal:payroll:{employee.id}"
        if not selected_month:
            cached = get_cached_json(cache_key)
            if cached is not None:
                return cached

        department = None
        if employee.department_id:
            department = db.query(Department).filter(Department.id == employee.department_id).first()

        target_month_date = None
        if selected_month:
            try:
                parts = selected_month.strip().split("-")
                if len(parts) == 2:
                    target_month_date = date(int(parts[0]), int(parts[1]), 1)
            except Exception:
                target_month_date = None

        payroll_history, selected_payroll, latest_payroll = EmployeePortalService._calculate_payroll_history(
            db, employee, target_month_date
        )

        result = {
            "employee": {
                "id": employee.id,
                "full_name": employee.full_name,
                "avatar_url": employee.avatar_url,
                "department": department.name if department else employee.department,
                "job_title": employee.job_title,
                "base_salary": _number_value(employee.base_salary or 0),
                "is_active": bool(employee.is_active),
            },
            "latest_payroll": latest_payroll,
            "selected_payroll": selected_payroll,
            "payroll_history": payroll_history,
        }
        if not selected_month:
            set_cached_json(cache_key, result, ttl_seconds=60)
        return result

    @staticmethod
    def _authorized_checklist_for_submission(
        db: Session,
        employee: Employee,
        task_node_id: str,
        checklist_result_id: str,
        *,
        evidence_provided: bool,
        lock: bool,
    ):
        assigned = db.execute(
            text(
                """
                select 1
                from public.task_node_checklist_assignments ca
                join public.task_node_checklist_results cr on cr.id = ca.checklist_result_id
                where cr.id = :checklist_result_id
                  and cr.task_node_id = :task_node_id
                  and ca.employee_id = :employee_id
                  and ca.pay_slot = 'WORK'
                  and ca.status not in ('replaced', 'cancelled')
                union all
                select 1 from public.task_node_assignments
                where task_node_id = :task_node_id and employee_id = :employee_id
                  and assignment_status not in ('replaced', 'declined', 'cancelled')
                  and not exists (
                    select 1 from public.task_node_checklist_assignments ca2
                    where ca2.checklist_result_id = :checklist_result_id
                      and ca2.pay_slot = 'WORK'
                      and ca2.status not in ('replaced', 'cancelled')
                  )
                limit 1
                """
            ),
            {
                "task_node_id": task_node_id,
                "checklist_result_id": checklist_result_id,
                "employee_id": employee.id,
            },
        ).first()
        if not assigned:
            raise HTTPException(status_code=403, detail="Bạn không được phân công cho công việc này.")


        # THIẾU TÀI LIỆU KHÔNG CHẶN đánh dấu nhiệm vụ đã chuẩn bị xong.
        #
        # Bản trước ném 409 ở đây. Hậu quả dây chuyền: mục checklist không đánh
        # dấu xong được → nút "Nộp nghiệm thu" của Node cũng khoá → giấy khách
        # không có thật thì bước treo vĩnh viễn, và đường thoát duy nhất là nhét
        # đại một tệp cho qua cổng. Đó đúng là cái nghiệp vụ chốt 27/08 cấm.
        #
        # Danh sách thiếu vẫn được chụp lại lúc nộp nghiệm thu Node
        # (submission_payload.missing) và đưa tận mắt Giám đốc để quyết. Cổng
        # không mất, nó dời sang chỗ người có thẩm quyền thật sự đang đứng.

        checklist_query = """
            select r.id, r.status, r.require_evidence, r.evidence_data,
                   n.deadline_at, n.status as node_status
            from public.task_node_checklist_results r
            join public.task_nodes n on n.id = r.task_node_id
            where r.id = :id and r.task_node_id = :task_node_id
        """
        if lock:
            checklist_query += " for update of r, n"
        checklist = db.execute(
            text(checklist_query),
            {"id": checklist_result_id, "task_node_id": task_node_id},
        ).mappings().first()
        if not checklist:
            raise HTTPException(status_code=404, detail="Không tìm thấy checklist.")
        if checklist["status"] not in (ChecklistStatus.NOT_STARTED, ChecklistStatus.REJECTED):
            raise HTTPException(status_code=409, detail="Checklist này đã nộp hoặc đã được duyệt.")

        # Phải bấm "Bắt đầu làm" trước đã. Nộp minh chứng cho một bước chưa khởi
        # động thì mốc bắt đầu không có, thời hạn tính từ đâu cũng không biết, và
        # trên sơ đồ bước đó vẫn nằm im như chưa ai đụng tới.
        if checklist["node_status"] != "in_progress":
            nhan = {
                "pending": "chưa tới lượt",
                "ready": "chưa bấm Bắt đầu làm",
                "submitted": "đã nộp nghiệm thu, đang chờ duyệt",
                "accepted": "đã nghiệm thu xong",
                "completed": "đã hoàn thành",
                "cancelled": "đã huỷ",
                "blocked": "đang bị chặn",
                "rework_required": "bị trả về, cần bấm Làm lại trước",
            }.get(checklist["node_status"], checklist["node_status"])
            raise HTTPException(
                status_code=409,
                detail=f"Bước này {nhan} — bấm Bắt đầu làm rồi mới nộp được minh chứng.",
            )

        if checklist["require_evidence"] and not evidence_provided:
            raise HTTPException(status_code=422, detail="Checklist này bắt buộc phải nộp file minh chứng.")
        return checklist

    @staticmethod
    def authorize_checklist_evidence_submission(
        db: Session,
        employee: Employee,
        task_node_id: str,
        checklist_result_id: str,
        *,
        evidence_provided: bool,
    ) -> None:
        """Reject unauthorized or invalid submissions before touching object storage."""
        # K06 có cổng công nợ riêng. Kiểm tra trước khi route upload file lên
        # MinIO để người dùng không thể vượt khóa UI bằng cách gọi thẳng API.
        # Import cục bộ tránh tạo vòng phụ thuộc khi khởi động module.
        from src.dossiers import handover

        handover.ensure_handover_work_gate_open(db, task_node_id)
        EmployeePortalService._authorized_checklist_for_submission(
            db,
            employee,
            task_node_id,
            checklist_result_id,
            evidence_provided=evidence_provided,
            lock=False,
        )

    @staticmethod
    def submit_checklist_evidence(
        db: Session,
        employee: Employee,
        task_node_id: str,
        checklist_result_id: str,
        evidence_url: str | None,
        file_name: str | None,
        note: str | None,
        late_reason: str | None,
        submitted_at: datetime,
    ) -> dict:
        checklist = EmployeePortalService._authorized_checklist_for_submission(
            db,
            employee,
            task_node_id,
            checklist_result_id,
            evidence_provided=bool(evidence_url),
            lock=True,
        )

        next_status, is_overdue, normalized_late_reason = checklist_submission_state(
            deadline_at=checklist["deadline_at"],
            submitted_at=submitted_at,
            late_reason=late_reason,
        )

        evidence_data = dict(checklist["evidence_data"] or {})
        files = list(evidence_data.get("files") or [])
        if evidence_url:
            files.append(
                {
                    "name": file_name,
                    "url": evidence_url,
                    "note": note,
                    "submitted_at": submitted_at.isoformat(),
                }
            )
        evidence_data["files"] = files
        db.execute(
            text(
                """
                update public.task_node_checklist_results
                set status = :status, submitted_by = :user_id, submitted_at = :submitted_at,
                    is_overdue = :is_overdue, late_reason = :late_reason,
                    evidence_data = cast(:evidence_data as jsonb), updated_at = now()
                where id = :id
                """
            ),
            {
                "id": checklist_result_id,
                "status": next_status,
                "user_id": employee.user_id,
                "submitted_at": submitted_at,
                "is_overdue": is_overdue,
                "late_reason": normalized_late_reason,
                "evidence_data": json.dumps(evidence_data),
            },
        )
        if is_overdue:
            db.execute(
                text("update public.task_nodes set is_overdue = true, updated_at = now() where id = :id"),
                {"id": task_node_id},
            )
        db.commit()
        return {
            "id": checklist_result_id,
            "status": next_status,
            "is_overdue": is_overdue,
            "late_reason": normalized_late_reason,
        }

    @staticmethod
    def _format_payroll_row(period_start: date, row) -> dict | None:
        if row is None:
            return None
        base_salary = _number_value(row["base_salary"] or 0)
        piece_amount = _number_value(row["piece_amount"] or 0)
        adjustment_amount = _number_value(row["adjustment_amount"] or 0)
        return {
            "month": period_start.isoformat(),
            "tasks_completed": int(row["tasks_completed"] or 0),
            # Tách rõ 3 thành phần: phòng Pháp lý chỉ có cơ bản + thưởng/phạt,
            # phòng Đo vẽ có thêm khoán. Gộp chung thành "bonus" thì nhân viên
            # không đối chiếu được tiền khoán của mình.
            "base_salary": base_salary,
            "piece_amount": piece_amount,
            "adjustment_amount": adjustment_amount,
            "bonus": piece_amount + adjustment_amount,
            "total_salary": base_salary + piece_amount + adjustment_amount,
        }
