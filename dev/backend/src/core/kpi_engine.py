from sqlalchemy.orm import Session
from sqlalchemy import extract, func
from src.db.models import ProjectTask, User, Employee, TaskSubmission, UserRole, Role
import datetime

def calculate_employee_kpi(db: Session, month: str) -> dict:
    """
    Calculate KPI metrics for 'staff' only based on completed tasks in a given month.
    month format: 'YYYY-MM'
    
    Metrics:
    1. Số hồ sơ hoàn thành (Target = 10)
    2. Tỷ lệ đúng hạn (%)
    3. Số lỗi nộp lại (số lần bị TỪ CHỐI)
    4. Thời gian xử lý trung bình (Ngày)
    """
    try:
        target_year, target_month = map(int, month.split('-'))
    except ValueError:
        return []

    # Get all completed tasks for the given month
    completed_tasks = db.query(ProjectTask).filter(
        ProjectTask.status == 'Hoàn thành',
        extract('year', ProjectTask.completion_date) == target_year,
        extract('month', ProjectTask.completion_date) == target_month,
        ProjectTask.assignee_id.isnot(None)
    ).all()

    # Get only 'staff' users, join with Employee to get full_name
    users_query = db.query(User, Employee).join(UserRole, UserRole.user_id == User.id)\
                                          .join(Role, Role.id == UserRole.role_id)\
                                          .outerjoin(Employee, Employee.user_id == User.id)\
                                          .filter(Role.role_name == 'staff').all()
    
    kpi_data = {}
    for u, emp in users_query:
        display_name = (emp.full_name if emp and emp.full_name else None) or u.username
        kpi_data[u.id] = {
            "employee": display_name,
            "total_completed": 0,
            "on_time_count": 0,
            "processing_time_days": 0,
            "valid_processing_time_count": 0
        }

    # Get rejections for these tasks
    rejections_query = db.query(
        ProjectTask.assignee_id,
        func.count(TaskSubmission.id)
    ).join(
        TaskSubmission, ProjectTask.id == TaskSubmission.task_id
    ).filter(
        extract('year', ProjectTask.completion_date) == target_year,
        extract('month', ProjectTask.completion_date) == target_month,
        TaskSubmission.result.ilike('%từ chối%')
    ).group_by(ProjectTask.assignee_id).all()
    
    rejections_map = {row[0]: row[1] for row in rejections_query}

    for task in completed_tasks:
        uid = task.assignee_id
        if not uid or uid not in kpi_data:
            continue
        
        data = kpi_data[uid]
        data["total_completed"] += 1
        
        if not task.is_overdue_flag:
            data["on_time_count"] += 1
            
        if task.completion_date and task.start_date:
            days = (task.completion_date - task.start_date).days
            if days >= 0:
                data["processing_time_days"] += days
                data["valid_processing_time_count"] += 1

    results = []
    for uid, data in kpi_data.items():
        total = data["total_completed"]
        on_time_rate = (data["on_time_count"] / total * 100) if total > 0 else 100
        avg_time = (data["processing_time_days"] / data["valid_processing_time_count"]) if data["valid_processing_time_count"] > 0 else 0
        rejections = rejections_map.get(uid, 0)
        
        if total == 0:
            score = 0
            performance = "Chưa đánh giá"
        else:
            score = 100
            # Target = 10
            if total > 10:
                score += (total - 10) * 2 # Bonus 2 points per extra task
            elif total < 10:
                score -= (10 - total) * 2 # Penalty 2 points per missing task
                
            if on_time_rate < 90:
                score -= (90 - on_time_rate) * 0.5  # slight penalty
                
            score -= (rejections * 5)
            
            score = min(max(round(score, 1), 0), 150)
            
            if score >= 95: performance = "Xuất sắc"
            elif score >= 80: performance = "Tốt"
            elif score >= 60: performance = "Khá"
            else: performance = "Cần cố gắng"

        results.append({
            "employee": data["employee"],
            "total_completed": total,
            "on_time_rate": round(on_time_rate, 1),
            "rejections": rejections,
            "avg_time": round(avg_time, 1),
            "final_score": score,
            "performance": performance
        })

    # Sort by score descending
    results.sort(key=lambda x: x["final_score"], reverse=True)
    return results
