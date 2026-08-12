# Handoff cho Agent tiếp theo — Workflow, Checklist, Timetable và Timeline

> Cập nhật: 12/08/2026 (Asia/Ho_Chi_Minh)  
> Phạm vi: toàn bộ công việc thực hiện từ tối 11/08/2026, tương ứng chuỗi Prompt nghiệp vụ về Hợp đồng/Workflow, Prompt #2 Deadline–Checklist, Prompt #3 thẻ Node/Timetable, Prompt #9 Timeline Giám đốc và lượt sửa realtime cuối cùng.  
> Supabase project live: `ejklrwydjplwzztfuygj`

## 1. Mục đích tài liệu

Đây là tài liệu bàn giao kỹ thuật để agent khác tiếp tục mà không phải suy luận lại nghiệp vụ hoặc làm hỏng dữ liệu live.

Trước khi sửa tiếp, agent mới phải:

1. Đọc file này.
2. Đọc thêm `docs/CONTRACT_WORKFLOW_AUDIT_2026-08-11.md` và `docs/PHASE_STATUS_CURRENT_MODEL.md`.
3. Không khôi phục `projects_tasks`; mô hình chuẩn hiện tại bắt đầu từ `contracts → service_lines → workflow_instances`.
4. Không sửa schema Supabase nếu chưa chứng minh code hiện tại không thể giải quyết bằng schema đã có.
5. Không reset/checkout hàng loạt vì worktree đang chứa nhiều thay đổi song song của người dùng và Claude.

## 2. Mô hình nghiệp vụ đã chốt

```text
contracts
└── service_lines                         Một Hạng mục thương mại trong Hợp đồng
    └── workflow_instances                Một quy trình chạy thật của Hạng mục
        ├── workflow_instance_revisions   Bản Revision graph riêng của Hạng mục
        └── task_nodes                    Các Node runtime K01…K09
            ├── task_node_checklist_results
            ├── task_node_checklist_assignments
            ├── task_node_assignments
            ├── task_node_acceptances
            └── task_node_events
```

Các nguyên tắc tuyệt đối:

- `service_lines` là Hạng mục khách mua; không tạo lại một Task tổng để đại diện Hạng mục.
- `workflow_instance_revisions.graph` là luật thực tế của Hạng mục. `workflow_templates.graph` chỉ là mẫu để khởi tạo.
- Revision đang chạy không bị ghi đè. Sửa logic phải tạo draft Revision mới rồi `Áp dụng`.
- Node đã bắt đầu/đã có kết quả phải giữ snapshot Revision cũ. Chỉ Node chưa bắt đầu mới được rebase sang Revision mới.
- Deadline chỉ ở cấp Node. Checklist không có ngày bắt đầu/kết thúc riêng.
- Deadline runtime được tính khi nhân viên bấm bắt đầu Node:

```text
deadline_at = started_at + duration_days + duration_hours
```

- Mọi checklist trong Node dùng chung `task_nodes.deadline_at`.
- Minh chứng mới lưu qua MinIO trong `task_node_checklist_results.evidence_data.files[]`.
- Google Drive chỉ còn là link lịch sử tùy chọn; không phải điều kiện để kích hoạt workflow.
- Khoán nằm ở checklist có `compensation.is_payable = true`; không tính tiền mặc định cho toàn Hạng mục hoặc toàn Node.

## 3. Bảng tổng hợp các Prompt đã xử lý

| Prompt/phạm vi | Trạng thái | Kết quả chính |
|---|---|---|
| Prompt tổng rà soát Hợp đồng, endpoint, checklist, phân công, MinIO, tự sinh hồ sơ | Đã audit và đã code các lỗi workflow trọng tâm | Có tài liệu audit; sửa checklist, MinIO, module records, phân quyền và runtime |
| Prompt #2 — Deadline Node → Checklist | Đã code | Deadline chỉ cấp Node; trạng thái nộp trễ; bỏ ngày riêng của checklist; Node chỉ nộp nghiệm thu khi checklist hợp lệ |
| Flow nút `Sửa → Lưu tạm → Áp dụng` | Đã code | Bản đang chạy được bảo toàn; draft sửa dở được lưu; áp dụng tạo bản chạy mới |
| Prompt #3 — thẻ Node trên timetable nhân viên | Đã code phần card/modal và trạng thái checklist | Thẻ gọn, thời gian còn lại, avatar thật, click mở modal giữa màn hình |
| Prompt #9 — Timeline tổng cho Giám đốc | Đã code | Tab read-only theo Hợp đồng → Hạng mục → Node, zoom mượt, thanh Gantt, tooltip/modal, lọc |
| Sửa Timeline đọc duration/Revision và realtime | Đã code, đã kiểm tra live | Node đọc đúng active/draft Revision; Redis + SSE làm Timeline tự refetch ngay khi dữ liệu thay đổi |

