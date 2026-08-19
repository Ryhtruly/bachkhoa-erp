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

1. Apply the existing storage-key migration.
2. Apply a follow-up migration that adds the nullable contract foreign key and
   indexes it, then upserts the two template catalog rows by `(code, version)`.
3. Verify both referenced objects are readable from the configured storage
   backend.
4. Deploy the backend that accepts and persists `contract_template_id`.
5. Verify a new contract renders from its selected template and a legacy
   contract still opens during the transition.

## Validation

- Schema checks confirm the new foreign key and index exist.
- Database tests reject a draft or archived template ID.
- Service/route tests prove the selected template's private key is passed to
  the DOCX renderer.
- A MinIO integration smoke test reads both seeded object keys.
- The in-app DOCX viewer continues to render the protected document response.
