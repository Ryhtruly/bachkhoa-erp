from sqlalchemy.orm import Session
from src.db.models import ProjectTask, Employee, KpiPayroll
from datetime import datetime

def calculate_employee_kpi(db: Session, month: str) -> dict:
    """
    Scan ProjectTask and calculate KPI scores.
    Points:
    - Hoàn thành đúng hạn: +10 pts
    - Hoàn thành trễ hạn: +5 pts
    - Quá hạn chưa xong: -5 pts
    """
    # Simply get all tasks (in a real scenario filter by month)
    tasks = db.query(ProjectTask).all()
    
    kpi_scores = {}
    
    for task in tasks:
        if not task.assignee_id:
            continue
            
        assignee = task.assignee_id
        status = task.status or ""
        
        # Determine if overdue
        is_overdue = False
        if task.deadline and task.deadline < datetime.now().date():
            is_overdue = True
            
        if assignee not in kpi_scores:
            kpi_scores[assignee] = {"total_tasks": 0, "score": 100, "details": []}
            
        kpi_scores[assignee]["total_tasks"] += 1
        
        if status == "Hoàn thành":
            if is_overdue:
                kpi_scores[assignee]["score"] += 5
                kpi_scores[assignee]["details"].append(f"Hoàn thành trễ: {task.id}")
            else:
                kpi_scores[assignee]["score"] += 10
        elif is_overdue:
            kpi_scores[assignee]["score"] -= 5
            kpi_scores[assignee]["details"].append(f"Đang quá hạn: {task.id}")
            
    # Normalize score (cap at 150 for example)
    for emp, data in kpi_scores.items():
        if data["score"] > 150: data["score"] = 150
        if data["score"] < 0: data["score"] = 0
        
    return kpi_scores
