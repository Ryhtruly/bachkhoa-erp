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

MIGRATION_SQL = """
-- 0. Nới rộng độ dài mã node từ VARCHAR(10) lên VARCHAR(50)
ALTER TABLE public.task_nodes ALTER COLUMN node_code TYPE VARCHAR(50);
ALTER TABLE public.workflow_nodes ALTER COLUMN code TYPE VARCHAR(50);

-- 1. Bổ sung các cột phân loại và quản trị danh mục cho service_packages và task_types
ALTER TABLE public.service_packages 
ADD COLUMN IF NOT EXISTS category_type VARCHAR(30) NOT NULL DEFAULT 'GENERAL';

UPDATE public.service_packages SET category_type = 'SURVEY' WHERE id = 'sp_001';
UPDATE public.service_packages SET category_type = 'LEGAL' WHERE id = 'sp_002';
UPDATE public.service_packages SET category_type = 'CONSTRUCTION' WHERE id = 'sp_003';

ALTER TABLE public.task_types 
ADD COLUMN IF NOT EXISTS category_type VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
ADD COLUMN IF NOT EXISTS display_order INT NULL DEFAULT 100,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. Nạp 6 Năng Lực Chuẩn vào workflow_nodes trước để làm từ điển năng lực
INSERT INTO public.workflow_nodes (code, name, description, is_active) VALUES
  ('STANDARD', 'Tác nghiệp tiêu chuẩn', 'Checklist công việc và upload file minh chứng thông thường', true),
  ('SURVEY_FIELD', 'Khảo sát & Đo đạc thực địa', 'Đo đạc hiện trường, cho phép thợ phụ, tự động tạo Hồ sơ Đo vẽ', true),
  ('SURVEY_CAD', 'Biên tập bản vẽ & Kỹ thuật', 'Xử lý toạ độ GPS, biên tập bản đồ, kế thừa dữ liệu đo thực địa', true),
  ('LEGAL_PREP', 'Soạn thảo hồ sơ pháp lý', 'Rà soát giấy tờ, soạn đơn từ, tự động tạo Hồ sơ Pháp lý', true),
  ('GOV_SUBMISSION', 'Nộp & Theo dõi Một Cửa', 'Nộp cơ quan nhà nước, theo dõi mã biên nhận và giấy hẹn trả kết quả', true),
  ('HANDOVER', 'Bàn giao & Quyết toán', 'Bàn giao sản phẩm cho khách, đối soát công nợ kế toán trước khi đóng việc', true)
ON CONFLICT (code) DO UPDATE SET 
  name = EXCLUDED.name, 
  description = EXCLUDED.description, 
  is_active = true;

-- 3. Mở rộng task_nodes: Thêm cột name (tên tự do) và capability_code (năng lực)
ALTER TABLE public.task_nodes 
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS capability_code VARCHAR(50);

-- Đổ dữ liệu lịch sử từ workflow_nodes cũ sang task_nodes
UPDATE public.task_nodes n
SET 
  name = COALESCE(n.name, wn.name, 'Bước tác nghiệp'),
  capability_code = CASE UPPER(TRIM(COALESCE(n.node_code, '')))
    WHEN 'K01' THEN 'STANDARD'
    WHEN 'K02' THEN 'SURVEY_FIELD'
    WHEN 'K03' THEN 'SURVEY_CAD'
    WHEN 'K04' THEN 'LEGAL_PREP'
    WHEN 'K05A' THEN 'STANDARD'
    WHEN 'K05B' THEN 'GOV_SUBMISSION'
    WHEN 'K05' THEN 'GOV_SUBMISSION'
    WHEN 'K06' THEN 'HANDOVER'
    WHEN 'K07' THEN 'STANDARD'
    ELSE 'STANDARD'
  END
FROM public.workflow_nodes wn
WHERE wn.code = n.node_code AND (n.name IS NULL OR n.capability_code IS NULL);

UPDATE public.task_nodes SET name = 'Bước tác nghiệp' WHERE name IS NULL;
UPDATE public.task_nodes SET capability_code = 'STANDARD' WHERE capability_code IS NULL;

ALTER TABLE public.task_nodes 
ALTER COLUMN name SET NOT NULL,
ALTER COLUMN capability_code SET NOT NULL;

-- 4. Chuyển đổi JSON graph của templates và revisions sang chuẩn Capability & Name
UPDATE public.workflow_templates t
SET graph = jsonb_set(t.graph, '{nodes}', (
  SELECT jsonb_object_agg(
    e.key,
    e.value || jsonb_build_object(
      'name', COALESCE(e.value->>'name', 'Bước quy trình'),
      'capability', 
      CASE UPPER(TRIM(COALESCE(e.value->>'task_code', e.value->>'capability', '')))
        WHEN 'K01' THEN 'STANDARD'
        WHEN 'K02' THEN 'SURVEY_FIELD'
        WHEN 'K03' THEN 'SURVEY_CAD'
        WHEN 'K04' THEN 'LEGAL_PREP'
        WHEN 'K05A' THEN 'STANDARD'
        WHEN 'K05B' THEN 'GOV_SUBMISSION'
        WHEN 'K05' THEN 'GOV_SUBMISSION'
        WHEN 'K06' THEN 'HANDOVER'
        WHEN 'K07' THEN 'STANDARD'
        ELSE COALESCE(e.value->>'capability', 'STANDARD')
      END
    )
  )
  FROM jsonb_each(t.graph->'nodes') e
))
WHERE jsonb_typeof(t.graph->'nodes') = 'object';

-- 5. Cập nhật bảng document_template_applicabilities (Giải phóng khỏi khoá cứng K)
ALTER TABLE public.document_template_applicabilities
ADD COLUMN IF NOT EXISTS capability_code VARCHAR(50) NULL REFERENCES public.workflow_nodes(code);

UPDATE public.document_template_applicabilities
SET capability_code = CASE UPPER(TRIM(COALESCE(node_code, '')))
  WHEN 'K01' THEN 'STANDARD'
  WHEN 'K02' THEN 'SURVEY_FIELD'
  WHEN 'K03' THEN 'SURVEY_CAD'
  WHEN 'K04' THEN 'LEGAL_PREP'
  WHEN 'K05A' THEN 'STANDARD'
  WHEN 'K05B' THEN 'GOV_SUBMISSION'
  WHEN 'K06' THEN 'HANDOVER'
  WHEN 'K07' THEN 'STANDARD'
  ELSE NULL
END
WHERE capability_code IS NULL AND node_code IS NOT NULL;

-- Tháo ràng buộc Foreign Key cứng node_code cũ để không cản trở Combo mới
ALTER TABLE public.document_template_applicabilities 
ALTER COLUMN node_code DROP NOT NULL;
"""

