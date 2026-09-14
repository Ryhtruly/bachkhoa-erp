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
from src.core.redis_utils import invalidate_cache

def main():
    db = SessionLocal()
    try:
        # 1. Update workflow_nodes: deactivate capability rows so they never appear in catalog
        res = db.execute(text("""
            UPDATE public.workflow_nodes
            SET is_active = false
            WHERE code IN ('STANDARD', 'SURVEY_FIELD', 'SURVEY_CAD', 'LEGAL_PREP', 'GOV_SUBMISSION', 'HANDOVER')
        """))
        db.commit()
        print(f"Deactivated {res.rowcount} capability nodes in workflow_nodes.")

        # 2. Clear Redis caches
        try:
            invalidate_cache("bachkhoa:catalog:workflow_nodes")
            invalidate_cache("/api/contracts/workflow/catalog*")
            invalidate_cache("/api/document-register/workflow-nodes*")
            print("Cleared Redis catalog caches.")
        except Exception as e:
            print(f"Redis cache clear warning: {e}")

    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    main()

