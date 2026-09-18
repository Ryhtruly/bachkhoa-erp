import os
import sys

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
src_dir = os.path.join(backend_dir, "src")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

from sqlalchemy import text
from src.db.database import SessionLocal

def inspect_schema():
    db = SessionLocal()
    try:
        for t in ["service_packages", "task_types", "workflow_nodes", "task_nodes", "document_template_applicabilities"]:
            cols = db.execute(text(f"""
                select column_name, data_type, is_nullable, column_default
                from information_schema.columns
                where table_name = '{t}'
                order by ordinal_position;
            """)).mappings().all()
            print(f"\n--- Columns in {t} ---")
            for c in cols:
                print(f"  {c['column_name']} ({c['data_type']}) nullable={c['is_nullable']} default={c['column_default']}")
            
            fks = db.execute(text(f"""
                SELECT
                    tc.constraint_name, kcu.column_name,
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name 
                FROM 
                    information_schema.table_constraints AS tc 
                    JOIN information_schema.key_column_usage AS kcu
                      ON tc.constraint_name = kcu.constraint_name
                    JOIN information_schema.constraint_column_usage AS ccu
                      ON ccu.constraint_name = tc.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='{t}';
            """)).mappings().all()
            print(f"--- FKs in {t} ---")
            for f in fks:
                print(f"  {f['constraint_name']}: {f['column_name']} -> {f['foreign_table_name']}({f['foreign_column_name']})")
    finally:
        db.close()

if __name__ == "__main__":
    inspect_schema()