def execute_migration():
    db = SessionLocal()
    try:
        print("Starting transaction for migration 20260914...")
        db.execute(text(MIGRATION_SQL))
        db.commit()
        print("[SUCCESS] Migration executed and committed successfully!")

        # Verification
        print("\n=== VERIFICATION ===")
        # Check service_packages
        pkgs = db.execute(text("SELECT id, name, category_type, is_active FROM public.service_packages ORDER BY id")).mappings().all()
        print("1. Service Packages with category_type:")
        for p in pkgs:
            print("  ", dict(p))

        # Check task_nodes
        nodes = db.execute(text("SELECT id, node_code, capability_code, name FROM public.task_nodes LIMIT 5")).mappings().all()
        print("\n2. Sample task_nodes with capability_code & name:")
        for n in nodes:
            print("  ", dict(n))

        # Check workflow_nodes capabilities
        caps = db.execute(text("SELECT code, name FROM public.workflow_nodes WHERE code IN ('STANDARD', 'SURVEY_FIELD', 'SURVEY_CAD', 'LEGAL_PREP', 'GOV_SUBMISSION', 'HANDOVER')")).mappings().all()
        print(f"\n3. Standard Capabilities in workflow_nodes ({len(caps)}):")
        for c in caps:
            print("  ", dict(c))

        # Check document_template_applicabilities
        dta = db.execute(text("SELECT count(*) as total, count(capability_code) as with_cap FROM public.document_template_applicabilities")).mappings().first()
        print("\n4. Document Template Applicabilities:")
        print("  ", dict(dta))

    except Exception as e:
        db.rollback()
        print(f"[FAILED] Migration rolled back due to error: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    execute_migration()