## 4. Prompt tổng — những phần đã thực hiện

### 4.1 Audit endpoint và flow Hợp đồng

Đã ghi kết quả chi tiết tại:

- `docs/CONTRACT_WORKFLOW_AUDIT_2026-08-11.md`

Lưu ý: danh sách endpoint “ứng viên rác” trong file audit mới là đề xuất. Không được tự xóa nếu chưa có access log hoặc xác nhận không có Google Sheet/Zalo/cron/app ngoài gọi.

Flow mục tiêu hiện tại:

```text
Hợp đồng/Hạng mục
→ thiết kế workflow draft
→ kích hoạt Revision
→ Node đầu ở ready
→ nhân viên bấm bắt đầu
→ in_progress + tính deadline
→ nộp/duyệt từng checklist
→ nộp nghiệm thu Node
→ Giám đốc duyệt Node
→ transition mở Node kế tiếp
→ hoàn thành hoặc hủy có audit
```

### 4.2 Checklist thêm/xóa

Đã có:

- Xóa được checklist vừa thêm khi chưa lưu.
- Xóa được checklist đã tồn tại trong graph thông qua bản draft/Revision.
- Dùng helper `removeChecklistDefinition`, tránh dựa vào DB id cho dòng vừa tạo cục bộ.
- Runtime của Node chưa bắt đầu được đồng bộ khi áp dụng Revision; dữ liệu đã chạy không bị xóa vật lý.

File chính:

- `dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx`
- `dev/frontend/src/components/contracts/workflowChecklistState.js`
- `dev/frontend/src/components/contracts/workflowChecklistState.test.js`
- `dev/backend/src/contracts/workflow_runtime.py`

### 4.3 MinIO và link minh chứng

Đã sửa validation:

- Không bắt link phải thuộc hostname Google Drive.
- Link legacy nếu có chỉ cần là URL `http/https` hợp lệ.
- Link có thể bỏ trống khi lưu/kích hoạt.
- Minh chứng mới được upload MinIO khi nhân viên thao tác checklist.
- Metadata file lưu ở `evidence_data.files[]`: tên, URL, ghi chú, thời điểm nộp.

Hàm backend liên quan:

- `_validate_drive_url()` trong `dev/backend/src/contracts/workflow_runtime.py`
- `EmployeePortalService.submit_checklist_evidence()` trong `dev/backend/src/employee_portal/service.py`
- Route upload trong `dev/backend/src/routes/routes_employee_portal.py`

Không xóa field `drive_folder_url` ngay vì còn dùng để đọc Revision cũ. Đây là compatibility field, không còn là nguồn sự thật.

### 4.4 Tự sinh hồ sơ Pháp lý/Đo vẽ khi Node tới lượt

Đã triển khai idempotent:

- Node có cờ nghiệp vụ tương ứng sẽ tạo `legal_submissions` hoặc `survey_records` khi Node vào trạng thái `ready`.
- Khi nhân viên bấm bắt đầu vẫn gọi lại hàm ensure làm fallback cho workflow cũ.
- Hàm khóa `task_nodes` bằng `FOR UPDATE`, kiểm tra record theo `task_node_id` trước khi insert để tránh trùng.
- Revisit/retry trả lại record cũ, không sinh bản thứ hai cho cùng runtime Node.

Các hàm chính:

- `_maybe_create_legal_submission()`
- `_maybe_create_survey_record()`
- `_ensure_node_module_records()`
- `review_task_node_acceptance()` mở Node kế tiếp rồi provision module record

Lưu ý nghiệp vụ:

- Gói Đo vẽ có hỗ trợ mang hồ sơ đi nộp không tự trở thành vòng đời Pháp lý.
- Node Pháp lý chính thức mới tạo hồ sơ theo dõi pháp lý theo cấu hình.
- Node Đo vẽ hỗ trợ trong workflow Pháp lý vẫn có thể tạo `survey_records` nếu `creates_survey_record = true`.

### 4.5 Phân công

Đã giữ các ràng buộc:

