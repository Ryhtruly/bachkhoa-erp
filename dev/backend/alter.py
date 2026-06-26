import sys
import os
sys.path.append('d:/Downloads/cty/BachKhoa/dev/backend')

from src.db.database import engine
from sqlalchemy import text

with engine.begin() as conn:
    try:
        conn.execute(text("ALTER TABLE projects_tasks ADD COLUMN department VARCHAR"))
    except Exception as e:
        print(e)
        
    try:
        conn.execute(text("ALTER TABLE projects_tasks ADD COLUMN priority VARCHAR DEFAULT 'Trung bình'"))
    except Exception as e:
        print(e)
        
    try:
        conn.execute(text("ALTER TABLE projects_tasks ADD COLUMN support_id VARCHAR"))
    except Exception as e:
        print(e)

print("Altered table projects_tasks successfully!")
