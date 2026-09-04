# Task 4 report — Submit, review by type, return intact, and promote at 100%

Date: 2026-09-04

Base HEAD: `263f83c36b23ef334b6f4a21ec96b8f4dcc1e697`

Commit subject: `feat(workflow): review document types and promote at completion`

## Result

Status: COMPLETE.

- The existing employee **Nộp nghiệm thu** operation now validates and submits
  runtime document types in the same transaction; no second proposal-submit cycle
  or endpoint was added.
- Submission rejects every active type without an active file. When validation
  succeeds, one locked writable CTE moves `draft` and `rejected` types to
  `pending_review`, clears old review metadata, and preserves `approved` types.
- A director can review one active type only while its node is `submitted`.
  Approval requires an active file; rejection requires a nonblank reason.
- Rejection writes the exact type reason into the established
  `NODE_REVIEW_COMPLETED` notification payload and delegates the node return to
  `review_task_node_acceptance`. The existing checklist-failure, acceptance,
  event, waiver, and notification path is reused. No type or file row is deleted.
- Node acceptance now requires every active runtime type to be approved with a
  file. An empty runtime-type set remains neutral for rollout compatibility.
- Reaching 100% on a checklist materializes official service-line slots and
  dossier/checklist document links without creating or copying storage objects.
  The official checklist links inherit the director's approved state, reviewer,
  and timestamp so the legacy document gate cannot re-block an approved type.
- Only `EMPLOYEE_CREATED` types are learned as templates. Applicability is the
  exact `COMBO` of package + task type + node. Repeated promotion reuses the
  template, applicability, slot, and links.
- Legacy document review and legacy slot-request promotion remain available and
  their regression suites pass unchanged.

## Implemented interfaces

```text
submit_types_for_node(db, task_node_id, actor_id) -> dict
review_type(db, *, checklist_result_id, type_id, decision, reason, actor_id) -> dict
promote_completed_checklist_types(db, checklist_result_id, actor_id) -> list[str]
promote_template_for_combo(
    db, *, name, source, service_package_id, task_type_id, node_code, actor_id
) -> str
```

Director endpoint:

```text
POST /workflow/checklist/{checklist_result_id}/document-types/{type_id}/review
```

It uses the existing `task_node:approve` permission, rolls back domain and
unexpected failures, commits before cache/timeline publication, and publishes the
existing node-review signal when a rejection returns the node.

## Impact analysis

GitNexus was stale/unavailable as stated in the task brief. Codebase-memory was
queried first, then path-scoped source and Git inspection were used for symbols
missing from that graph and for final change detection.

- `submit_task_node_for_acceptance` has a direct CRITICAL route caller
  `submit_task`. The implementation replaces its former unresolved-checklist
  query one-for-one with the atomic runtime-type submission query before any
  acceptance or node-status write.
- `review_task_node_acceptance` has CRITICAL director and auto-finalize callers,
  plus HIGH legal/handover dependents. The accepted branch received one additive
  runtime-type gate before the existing document and K06 debt gates. The rework
  implementation itself remains the existing single source of truth.
- `flush_node_review_batch` is used by the director review route and stale-batch
  flusher. Its optional `runtime_batch` argument preserves the legacy call shape
  and behavior when omitted.
- The K06 gate was not edited. Its immutable rule remains: paid in full or an
  approved debt exception before acceptance/handover.

Risk response: changes stayed under existing database transactions and row locks;
no domain helper commits. The CRITICAL/HIGH callers were covered by workflow,
review, debt, and handover regressions before commit.

## TDD evidence

### Initial RED — required Task 4 behavior absent

Command from `dev/backend`:

```bash
TEST_DATABASE_URL=sqlite:////tmp/bachkhoa_task4_red_test.db \
  venv/bin/python -m pytest \
  tests/test_checklist_document_types_unittest.py \
  tests/test_workflow_runtime_unittest.py -q
```

Exit: `1`.

```text
13 failed, 26 passed, 1 warning
```

The failures identified the missing submit/review/promotion functions, missing
director route, submit bypass, acceptance bypass, nonblank rejection reason,
intact rework, exact-COMBO promotion, and idempotent official links.

### Regression RED — fixed-call-sequence compatibility

The first broad run exposed one legacy fixed-sequence DB double failure:

```text
1 failed, 218 passed, 35 skipped, 1 warning
tests/test_tai_lieu_dau_ra_unittest.py::NopThang...test_moi_to...
```

Root cause: the first submission implementation added three independent DB
round-trips before the legacy query sequence. The fix consolidated validation,
locking, and status transition into one writable CTE that replaces the old
unresolved-checklist query one-for-one. The same broad group then passed:

```text
219 passed, 35 skipped, 1 warning
```

### Self-review RED/GREEN 1 — existing rework notification path

RED command:

```bash
TEST_DATABASE_URL=sqlite:////tmp/bachkhoa_task4_batch_red.db \
  venv/bin/python -m pytest \
  tests/test_workflow_runtime_unittest.py::ExistingReviewBatchRuntimeTypeTests::test_runtime_type_rejection_emits_existing_batch_event_and_delegates_rework -q
```

```text
TypeError: flush_node_review_batch() got an unexpected keyword argument 'runtime_batch'
1 failed, 1 warning
```

After extending the existing batch path and routing `review_type` through it:

```text
2 passed, 1 warning
```

The GREEN pair covers both the batch payload/delegation and preservation of the
runtime type's two active files.