- Chỉ nhân viên active.
- Không trùng cùng nhân viên + role trong một Node.
- Tối đa một người chính.
- Có thể linh hoạt liên phòng; không khóa cứng theo department.
- Người phụ trách checklist phải nằm trong danh sách assignment của Node.
- Checklist payable phải có role/rate hợp lệ.
- Thay assignment giữ lịch sử record cũ ở trạng thái `replaced`.
- UI không còn nút “Cập nhật phân công” riêng; phân công nằm trong draft và được lưu bằng `Lưu tạm`, có hiệu lực bằng `Áp dụng`.

## 5. Prompt #2 — Deadline Node và trạng thái Checklist

### 5.1 Luật đã triển khai

Node definition trong Revision graph chứa:

```json
{
  "duration_days": 5,
  "duration_hours": 1
}
```

Khi Node bắt đầu:

1. `task_nodes.status`: `ready/rework_required → in_progress`.
2. `started_at = now()` nếu chưa có.
3. Backend đọc node definition từ `task_nodes.defined_by_revision_id`.
4. Tính và ghi `task_nodes.deadline_at`.

Checklist không có ngày riêng. UI phân công checklist chỉ chọn người làm; không có start/end date.

### 5.2 Trạng thái checklist chuẩn

| Giá trị DB/API | Ý nghĩa |
|---|---|
| `not_started` | Chưa nộp |
| `pending_approval` | Nộp đúng hạn, đang chờ duyệt |
| `late_pending_approval` | Nộp trễ, có lý do trễ, chờ duyệt |
| `approved` | Đã duyệt đúng hạn |
| `late_approved` | Đã duyệt dù nộp trễ |
| `rejected` | Bị từ chối, cần nộp lại |
| `not_applicable` | Không áp dụng trong Revision/runtime hiện tại |

Logic nộp:

- `submitted_at <= node.deadline_at` → `pending_approval`.
- `submitted_at > node.deadline_at` → bắt buộc `late_reason`, trạng thái `late_pending_approval`.
- Nếu có checklist trễ, `task_nodes.is_overdue = true` và giữ cờ này để báo cáo kể cả sau khi đã duyệt trễ.
- Node chỉ được nộp nghiệm thu khi mọi checklist bắt buộc nằm trong `approved`, `late_approved` hoặc `not_applicable`.

File chính:

- `dev/backend/src/employee_portal/service.py`
- `dev/backend/src/contracts/workflow_runtime.py`
- `dev/backend/tests/test_checklist_deadline.py`
- `dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.jsx`
- `dev/frontend/src/features/employee-portal/employeePortalMappers.js`

### 5.3 Field minh chứng

- `require_evidence` và `approver_role` nằm ở từng checklist item.
- Field `evidence_required` cấp Node được loại khỏi normalized graph.
- UI “Bắt buộc nộp minh chứng” chỉ còn ở checklist, không ở tab Node.

## 6. Flow chỉnh sửa workflow đang vận hành

UI và backend đang theo flow:

```text
Đang xem bản chạy thật
→ Sửa
   → PUT /api/contracts/workflow/{service_line_id}/draft
   → copy active graph thành draft Revision
→ Lưu tạm
   → ghi draft, không đụng active runtime
→ Áp dụng
   → POST /api/contracts/workflow/{service_line_id}/activate
   → active cũ thành superseded
   → draft thành active
   → Node chưa bắt đầu rebase sang Revision mới
   → Node đã bắt đầu giữ Revision cũ
```

Điểm sửa quan trọng trong `_apply_workflow_amendment()`:

- Chỉ xóa/cancel Node nếu `status in ('pending', 'ready')` và `started_at is null`.
- Node đã bắt đầu không được đổi `node_code` hoặc xóa khỏi graph.
- Node chưa bắt đầu được cập nhật `defined_by_revision_id` sang Revision vừa áp dụng.
- Ghi event `REBASED_BY_REVISION` chứa Revision cũ/mới.
- Checklist và assignment của Node chưa bắt đầu được đồng bộ theo Revision mới.
- Node đang chạy giữ nguyên snapshot để deadline, minh chứng và lịch sử nghiệm thu không bị đổi.

Đây là vùng rủi ro cao. Graph impact cho thấy `_apply_workflow_amendment`, `activate_workflow` và `_ensure_node_module_records` nằm trên luồng kích hoạt/transition quan trọng. Agent sau phải chạy impact analysis trước khi sửa.

## 7. Prompt #3 — Thẻ Node trong timetable nhân viên

