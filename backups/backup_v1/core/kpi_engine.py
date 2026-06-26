from src.services import excel_adapter as excel_db

def calculate_employee_kpi(month: str) -> dict:
    """
    Scan DATABASE_TASK and calculate KPI scores.
    Points:
    - Hoàn thành đúng hạn: +10 pts
    - Hoàn thành trễ hạn: +5 pts
    - Quá hạn chưa xong: -5 pts
    """
    tasks = excel_db.read_sheet("DATABASE_TASK")
    
    kpi_scores = {}
    
    for task in tasks:
        # Assuming task has 'Người nhận', 'Trạng thái', 'Quá hạn?'
        assignee = str(task.get("Người nhận", "")).strip()
        if not assignee:
            continue
            
        status = str(task.get("Trạng thái", "")).strip()
        is_overdue = str(task.get("Quá hạn?", "")).strip()
        
        if assignee not in kpi_scores:
            kpi_scores[assignee] = {"total_tasks": 0, "score": 100, "details": []}
            
        kpi_scores[assignee]["total_tasks"] += 1
        
        if status == "Hoàn thành":
            if is_overdue == "Có":
                kpi_scores[assignee]["score"] += 5
                kpi_scores[assignee]["details"].append(f"Hoàn thành trễ: {task.get('Mã task')}")
            else:
                kpi_scores[assignee]["score"] += 10
        elif is_overdue == "Có":
            kpi_scores[assignee]["score"] -= 5
            kpi_scores[assignee]["details"].append(f"Đang quá hạn: {task.get('Mã task')}")
            
    # Normalize score (cap at 150 for example)
    for emp, data in kpi_scores.items():
        if data["score"] > 150: data["score"] = 150
        if data["score"] < 0: data["score"] = 0
        
    return kpi_scores
