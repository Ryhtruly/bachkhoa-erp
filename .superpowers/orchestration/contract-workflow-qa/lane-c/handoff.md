# Lane C Handoff

**State:** review
**Base Commit:** e35e34c
**Final Commit SHA:** [TO_BE_UPDATED_ON_COMMIT]

## Changed Files
- dev/frontend/src/features/employee-portal/EmployeeWorkspace.jsx
- dev/frontend/src/features/employee-portal/EmployeePortalDashboard.test.jsx
- dev/frontend/src/components/AvatarImage.jsx
- dev/frontend/src/components/AvatarImage.test.jsx
- dev/frontend/src/lib/privateStorage.js
- dev/frontend/src/lib/privateStorage.test.js

## Impact / Call-Site Evidence
- **EmployeeWorkspace**: Updates the ChainPoolCard and AssistPoolCard component renderings so that they show a message (cannot_claim_reason) instead of the claim button if can_claim is false. Extends isBlocked and blockedReason computation before invoking PoolItemDetailModal, which combines per-item eligibility lock and the global WIP guard lock properly. Preserves backend 422 because error handling in dashboard is unchanged.
- **privateStorage.js**: extractPrivateKey uses rigorous URL parsing instead of substring matching. Preserves direct relative keys beginning vatars/ or contracts/. Path-style legacy storage URLs (e.g. http://localhost:9000/<bucket>/avatars/... or .../<bucket>/contracts/...) require at least 1 path segment before the prefix and normalize to the decoded key. Public URLs whose path begins /avatars/... or /contracts/... (e.g. https://cdn.example.test/avatars/e-1.png) remain non-private (
ull).
- **AvatarImage.jsx**: Extracts privateKey via extractPrivateKey and prefers privateSrc only when a genuine private key exists; normal public CDN URLs retain direct safeSrc without making fetch requests.
- **Call Sites (rg / grep)**:
  - dev/frontend/src/components/AvatarImage.jsx (uses extractPrivateKey, etchPrivateObjectBlob)
  - dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx (uses isPrivateObjectKey, openPrivateObject)
  - dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.jsx (uses isPrivateObjectKey, openPrivateObject)

## Verification Commands & Counts
- Command: 
pm run test src/lib/avatar.test.js src/lib/privateStorage.test.js src/components/AvatarImage.test.jsx src/features/employee-portal/EmployeePortalDashboard.test.jsx
  - Passes: 32 tests across 4 files.
- Command: 
pm run test (Entire Frontend test suite)
  - Passes: 299 tests across 70 files (0 failed, 0 flaky).

## Proof (No :9000 / invalid claim request / direct CDN intact)
- Tests in AvatarImage.test.jsx assert that src="https://cdn.example.test/avatars/e-1.png" renders direct img with no etch called.
- Tests in AvatarImage.test.jsx assert src="http://localhost:9000/bachkhoa-erp-local/avatars/emp-1/old.png" resolves through /api/employee-portal/file?object_key=avatars%2Femp-1%2Fold.png with img.src never containing localhost:9000.
- Tests in privateStorage.test.js verify path-style bucket URLs, encoded characters, public CDN URLs, direct keys, and non-HTTP URLs.
- Tests in EmployeePortalDashboard.test.jsx verify that can_claim: false or ctive_in_progress: 1 disables claim buttons and makes zero /claim API requests.

## Risks
- None identified. URL parsing strictly validates HTTP/HTTPS protocols and segment hierarchy without hardcoding hosts or guessing environment domains.
