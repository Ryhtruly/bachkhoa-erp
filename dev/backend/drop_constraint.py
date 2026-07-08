import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from src.db.database import engine

def drop_constraint():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE projects_tasks DROP CONSTRAINT projects_tasks_contract_id_key;"))
            conn.commit()
            print("Successfully dropped constraint projects_tasks_contract_id_key")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    drop_constraint()
