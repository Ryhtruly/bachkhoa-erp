from datetime import datetime

def process_hanet_checkin(employee_id: str, timestamp: str) -> dict:
    """
    Process a check-in event from Hanet Face Recognition Camera.
    Determines if the employee is late.
    """
    # Assuming standard start time is 08:00 AM
    checkin_time = datetime.fromtimestamp(int(timestamp))
    start_time = checkin_time.replace(hour=8, minute=0, second=0)
    
    status = "Đúng giờ"
    if checkin_time > start_time:
        status = "Đi trễ"
        
    print(f"[HR Engine] Employee {employee_id} checked in at {checkin_time}. Status: {status}")
    
    # In a real app, write this to DATABASE_CHAM_CONG Excel sheet
    # excel_db.write_to_sheet("DATABASE_CHAM_CONG", {"ID": employee_id, "Time": checkin_time, "Status": status})
    
    return {
        "employee_id": employee_id,
        "checkin_time": checkin_time.strftime("%Y-%m-%d %H:%M:%S"),
        "status": status
    }
