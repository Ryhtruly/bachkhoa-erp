from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session


def calculate_employee_kpi(db: Session, month: str) -> list[dict]:
    """Tổng hợp KPI từ Node, phân công và event của workflow mới."""
    try:
        year, month_number = map(int, month.split("-"))
        period_start = date(year, month_number, 1)
    except (TypeError, ValueError):
        return []

    rows = db.execute(text("""
        with period as (
          -- Dùng cast(... as date) chứ KHÔNG dùng :param::date.
          -- SQLAlchemy không nhận ra tham số khi ngay sau nó là dấu '::' (nó coi
          -- đó là dấu hai chấm được thoát), nên câu SQL tới Postgres còn nguyên
          -- ":period_start" và lỗi cú pháp — cả trang KPI chết 500.
          select cast(:period_start as date) as start_date,
                 cast(cast(:period_start as date) + interval '1 month' as date) as end_date
        ), completed as (
          select a.employee_id,
                 count(distinct n.id) as total_completed,
                 count(distinct n.id) filter (
                   where n.deadline_at is null or n.completed_at <= n.deadline_at
                 ) as on_time_count,
                 avg(extract(epoch from (n.completed_at - n.started_at)) / 86400.0)
                   filter (where n.started_at is not null) as avg_time
          from public.task_node_assignments a
          join public.task_nodes n on n.id = a.task_node_id
          cross join period p
          where n.status = 'accepted'
            and n.completed_at >= p.start_date
            and n.completed_at < p.end_date
            and a.assignment_status in ('assigned', 'accepted', 'completed')
          group by a.employee_id
        ), rejected as (
          select a.employee_id, count(distinct ev.id) as rejections
          from public.task_node_assignments a
          join public.task_node_events ev on ev.task_node_id = a.task_node_id
          cross join period p
          where ev.created_at >= p.start_date
            and ev.created_at < p.end_date
            and ev.event_type in ('AGENCY_REJECTED', 'REWORK_REQUIRED', 'ACCEPTANCE_REJECTED')
          group by a.employee_id
        )
        select e.id, e.full_name,
               coalesce(c.total_completed, 0) as total_completed,
               coalesce(c.on_time_count, 0) as on_time_count,
               coalesce(c.avg_time, 0) as avg_time,
               coalesce(r.rejections, 0) as rejections
        from public.employees e
        left join completed c on c.employee_id = e.id
        left join rejected r on r.employee_id = e.id
        where coalesce(e.is_active, true)
        order by e.full_name
    """), {"period_start": period_start}).mappings().all()

    results = []
    for row in rows:
        total = int(row["total_completed"] or 0)
        on_time_count = int(row["on_time_count"] or 0)
        rejections = int(row["rejections"] or 0)
        on_time_rate = (on_time_count / total * 100) if total else 100
        if not total:
            score = 0
            performance = "Chưa đánh giá"
        else:
            score = 100 + (total - 10) * 2
            if on_time_rate < 90:
                score -= (90 - on_time_rate) * 0.5
            score = min(max(round(score - rejections * 5, 1), 0), 150)
            if score >= 95:
                performance = "Xuất sắc"
            elif score >= 80:
                performance = "Tốt"
            elif score >= 60:
                performance = "Khá"
            else:
                performance = "Cần cố gắng"

        results.append({
            "employee": row["full_name"] or row["id"],
            "total_completed": total,
            "on_time_rate": round(on_time_rate, 1),
            "rejections": rejections,
            "avg_time": round(float(row["avg_time"] or 0), 1),
            "final_score": score,
            "performance": performance,
        })

    results.sort(key=lambda item: item["final_score"], reverse=True)
    return results