Đã triển khai tại:

- `dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.jsx`
- `dev/frontend/src/features/employee-portal/employeePortal.css`
- `dev/frontend/src/features/employee-portal/employeePortalMappers.js`
- `dev/frontend/src/components/ui/Modal.jsx`

Hành vi hiện tại:

- Thẻ Node gọn, không kéo dài theo duration như Gantt tổng.
- Hiển thị tên Node, checklist và icon trạng thái.
- Hiển thị thời gian còn lại theo `node.deadline_at`.
- Avatar dùng `avatar_url` thật; không tự sinh ảnh avatar giả. Nếu thiếu ảnh thì dùng placeholder trung tính.
- Click thẻ mở modal ở giữa viewport thay vì bung một khối lệch ngay dưới thẻ.
- Modal cho phép thao tác checklist/minh chứng theo quyền của nhân viên.
- Có nút đi tới chi tiết đầy đủ cho tác vụ nặng.

Chưa được phép đưa sửa graph, transition hoặc MAIN/ASSISTANT vào modal nhanh này.

## 8. Prompt #9 — Timeline tổng cho Giám đốc

### 8.1 Kiến trúc UI

Tab bên trái: `Quản lý Timeline`, chỉ Giám đốc/Admin được truy cập.

Màn hình read-only:

```text
Cột trái sticky
Hợp đồng
└── Hạng mục

Cột phải
Trục tháng/tuần/ngày có zoom mượt
└── mỗi Node là một thanh Gantt ở một lane riêng
```

Đã có:

- Tìm Hợp đồng/khách hàng/Hạng mục.
- Lọc trạng thái và loại Node.
- Zoom mượt bằng `pixelsPerDay`, không khóa cứng Tuần/Tháng/Quý.
- Khi zoom, toàn bộ vạch ngày/tháng và thanh Node co giãn theo cùng tỷ lệ.
- Nút `Hiện tại` đưa viewport về hôm nay.
- Nhãn khoảng thời gian nhìn thấy cập nhật theo scroll/zoom.
- Cột trái sticky, track bên phải kéo ngang.
- Các Node cùng Hạng mục nằm ở lane thụt dần xuống, không đè nhau.
- Thanh Node dùng thời gian runtime thực tế: `started_at → completed_at/deadline_at/now`.
- Node chưa bắt đầu không được dựng ngày giả; hiển thị card nét đứt với duration đã cấu hình.
- Màu: hoàn thành xanh, đang chạy vàng, trễ đỏ, chưa bắt đầu/khác xám.
- Avatar group nhỏ dùng dữ liệu thật từ `employees.avatar_url`.
- Hover có tooltip Node/người làm.
- Click mở modal giữa màn hình, chỉ xem; nút đi tới chi tiết Node mới chuyển sang workspace.
- Hạng mục có draft hiển thị badge `Đang sửa tạm Revision N`.

File:

- `dev/frontend/src/pages/ContractTimeline.jsx`
- `dev/frontend/src/pages/contractTimeline.css`
- `dev/frontend/src/App.jsx`
- `dev/frontend/src/components/Sidebar.jsx`
- `dev/backend/src/routes/routes_contracts.py`

Endpoint đọc:

- `GET /api/contracts/timeline`
- Chỉ `_require_director` được phép gọi.
- Response group `Contract → service_lines → nodes`.
- Mỗi Node trả cả active duration và draft duration để UI phân biệt bản chạy/bản đang sửa.

## 9. Lượt sửa cuối — Revision duration và realtime

### 9.1 Lỗi gốc đã tìm thấy

Timeline trước đây hiển thị K01/K02/K09 “Chưa có lịch” dù Giám đốc đã lưu duration vì:

- active Revision đã đổi nhưng `task_nodes.defined_by_revision_id` của Node chưa bắt đầu vẫn trỏ Revision cũ;
- Timeline chỉ dựa trên `started_at/deadline_at`, chưa trả duration trong graph;
- màn Timeline chỉ load ban đầu, không biết khi một màn hình khác vừa lưu/áp dụng/bắt đầu Node.

### 9.2 Cách đã sửa

Backend:

- Khi áp dụng Revision, rebase `defined_by_revision_id` cho Node `pending/ready` chưa bắt đầu.
- Endpoint Timeline trả:
  - `defined_by_revision_id`
  - `runtime_revision_current`
  - `duration_days`, `duration_hours`
  - `draft_duration_days`, `draft_duration_hours`
  - active/draft Revision id và revision number ở Hạng mục
