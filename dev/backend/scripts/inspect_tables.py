import os
import sys

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
src_dir = os.path.join(backend_dir, "src")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

from sqlalchemy import text
from src.db.database import SessionLocal, Base
import src.db.models

def inspect_db():
    db = SessionLocal()
    try:
        tables = [r[0] for r in db.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).fetchall()]
        tables = sorted(tables)
        print(f"Total physical tables in Supabase public schema: {len(tables)}")
        for t in tables:
            print(f"  - {t}")
        
        mapped = sorted([mapper.class_.__tablename__ for mapper in Base.registry.mappers])
        print(f"\nTotal SQLAlchemy mapped models: {len(mapped)}")
        for m in mapped:
            print(f"  - {m}")
            
        unmapped = set(tables) - set(mapped)
        print(f"\nUnmapped tables in DB ({len(unmapped)}): {sorted(list(unmapped))}")
    finally:
        db.close()

if __name__ == "__main__":
    inspect_db()
