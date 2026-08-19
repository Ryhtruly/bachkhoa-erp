# Deploy contract templates on Cloudflare R2

## 1. Create one private bucket in Cloudflare

Create `bachkhoa-erp-files`. Do not attach a public bucket policy. The ERP separates domains by private object-key prefixes: `wiki/`, `finance/`, `contract-templates/`, `workflow-evidence/`, and `avatars/`.

## 2. Configure the ERP backend

Set these production environment variables from the Cloudflare R2 S3 API credentials. Do not commit their values.

```dotenv
OBJECT_STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
OBJECT_STORAGE_ACCESS_KEY=<r2-access-key-id>
OBJECT_STORAGE_SECRET_KEY=<r2-secret-access-key>
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_CREATE_BUCKETS=false
OBJECT_STORAGE_ALLOW_PUBLIC_BUCKETS=false
OBJECT_STORAGE_BUCKET=bachkhoa-erp-files
```

These variables take precedence over the legacy `MINIO_*` values. MinIO remains the local Docker development default when `OBJECT_STORAGE_ENDPOINT` is unset.

## 3. Production preflight and migration gate

This is an operator-only production procedure. Before any migration command,
identify the intended Supabase project reference in the dashboard and confirm
that it is the project linked by the CLI. Then review the linked migration
history:

```powershell
npx supabase link --project-ref <approved-project-ref>
npx supabase migration list --linked
```

Confirm that `20260818120000_contract_template_storage_key.sql` is applied
before `20260819082921_contract_template_selection.sql`, and that there are no
unexpected pending migrations. Do not use `DATABASE_URL`, `TEST_DATABASE_URL`,
or ad-hoc SQL DDL to apply these changes.

Obtain explicit production-operator approval after this review. Only the
approved operator may then run the project-approved migration command:

```powershell
npx supabase db push --linked
```

Immediately after the migration, run this read-only query in the selected
Supabase project's SQL editor or other approved read-only query tool. Do not
copy credentials into command output or release notes.

```sql
select code, version, status, template_storage_key
from public.contract_templates
where code in ('HOP_DONG_DICH_VU_KHUNG_BACH_KHOA', 'MAU_HOP_DONG_DO_DAC_BACH_KHOA')
order by code, version;
```

Expected result: exactly two `published` catalog rows, each with its immutable
private object key.

## 4. Upload both private templates before switching traffic

Run these commands from `dev/backend` with the production R2 variables loaded.
The resulting keys must exactly match the two published catalog rows. Do not
overwrite an existing immutable versioned key.

```powershell
& .\.venv\Scripts\python.exe .\scripts\bootstrap_contract_template.py .\src\templates\mau_hop_dong.docx contract-templates/HOP_DONG_DICH_VU_KHUNG_BACH_KHOA/v1.docx
& .\.venv\Scripts\python.exe .\scripts\bootstrap_contract_template.py .\src\templates\Mau_Hop_Dong_Do_Dac_Bach_Khoa.docx contract-templates/MAU_HOP_DONG_DO_DAC_BACH_KHOA/v1.docx
```

Keep the bucket private; the key is not a public URL. Verify each returned key
is readable through the backend storage service before sending application
traffic to R2.

## 5. Verify before traffic cutover

- Confirm the bucket remains private in Cloudflare.
- Use an account with `contract:read` and `contract:create` to check the
  template catalog endpoint and protected document endpoint.
- Create one contract for each published template, choose Save As in the
  existing DOCX flow, and confirm the database contract records the selected
  template ID.
- Use **Mở tài liệu** for both documents; confirm the protected endpoint returns
  DOCX and the existing in-app viewer renders it.
- Open one pre-existing contract with a null template ID and confirm the
  transition fallback still renders.
- Confirm backend logs never contain R2 credentials.

## Ongoing template updates

Upload a new DOCX to a new immutable `contract-templates/.../vN.docx` key, then update/publish the corresponding template metadata row. Do not overwrite a key used by an issued contract. The application needs no redeploy for a template-content change.
