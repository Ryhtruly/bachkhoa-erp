import sys
import uuid
import datetime
sys.path.append('d:/Downloads/cty/BachKhoa/dev/backend')

from src.db.database import SessionLocal
from src.db.models import ProjectTask, Contract, Customer, User

db = SessionLocal()

# Ensure we have at least one user
admin = db.query(User).first()
if not admin:
    admin = User(id=str(uuid.uuid4()), email="admin@test.com", username="admin", password_hash="x")
    db.add(admin)
    db.commit()
    db.refresh(admin)

# Update existing tasks with some dummy data for the new columns
tasks = db.query(ProjectTask).all()
for t in tasks:
    if not t.department:
        t.department = "Kỹ thuật"
    if not t.priority:
        t.priority = "Cao"
    if not t.assignee_id:
        t.assignee_id = admin.id
    if not t.deadline:
        t.deadline = datetime.date.today() + datetime.timedelta(days=2)

db.commit()
print("Seeded new fields for existing ProjectTasks")
