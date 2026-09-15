import os
import sys
import json
from datetime import datetime

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
src_dir = os.path.join(backend_dir, "src")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

from sqlalchemy import text
from src.db.database import SessionLocal

TABLES_TO_BACKUP = [
    "service_packages",
    "task_types",
    "workflow_nodes",
    "task_nodes",
    "workflow_templates",
    "workflow_instance_revisions",
    "document_template_applicabilities",
]

def backup_data():
    db = SessionLocal()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = os.path.join(backend_dir, "backups")
    os.makedirs(backup_dir, exist_ok=True)
    json_path = os.path.join(backup_dir, f"backup_pre_migration_{timestamp}.json")

    full_backup = {}

    try:
        print("=== 1. CREATING IN-DATABASE BACKUP TABLES ===")
        for table in TABLES_TO_BACKUP:
            backup_table_name = f"backup_{timestamp}_{table}"
            # Create physical backup table in Postgres
            db.execute(text(f"CREATE TABLE public.{backup_table_name} AS SELECT * FROM public.{table};"))
            db.commit()
            
            # Count rows
            count = db.execute(text(f"SELECT count(*) FROM public.{backup_table_name}")).scalar()
            print(f"  [OK] Created {backup_table_name} ({count} rows)")

        print("\n=== 2. EXPORTING JSON BACKUP TO DISK ===")
        for table in TABLES_TO_BACKUP:
            rows = db.execute(text(f"SELECT * FROM public.{table}")).mappings().all()
            # Convert values to JSON-serializable
            serializable_rows = []
            for r in rows:
                row_dict = dict(r)
                for k, v in row_dict.items():
                    if hasattr(v, "isoformat"):
                        row_dict[k] = v.isoformat()
                serializable_rows.append(row_dict)
            full_backup[table] = serializable_rows
            print(f"  [OK] Exported {table}: {len(serializable_rows)} records")

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(full_backup, f, ensure_ascii=False, indent=2)
        print(f"\n[SUCCESS] File backup saved to: {json_path}")

    except Exception as e:
        db.rollback()
        print(f"[ERROR] Backup failed: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    backup_data()

