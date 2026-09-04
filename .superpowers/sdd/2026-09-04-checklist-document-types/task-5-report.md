# Task 5 Report: Serialize runtime types and gate the shared Tủ hồ sơ

## Status

Implemented against base HEAD `906574e1074ff8ccc9064ba195d70e46d61f6973`.

## Impact and scope

- Codebase graph tracing reports CRITICAL impact for `EmployeePortalService.build_profile`: direct route callers are `get_my_employee_profile` and `get_employee_profile`.
- The stale graph has no `register.py` cabinet symbol, matching the task brief. Review therefore used the authorized path scope for `_CHECKLIST_CABINET_QUERY`, `checklist_cabinet_by_node`, and the `get_register` response field.
- No frontend, `documents.py`, or `routes_document_register.py` changes are included in the Task 5 commit.

## Implementation

- Employee profile checklist serialization now loads all active runtime types for all returned checklist IDs in one query and all active files in one query.
- Every type returns its persisted identity/configuration, runtime status and rejection reason, source label, all active file metadata, and exact `file_count`.
- `document_type_progress` counts a type only when it is approved and has at least one active file; an empty checklist is not complete.
- `checklist_cabinet_by_node` reads the runtime type/file tables directly. A grouped completion CTE admits a checklist only when it is non-empty and every active type is approved with an active file.
- Completed cabinet rows retain every active type and aggregate every active file. Existing type, file, promoted-template, and slot objects are referenced by ID; no storage object is copied.
- `get_register` exposes these rows through the shared `checklist_cabinet_by_node` field used by both cabinet consumers.

## TDD evidence

RED command:

```bash
PYTHONPATH=. ./venv/bin/python -m unittest \
  tests.test_checklist_document_types_unittest.EmployeeProfileDocumentTypeSerializationTests.test_profile_returns_every_active_type_file_and_progress_in_two_batched_queries \
  tests.test_dossier_documents_unittest.TuHoSoTheoChecklistTests.test_an_checklist_99_phan_tram_va_tra_du_moi_tep_cua_checklist_100_phan_tram \
  tests.test_dossier_documents_unittest.TuHoSoTheoChecklistTests.test_get_register_exposes_the_completed_checklists_through_the_shared_field -v
```

Observed before implementation: two errors. Profile serialization failed with `KeyError: 'document_types'`; cabinet serialization failed with `KeyError: 'document_id'` because the baseline expected one latest flat file. The shared response-field assertion already passed against the authorized dirty baseline.

Focused GREEN: the same three tests passed after implementation (`Ran 3 tests ... OK`). The profile fixture contains two checklist IDs, a rejected three-file type, and an approved type; it asserts exactly one batched type query and one batched file query with both checklist IDs.

## Verification evidence

```bash
PYTHONPATH=. ./venv/bin/python -m unittest \
  tests.test_checklist_document_types_unittest \
  tests.test_dossier_documents_unittest \
  tests.test_service_line_register_scope \
  tests.test_employee_portal_queries -v
```

Result: `Ran 145 tests ... OK (skipped=22)`. The 22 skips are database/schema-dependent checks; the configured local database does not contain the required dossier tables.

```bash
./venv/bin/python -m py_compile \
  src/employee_portal/service.py \
  src/dossiers/register.py \
  tests/test_checklist_document_types_unittest.py \
  tests/test_dossier_documents_unittest.py
```

Result: exit 0.

The requested aggregate pytest run could not collect because `TEST_DATABASE_URL` is unset; the harness intentionally refuses to use `DATABASE_URL` as a fallback. No unsafe database fallback was used.

## Self-review and diff evidence

- Confirmed profile query cardinality is constant with checklist count: one runtime-type query plus one runtime-file query.
- Confirmed the cabinet CTE is scoped to the requested service line, requires `count(*) > 0`, and gates with `bool_and(review_status = 'approved' and file_count > 0)`.
- Confirmed the cabinet query has no latest-file `limit 1` and uses `count(distinct d.id)` plus JSON aggregation of all active files.
- Removed a stale unreachable fallback branch found during review after the completion CTE made partial statuses impossible.
- Final staged-diff review is path-scoped because GitNexus `detect_changes()` is unavailable in this session. The commit is limited to the two backend implementation files, their two scoped test files, and this report.
- Staged diff: 5 files, 571 insertions, 34 deletions. The pre-existing `GanGiayThoVaoChecklistTests` hunk and all unrelated backend/frontend baseline changes remain unstaged.

Commit message: `feat(dossier): publish only completed checklists to cabinet`.
