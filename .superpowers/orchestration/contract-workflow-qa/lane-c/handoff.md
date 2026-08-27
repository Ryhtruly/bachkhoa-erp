# Lane C Handoff

**State:** review
**Base Commit:** e35e34c
**Final Commit SHA:** dc4c0bbd7fd2cbb66d0f4036a2aac2626377cfaa

## Changed Files
- dev/frontend/src/features/employee-portal/EmployeeWorkspace.jsx
- dev/frontend/src/features/employee-portal/EmployeePortalDashboard.test.jsx
- dev/frontend/src/components/AvatarImage.jsx
- dev/frontend/src/components/AvatarImage.test.jsx
- dev/frontend/src/lib/privateStorage.js

## Impact / Call-Site Evidence
- EmployeeWorkspace: Updates the ChainPoolCard and AssistPoolCard component renderings so that they show a message (cannot_claim_reason) instead of the claim button if can_claim is false. Extends isBlocked and blockedReason computation before invoking PoolItemDetailModal, which combines per-item eligibility lock and the global WIP guard lock properly. Preserves backend 422 because we didn't touch the error handling logic in the dashboard.
- privateStorage.js: Upgraded isPrivateObjectKey and fetchPrivateObjectBlob to use extractPrivateKey, capable of parsing legacy full MinIO URLs correctly, falling back to authenticated endpoints.
- AvatarImage.jsx: Implements extracting privateKey instead of exact matches, causing it to prefer the internal privateSrc and ignore safeSrc representing the direct MinIO endpoint.

## Verification Commands & Counts
- Command: npm run test src/features/employee-portal/EmployeePortalDashboard.test.jsx
  - Red -> Green. Passes: 18 tests.
- Command: npm run test src/components/AvatarImage.test.jsx
  - Red -> Green. Passes: 7 tests.
- Command: npm run test src/lib/avatar.test.js
  - Green -> Green. Passes: 1 test.
- Command: npm run test (Entire Frontend test suite)
  - Passes: 293 tests across 69 files (0 failed, 0 flaky).

## Proof (No :9000 / invalid claim request)
- Tests added in AvatarImage.test.jsx use src="http://localhost:9000/.../avatars/.../old.png". The fetchMock verifies the app accesses /api/employee-portal/file?object_key=... instead of initiating a direct MinIO fetch! Test specifically asserts img.src.not.toContain('localhost:9000').
- Tests added in EmployeePortalDashboard.test.jsx verify that when can_claim: false is present, there is NO "Nhận trọn" or "Nhận làm phụ" button mounted, preventing users from firing invalid requests. The PoolItemDetailModal has its button explicitly disabled.

## Risks
- Since extractPrivateKey strips the domain entirely when a known prefix like avatars/ or contracts/ matches anywhere inside the path, external CDN links mimicking this pattern (https://cdn.example.com/avatars/1.png) will be mistakenly treated as internal backend objects. If the business introduces legitimate external URLs that look exactly like the extracted patterns, they will break. However, this is tightly constrained to the known prefixes.
