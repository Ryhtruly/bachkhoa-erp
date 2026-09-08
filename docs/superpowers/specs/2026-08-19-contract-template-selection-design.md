# Contract Template Selection Design

## Goal

Allow each contract to use an explicitly selected, published DOCX template
stored in private S3-compatible object storage. Adding or revising a template
must not require an application deployment.

## Scope

- Store a selected `contract_templates` row on each contract.
- Register and publish the two DOCX files uploaded to MinIO.
- Render a contract from the template selected for that contract.
- Preserve a safe temporary fallback for pre-existing contracts that have no
  selected template yet.

## Data model

`contract_templates` remains the versioned template catalog. It is unique by
`(code, version)` and stores the private object key in
`template_storage_key`.

`contracts.contract_template_id` is a nullable foreign key to
`contract_templates.id`. It records the exact catalog row selected when the
contract is created. This makes template selection explicit and prevents an
unrelated newly published template from changing an existing contract's
rendering.

The release seeds or updates these published catalog rows:

| Code | Version | Private object key |
| --- | --- | --- |
| `HOP_DONG_DICH_VU_KHUNG_BACH_KHOA` | `1` | `contract-templates/HOP_DONG_DICH_VU_KHUNG_BACH_KHOA/v1.docx` |
| `MAU_HOP_DONG_DO_DAC_BACH_KHOA` | `1` | `contract-templates/MAU_HOP_DONG_DO_DAC_BACH_KHOA/v1.docx` |

Only templates whose status is `published` are selectable. Draft and archived
templates remain inaccessible to contract creation.

## Request and rendering flow

1. The contract-create request supplies `contract_template_id`.
2. The backend verifies that the referenced template exists and is published,
   then persists the foreign key with the contract.
3. The protected document endpoint loads the selected template, reads its
   `template_storage_key` from MinIO or Cloudflare R2 through the backend, and
   renders DOCX in memory.
4. A legacy contract without `contract_template_id` follows the existing
   fallback during the migration window; a later, separately approved cleanup
   can make template selection mandatory after backfilling old rows.

The browser never receives an object-storage credential or direct object URL.

## Migration and release order

1. An approved production operator confirms the Supabase project reference and
   reviews its linked migration history. The operator confirms
   `20260818120000_contract_template_storage_key.sql` comes before
   `20260819082921_contract_template_selection.sql`; no application database,
   `DATABASE_URL`, `TEST_DATABASE_URL`, or ad-hoc SQL DDL is used for this
   step.
2. Only after explicit production approval, the operator applies the
   project-approved migration command. The selection migration adds the
   nullable contract foreign key and index, and upserts the two catalog rows by
   `(code, version)`.
3. Immediately perform a read-only catalog query for the two listed codes and
   confirm exactly two `published` rows with their expected
   `template_storage_key` values. Release output never includes credentials.
4. Upload both DOCX files to private R2 using the exact immutable keys in the
   catalog, then prove the backend storage service can read each object before
   traffic cutover.
5. Deploy the backend that accepts and persists `contract_template_id`. With a
   `contract:read` and `contract:create` user, verify the catalog and protected
   document endpoints, create one contract per template, Save As each DOCX,
   open each with the in-app viewer, and verify the persisted selected ID.
6. Open one legacy null-ID contract and confirm the temporary transition
   fallback still renders.

## Validation

- Schema checks confirm the new foreign key and index exist.
- Database tests reject a draft or archived template ID.
- Service/route tests prove the selected template's private key is passed to
  the DOCX renderer.
- A MinIO integration smoke test reads both seeded object keys.
- The in-app DOCX viewer continues to render the protected document response.