### Self-review RED/GREEN 2 — approved official links

RED proved that promoted checklist links would otherwise receive the legacy
`pending_review` default and re-block node acceptance:

```text
AssertionError: 'review_status' not found in
'insert into public.checklist_result_document_links ...'
1 failed, 1 warning
```

The insert/upsert now persists `approved`, clears rejection reason, and records
`reviewed_by`/`reviewed_at`. The focused promotion and acceptance-gate check then
passed:

```text
2 passed, 1 warning
```

### Self-review RED/GREEN 3 — route transaction rollback

RED injected an unexpected write failure and observed zero rollbacks. After adding
the generic rollback/re-raise branch, the same test passed:

```text
1 passed, 1 warning
```

## Final GREEN verification

### Focused Task 4 domain/workflow tests

```bash
TEST_DATABASE_URL=sqlite:////tmp/bachkhoa_task4_focused_final.db \
  venv/bin/python -m pytest \
  tests/test_checklist_document_types_unittest.py \
  tests/test_workflow_runtime_unittest.py -q
```

```text
41 passed, 1 warning in 0.29s
```

### Combined checklist, workflow review, notification, K06, handover, and rollout suite

```text
229 passed, 35 skipped, 1 warning in 0.80s
```

The command covered:

- `test_checklist_document_types_unittest.py`
- `test_checklist_document_type_routes.py`
- `test_workflow_runtime_unittest.py`
- `test_workflow_runtime.py`
- `test_document_review.py`
- `test_review_batch_notification.py`
- `test_nop_nghiem_thu_thieu_tai_lieu.py`
- `test_tai_lieu_dau_ra_unittest.py`
- `test_checklist_deadline.py`
- `test_handover_override_gate_unittest.py`
- `test_debt_request_validation_unittest.py`
- `test_de_xuat_loai_tai_lieu_unittest.py`
- `test_de_xuat_input_va_promotion.py`
- `test_approval_queue_document_requests_unittest.py`

The 35 skips are existing PostgreSQL-fixture tests under the explicit SQLite test
URL; there were no test failures.

### K06 debt and handover gate

```bash
TEST_DATABASE_URL=sqlite:////tmp/bachkhoa_task4_k06_final.db \
  venv/bin/python -m pytest \
  tests/test_debt_request_validation_unittest.py \
  tests/test_handover_override_gate_unittest.py -q
```

```text
18 passed, 1 warning in 0.22s
```

### Legacy slot/request compatibility

```bash
TEST_DATABASE_URL=sqlite:////tmp/bachkhoa_task4_slots_final.db \
  venv/bin/python -m pytest \
  tests/test_de_xuat_loai_tai_lieu_unittest.py \
  tests/test_de_xuat_input_va_promotion.py \
  tests/test_approval_queue_document_requests_unittest.py -q
```

```text
90 passed, 1 warning in 0.42s
```

All test warnings are the existing passlib/Python `crypt` deprecation warning.

### Syntax and whitespace

`py_compile` covered all five changed production modules and both Task 4 test
modules. Path-scoped `git diff --check` also exited `0` with no output.

## Self-review

- Submission status mutation cannot run when any active type lacks files or a
  legacy checklist is unresolved; approval state is not downgraded on resubmit.
- Review derives checklist/node/type ownership server-side and locks the checklist,
  node, and type before mutation.
- Rejection preserves runtime types and file memberships and passes the exact
  checklist-specific reason through the existing rework function.
- Promotion is called only after `progress(...)["is_complete"]` is true and locks
  the checklist/types. Only employee-created types call the template helper.
- The COMBO insert carries all three dimensions and relies on the Task 1 unique
  index plus `ON CONFLICT DO NOTHING`; runtime rows retain promoted template and
  slot IDs, making repeat calls idempotent.
- Official links reference existing document IDs; no storage upload or
  `dossier_documents` insert occurs during promotion.
- The reusable template resolver preserves legacy conflicting-same-name rejection
  while allowing Task 4 to create/reuse the compatible employee-created template.
- K06 debt/handover logic and legacy document-review endpoints were not replaced.

## detect_changes fallback and dirty-worktree discipline

Native GitNexus `detect_changes()` was unavailable. The required fallback used:

- codebase-memory inbound traces before edits;
- path-scoped `git diff`, `git diff --stat`, `git diff --numstat`, and
  `git diff --check`;
- `git status --short` before staging;
- staged name/status/stat inspection and staged whitespace review before commit.

Only these Task 4 paths are authorized for the commit:

```text
dev/backend/src/contracts/workflow_runtime.py
dev/backend/src/dossiers/checklist_document_types.py
dev/backend/src/dossiers/slot_requests.py
dev/backend/src/routes/routes_contracts.py
dev/backend/src/routes/routes_employee_portal.py
dev/backend/tests/test_checklist_document_types_unittest.py
dev/backend/tests/test_workflow_runtime_unittest.py
.superpowers/sdd/2026-09-04-checklist-document-types/task-4-report.md
```

All pre-existing backend/frontend modifications and unrelated untracked plan,
specification, and component files remain unstaged and untouched.

## Environment note

No local PostgreSQL client/test URL was available (`pg_isready` absent and
`TEST_DATABASE_URL` unset), so PostgreSQL-backed fixtures remained skipped. SQL
shape, locking intent, CTE guards, conflict targets, and migration constraints
were reviewed directly; executable unit/regression coverage used the repository's
SQLite test convention.