- Node đang chạy ưu tiên `deadline_at` làm điểm cuối hiển thị.

Realtime:

- Không dùng Supabase Realtime trực tiếp và không tạo public signal table.
- Đã chọn Redis Pub/Sub nội bộ + SSE có JWT của backend để tránh mở RLS/public policy.
- Backend chỉ publish metadata invalidation, không phát dữ liệu nghiệp vụ nhạy cảm.
- Frontend nhận event rồi gọi lại API bảo vệ `GET /api/contracts/timeline`.

Endpoint:

- `GET /api/contracts/timeline/events`
- Content type `text/event-stream`
- Yêu cầu Bearer token và quyền Giám đốc.

Các nguồn phát event sau commit:

- lưu workflow draft;
- áp dụng Revision;
- hủy workflow;
- đổi phân công Node;
- duyệt checklist;
- duyệt nghiệm thu Node;
- nhân viên bắt đầu Node;
- nhân viên nộp checklist;
- nhân viên nộp Node.

Frontend:

- `getAccessToken()` trong `dev/frontend/src/lib/api.js`.
- `ContractTimeline.jsx` mở authenticated SSE stream.
- Event được debounce 150 ms rồi silent refetch.
- Tự reconnect sau 1,5 giây nếu stream rớt.
- Khi tab được focus/visible trở lại sẽ refetch làm lớp an toàn.

File mới:

- `dev/backend/src/services/timeline_realtime.py`

Không có migration realtime nào được áp dụng. Nếu thấy ý tưởng tạo bảng signal/public policy thì bỏ qua; phương án đó đã bị từ chối vì rủi ro quyền truy cập.

## 10. Dữ liệu live đã xác minh cuối ngày 11/08/2026

Hợp đồng test: `128/BK-2026`  
Hạng mục: `Hợp thửa`  
Workflow instance: `running`  
Active Revision: `11`

| Node | Runtime status | Duration active | started_at | deadline_at | Revision |
|---|---|---:|---|---|---|
| K01 | `in_progress` | 5 ngày 1 giờ | 2026-08-11 15:35:42 UTC | 2026-08-16 16:35:42 UTC | trỏ đúng active Revision 11 |
| K02 | `pending` | 0 ngày 0 giờ | null | null | trỏ đúng active Revision 11 |
| K09 | `pending` | 0 ngày 0 giờ | null | null | trỏ đúng active Revision 11 |

Khoảng K01 là đúng `121 giờ`. Timestamp UTC tương ứng giờ Việt Nam:

- Bắt đầu: khoảng 22:35 ngày 11/08/2026.
- Deadline: khoảng 23:35 ngày 16/08/2026.

Đã kiểm tra toàn bộ Node `pending/ready` hiện có: tại thời điểm kiểm tra không còn Node chưa bắt đầu trỏ sai `active_revision_id`.

## 11. Kiểm thử đã chạy

Đã đạt:

- Python `py_compile` cho:
  - `workflow_runtime.py`
  - `routes_contracts.py`
  - `routes_employee_portal.py`
  - `timeline_realtime.py`
- `npm run build` frontend thành công, 759 modules transformed.
- Docker backend/frontend/Redis/MinIO đã restart và hoạt động.
- `GET /api/contracts/timeline` trả `200`.
- `GET /api/contracts/timeline/events` trả `200`.
- Redis publish trả subscriber count `1`.
- Sau khi publish event, log ghi nhận frontend tự gọi lại `GET /api/contracts/timeline` và nhận `200`.
- Thao tác thật “Bắt đầu K01” sinh `started_at` và `deadline_at` đúng 121 giờ; Timeline tự refetch.

Giới hạn kiểm thử:

- `pytest` không có trên host và cũng chưa được cài trong container backend, nên hai test Python chưa chạy bằng pytest dù `py_compile` đạt.
- Frontend test trước đó: 3 test đạt, 1 test `EmployeeDirectory.test.jsx` lỗi cũ không liên quan phạm vi Timeline/workflow.
- Build có cảnh báo chunk lớn hơn 500 kB; không phải lỗi build.

## 12. Danh sách file trọng tâm đã chạm

Backend:

