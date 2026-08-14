import os
import sys
from sqlalchemy import text

# Add dev/backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), ".")))

from src.db.database import engine

def apply_sql_file(file_path):
    print(f"\n==========================================")
    print(f"Applying migration: {file_path}")
    print(f"==========================================")
    with open(file_path, "r", encoding="utf-8") as f:
        sql = f.read()

    with engine.connect() as conn:
        with conn.begin():
            conn.execute(text(sql))
    print(f"-> SUCCESS: {os.path.basename(file_path)}")

def verify_receivables():
    print("\n--- Verifying table `receivables` ---")
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'receivables'
            ORDER BY ordinal_position;
        """)).mappings().all()
        for row in result:
            print(f"  {row['column_name']:<25} {row['data_type']:<25} Nullable: {row['is_nullable']}")

if __name__ == "__main__":
    migration_m1 = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "supabase", "migrations", "20260814120000_accounting_receivables_debt_status.sql"))
    apply_sql_file(migration_m1)
    verify_receivables()
