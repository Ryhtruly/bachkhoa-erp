# Handoff: Fix tao mau giay to moi

## 1. Muc tieu

Sua loi khi bam **+ Them** trong modal **Thiet lap mau giay to moi** cua phan **Document Register**.

Hanh vi hien tai:

- Frontend mo modal va cho phep bam nut `+ Them`.
- Request da toi backend:
  - `POST /api/document-register/templates`
- Backend tra loi loi database, mau giay to khong duoc tao.

Khong sua UI theo huong moi. Loi hien tai nam o backend va cau hinh `ON CONFLICT`.

## 2. Bang chung da xac minh

Log backend local ghi:

```text
POST /api/document-register/templates -> EXCEPTION
psycopg2.errors.InvalidColumnReference:
there is no unique or exclusion constraint matching the ON CONFLICT specification
```

SQL dang loi trong:

```text
dev/backend/src/dossiers/register.py
```

Doan dang dung:

```sql
on conflict (coalesce(task_type_id, '~chung~'), name) do update
```

Database ma backend dev dang ket noi co index hien tai:

```text
CREATE UNIQUE INDEX document_checklist_templates_unique
ON public.document_checklist_templates
USING btree (
  COALESCE(task_type_id, '~chung~'),
  lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')),
  source
)
WHERE is_identity_owner
```

Index nay duoc tao boi migration:

```text
supabase/migrations/20260904100000_document_template_identity.sql
```

Ket luan: migration database da doi quy tac identity, nhung cau SQL upsert trong backend van dung quy tac unique cu.

## 3. Nguyen nhan goc

`ON CONFLICT` cua PostgreSQL phai suy ra duoc mot unique index phu hop.

Code hien tai conflict tren:

```text
COALESCE(task_type_id, '~chung~') + name
```

Index hien tai conflict tren:

```text
COALESCE(task_type_id, '~chung~')
+ lower(regexp_replace(btrim(name), whitespace normalization))
+ source
WHERE is_identity_owner
```

Hai dinh danh khong trung khop nen PostgreSQL khong cho phep insert/upsert.

## 4. File can doc truoc khi sua

```text
dev/backend/src/dossiers/register.py
dev/backend/src/routes/routes_document_register.py
supabase/migrations/20260824094000_so_giay_to_ho_so.sql
supabase/migrations/20260904100000_document_template_identity.sql
dev/frontend/src/features/document-register/DocumentTemplateSettings.jsx
dev/frontend/src/features/document-register/TemplateFormModal.jsx
```

Frontend submit payload duoc goi tu:

```text
dev/frontend/src/features/document-register/DocumentTemplateSettings.jsx
```

Modal nhap lieu nam o:

```text
dev/frontend/src/features/document-register/TemplateFormModal.jsx
```

Route backend nam o:

```text
dev/backend/src/routes/routes_document_register.py
```

## 5. Huong xu ly de xuat

### 5.1. Khong sua migration da chay

Khong sua lich su migration `20260904100000_document_template_identity.sql` de chua index.

Khong drop/recreate index tren production bang tay neu chua co ke hoach va backup.

Van de hien tai la code backend can tuong thich voi schema moi.

### 5.2. Sua ham upsert

Trong `upsert_template` cua:

```text
dev/backend/src/dossiers/register.py
```

Can dong bo `ON CONFLICT` voi identity moi:

- Scope: `coalesce(task_type_id, '~chung~')`
- Ten: normalize whitespace va lowercase nhu migration
- `source`
- Chi ap dung cho row `is_identity_owner = true`

Can kiem tra cach PostgreSQL suy ra partial unique index voi dieu kien `is_identity_owner`.
Neu dung `ON CONFLICT (...) WHERE is_identity_owner`, dieu kien phai trung voi predicate cua index.

Co the can can nhac thiet ke SQL ro rang hon neu `ON CONFLICT` khong ho tro duoc expression/predicate theo cach dang dung.

Yeu cau nghiep vu:

- Tao moi mau giay to voi cung scope + ten + source phai upsert dung row canonical.
- Khac `source` thi duoc ton tai mau rieng.
- Khac hoa thuong hoac khoang trang thua thi duoc normalize theo migration.
- Khong lam mat cac row lich su dang duoc workflow revision tham chieu.
- Khong tu y xoa row trung lich su.

### 5.3. Kiem tra edit

Nhanh sua hien tai:

- Neu payload co `id`, code dung `UPDATE ... WHERE id = :id`.
- Khong thay doi hanh vi edit neu khong can.