- `dev/backend/src/contracts/workflow_runtime.py`
- `dev/backend/src/employee_portal/service.py`
- `dev/backend/src/routes/routes_contracts.py`
- `dev/backend/src/routes/routes_employee_portal.py`
- `dev/backend/src/services/timeline_realtime.py`
- `dev/backend/tests/test_workflow_runtime.py`
- `dev/backend/tests/test_checklist_deadline.py`

Frontend:

- `dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx`
- `dev/frontend/src/components/contracts/ContractWorkspace.jsx`
- `dev/frontend/src/components/contracts/contracts.css`
- `dev/frontend/src/components/contracts/workflowChecklistState.js`
- `dev/frontend/src/components/contracts/workflowChecklistState.test.js`
- `dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.jsx`
- `dev/frontend/src/features/employee-portal/employeePortal.css`
- `dev/frontend/src/features/employee-portal/employeePortalMappers.js`
- `dev/frontend/src/components/ui/Modal.jsx`
- `dev/frontend/src/pages/ContractTimeline.jsx`
- `dev/frontend/src/pages/contractTimeline.css`
- `dev/frontend/src/lib/api.js`
- `dev/frontend/src/App.jsx`
- `dev/frontend/src/components/Sidebar.jsx`

Docs:

- `docs/CONTRACT_WORKFLOW_AUDIT_2026-08-11.md`
- file handoff này.

## 13. Việc agent kế tiếp nên làm

Theo thứ tự:

1. Mở UI và kiểm tra trực quan `Quản lý Timeline` ở độ phân giải người dùng đang dùng.
2. Test lại ba trạng thái:
   - active workflow không có draft;
   - active workflow có draft đang sửa duration;
   - Node vừa bắt đầu và Timeline cập nhật không F5.
3. Thêm `pytest` vào dev/test dependency hoặc chạy test trong một image test riêng; không cài bừa vào production image.
4. Chạy:

```bash
pytest -q tests/test_workflow_runtime.py tests/test_checklist_deadline.py
npm run build
```

5. Viết test tích hợp cho chuỗi:

```text
save draft → activate → rebase pending node
→ start node → deadline đúng duration Revision mới
→ SSE event → Timeline refetch
```

6. Kiểm tra trường hợp Revision sửa Node K02/K09 từ duration 0 sang có duration; trước khi bắt đầu Timeline phải hiện duration, sau khi bắt đầu phải có bar theo deadline.
7. Không sửa Node đã `in_progress` chỉ để ép nó theo Revision mới; đó là phá lịch sử.

## 14. Cảnh báo quan trọng

- Worktree hiện rất bẩn và có nhiều thay đổi không thuộc riêng lượt sửa này. Không dùng `git reset --hard`, `git checkout -- .` hoặc xóa file hàng loạt.
- `dev/frontend/src/pages/ContractTimeline.jsx`, CSS Timeline và service realtime từng là file untracked trong worktree; kiểm tra `git status` trước khi commit.
- Không đưa service-role/secret Supabase lên frontend hoặc vào tài liệu.
- File `.env` backend đã được chỉnh cục bộ để trỏ đúng project Supabase hiện tại; file này gitignored, không commit secret.
- Không bật RLS hàng loạt trên database live trong lượt tiếp theo. Mô hình còn nhiều API backend trực tiếp; cần phase RLS riêng và test JWT thật.
- Không tự thêm bảng realtime signal. Redis + authenticated SSE hiện đã chạy và đã được kiểm tra end-to-end.
- Khi sửa `_apply_workflow_amendment`, `activate_workflow`, `_ensure_node_module_records`, `review_task_node_acceptance` hoặc `start_task_node`, bắt buộc chạy impact analysis trước vì đây là luồng CRITICAL/HIGH.

## 15. Tiêu chí hoàn thành cho lượt tiếp theo

Chỉ coi là hoàn thành khi:

- Giám đốc lưu draft và thấy badge Revision nháp trên Timeline gần như ngay lập tức.
- Áp dụng draft làm Node chưa bắt đầu đọc đúng duration mới.
- Nhân viên bấm bắt đầu làm Timeline xuất hiện bar với `started_at → deadline_at` đúng duration.
- K02/K09 chưa bắt đầu không có deadline giả nhưng vẫn hiển thị duration cấu hình.
- Node đang làm không bị thay Revision khi Giám đốc áp dụng bản sửa khác.
- Realtime reconnect được sau restart backend/Redis hoặc sau khi đổi tab trình duyệt.
- Không sinh trùng `legal_submissions`/`survey_records` khi retry/revisit.
- Không phát sinh migration/schema ngoài phạm vi đã chốt.

