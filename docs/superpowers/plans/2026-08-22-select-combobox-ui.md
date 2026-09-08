# Select and Combobox UI Implementation Plan

> **For agentic workers:** This plan is executed inline in the current session with TDD checkpoints.

**Goal:** Chuẩn hóa giao diện select/combobox và cải thiện trải nghiệm option mà không thay đổi dữ liệu, quyền truy cập hoặc logic nghiệp vụ.

**Architecture:** Giữ native `<select>` cho các form dài và mobile; tạo một `Select` dùng chung cho dropdown/filter có nhu cầu hiển thị option đồng nhất. Component custom dùng button/listbox semantic, hỗ trợ bàn phím, click ngoài và tự điều chỉnh hướng mở. CSS native được chuẩn hóa làm fallback cho các select chưa migrate.

**Tech Stack:** React 19, Vite, Vitest, Testing Library, CSS hiện có và lucide-react.

**Spec:** Thiết kế UI/UX đã được duyệt trong hội thoại ngày 2026-08-22.

## Global Constraints

- Không thay đổi value, callback, option data hoặc quyền truy cập hiện tại.
- Không dùng `display: none` để che dữ liệu hoặc bỏ qua keyboard/accessibility; menu đóng phải được unmount an toàn hoặc dùng trạng thái tương đương không làm lộ option.
- Giữ native picker cho form dài/mobile khi custom dropdown không đem lại lợi ích rõ ràng.
- Giữ responsive, dark mode, contrast và reduced motion.
- Không sửa các thay đổi không liên quan đang có trong worktree.

---

### Task 1: Shared Select/Combobox contract

**Files:**
- Create: `dev/frontend/src/components/ui/Select.jsx`
- Test: `dev/frontend/src/components/ui/Select.test.jsx`

**Interfaces:**
- Consumes: `options`, `value`, `onChange`, `placeholder`, `label`, `disabled`, `required`, `className`, `id`.
- Produces: controlled `Select` with `button[aria-haspopup=listbox]` and a semantic option list.

- [ ] Write failing tests for selection, keyboard navigation, Escape, outside click, and ARIA state.
- [ ] Run `npm run test -- src/components/ui/Select.test.jsx` and confirm the new tests fail before implementation.
- [ ] Implement the smallest controlled component that renders only when open, keeps the selected option visible, and calls `onChange` with the original option value.
- [ ] Run the focused test file and confirm it passes.

### Task 2: Shared select styling and native fallback

**Files:**
- Modify: `dev/frontend/src/index.css`
- Test: `dev/frontend/src/components/ui/Select.styles.test.js`

**Interfaces:**
- Consumes: existing CSS variables and design tokens.
- Produces: stable light/dark/reduced-motion styles for `.ui-select`, `.ui-select__menu`, `.ui-select__option`, and native select fallback selectors.

- [ ] Add style assertions for focus ring, selected/hover states, dark theme, and no animation under reduced motion.
- [ ] Run the style test and confirm it fails before adding the selectors.
- [ ] Add scoped styles with viewport-safe menu positioning, text ellipsis, adequate option target height, and no global reset that changes unrelated inputs.
- [ ] Run the style test and confirm it passes.

### Task 3: Migrate shared filter/dropdown consumers

**Files:**
- Modify: `dev/frontend/src/components/ui/Dropdown.jsx`
- Modify: `dev/frontend/src/components/ui/FilterBar.jsx`
- Test: existing focused UI tests plus `Select.test.jsx`

**Interfaces:**
- Consumes: existing `Dropdown` and `FilterBar` public props and callback values.
- Produces: same public APIs with shared custom Select for sort/filter controls.

- [ ] Preserve the existing option normalization and callback values in tests.
- [ ] Replace only the shared dropdown/filter controls; leave date inputs and unrelated native selects unchanged.
- [ ] Run focused tests, lint, and build.

### Task 4: Verification and scope review

**Files:**
- Verify: all files changed by Tasks 1–3.

- [ ] Review `git diff` and ensure no unrelated user changes were overwritten.
- [ ] Run `npm run test`, `npm run lint`, and `npm run build` from `dev/frontend`.
- [ ] Run GitNexus `detect_changes({scope: "unstaged"})` before any commit/review handoff.
- [ ] Report remaining native selects and the platform limitation of native option popups.