Can test them tao moi va upsert trung identity.

## 6. Moi truong kiem tra

Dang lam tren local:

```text
branch: fix/backend-errors
compose: docker-compose.dev.yml
frontend: http://127.0.0.1:3000
backend: http://127.0.0.1:8080
```

Khoi dong:

```bash
cd /Users/macos/WIFIM/bachkhoa-erp

docker compose -f docker-compose.dev.yml up -d --build
```

Xem log:

```bash
docker compose -f docker-compose.dev.yml logs --tail=200 backend
```

Kiem tra index qua dung engine backend dang dung, khong dung nham `pg-test`:

```bash
docker compose -f docker-compose.dev.yml exec -T backend python -c "from sqlalchemy import text; from src.db.database import engine; rows=engine.connect().execute(text(\"select indexname, indexdef from pg_indexes where tablename='document_checklist_templates' order by indexname\")).all(); print('\\n'.join(f'{r[0]} | {r[1]}' for r in rows))"
```

Luu y: `pg-test` la database phuc vu pytest. Backend dev co the dang dung `DATABASE_URL` trong `dev/backend/.env`, nen khong duoc dung ket qua cua `pg-test` de ket luan schema ung dung.

## 7. Cach test chuc nang

### Test qua UI

1. Mo `http://127.0.0.1:3000`.
2. Dang nhap tai khoan co quyen `workflow.approve`.
3. Mo phan Document Register / Mau giay to.
4. Bam tao mau moi.
5. Nhap ten toi thieu 3 ky tu.
6. Chon it nhat mot pham vi, hoac chon `Moi goi`.
7. Bam `+ Them`.
8. Xac nhan modal dong va danh sach co mau moi.
9. Thu tao lai cung scope + ten + source de kiem tra upsert khong loi.
10. Thu cung ten nhung khac source de xac nhan duoc tao row logic khac.

### Test API

Khong ghi token hoac secret vao tai lieu/terminal log. Co the test qua UI de frontend tu gan token.

Can quan sat:

```text
POST /api/document-register/templates -> 200
GET /api/document-register/templates -> 200
```

Khong con:

```text
InvalidColumnReference
there is no unique or exclusion constraint matching the ON CONFLICT specification
```

## 8. Test regression bat buoc

Frontend:

```bash
docker compose -f docker-compose.dev.yml exec -T frontend npm run build
docker compose -f docker-compose.dev.yml exec -T frontend npm test -- --run src/features/document-register/DocumentTemplateSettings.test.jsx
docker compose -f docker-compose.dev.yml exec -T frontend npm test -- --run src/App.sidebar.test.jsx
```

Backend: chay test lien quan den document register neu project co test tuong ung. It nhat can:

- syntax check backend
- test route upsert template
- test identity normalization
- test duplicate scope/name/source
- test same name khac source

Truoc commit:

```bash
git diff --check
git status --short --branch
```

## 9. Tieu chi hoan thanh

- [ ] Tao mau moi qua UI thanh cong.
- [ ] API POST tra HTTP 200.
- [ ] Danh sach mau tai lai va hien row moi.
- [ ] Tao trung identity khong tao duplicate ngoai y muon.
- [ ] Khac source tao duoc identity rieng.
- [ ] Normalize ten dung theo migration.
- [ ] Khong sua/xoa migration da chay.
- [ ] Khong lam mat row lich su.
- [ ] Build frontend pass.
- [ ] Test document register pass.
- [ ] Khong commit `.env`, token, password, private key.
- [ ] Chi push branch `fix/backend-errors`, khong push `main` truc tiep.

## 10. Pham vi deploy

Sau khi sua va test local:

```bash
git add dev/backend/src/dossiers/register.py <test-files>
git commit -m "Fix document template upsert identity"
git push -u origin fix/backend-errors
```

Chua merge vao `main` cho toi khi nguoi review xac nhan:

- SQL tuong thich unique index moi.
- Test duplicate identity pass.
- Khong co tac dong bat ngo toi production.

Workflow production chi deploy khi code vao `main` theo cau hinh hien tai.

## 11. Ghi chu ve MCP

Lan kiem tra truoc duoc thuc hien read-only qua SQLAlchemy engine trong container backend, la connection ma backend dang dung trong local.

Khong su dung Supabase MCP rieng. Ket qua index duoc doc truc tiep tu database ung dung ma backend ket noi, khong phai tu `pg-test`.
