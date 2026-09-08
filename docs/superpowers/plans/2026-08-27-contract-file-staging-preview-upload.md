# Contract File Staging, Preview, and Multi-Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép người dùng chọn nhiều tài liệu khách gửi, xem trước ngay trong modal khi đang tạo hợp đồng, sau đó lưu lần lượt toàn bộ tài liệu lên storage với retry riêng cho từng file.

**Architecture:** File được giữ tạm trong state của browser dưới dạng `File[]` trong suốt phiên tạo hợp đồng; dùng `URL.createObjectURL()` để preview, không dùng HTTP Cache làm nơi lưu dữ liệu. Sau khi API tạo hợp đồng trả về `contract_id`, frontend upload từng file bằng request riêng và backend ghi object vào MinIO rồi metadata vào database. Mỗi file có kết quả thành công/thất bại riêng; refresh hoặc đóng tab sẽ xoá các file chưa upload.

**Tech Stack:** React, Vitest, FastAPI, SQLAlchemy, pytest, Docker Compose, MinIO.

## Global Constraints

- Giữ giới hạn từng file hiện tại: tối đa 25MB.
- Chỉ nhận các phần mở rộng hiện tại: PDF, JPG/JPEG, PNG, WEBP, HEIC, DOC/DOCX, XLS/XLSX.
- Không lưu nội dung file khách gửi vào `localStorage` hoặc `sessionStorage`.
- Không để một file lỗi rollback các file đã upload thành công.
- Không coi MinIO là nguồn dữ liệu preview của file chưa lưu; preview file mới chọn phải dùng bytes local.
- Không sửa các phần workflow hợp đồng không liên quan đến upload/preview.

---

### Task 1: Chốt contract dữ liệu tạm và bổ sung test hồi quy

**Files:**
- Modify: `dev/frontend/src/features/contracts/ContractComposer.jsx`
- Modify: `dev/frontend/src/pages/Contracts.jsx`
- Test: `dev/frontend/src/features/contracts/ContractComposer.test.jsx`
- Test: `dev/frontend/src/pages/Contracts.test.jsx`

**Interfaces:**
- Consumes: `File[]` từ `<input type="file" multiple>`.
- Produces: payload `{ source_documents: File[], existing_contract_id?: string }` và kết quả `{ contract_id, failed_files }`.

- [ ] **Step 1: Viết test cho phiên staging file**

```jsx
it('giữ toàn bộ file đã chọn và truyền đủ source_documents khi submit', async () => {
  const files = [
    new File(['a'], 'a.pdf', { type: 'application/pdf', lastModified: 1 }),
    new File(['b'], 'b.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', lastModified: 2 }),
  ]
  // Chọn cả hai file trong cùng một event, submit form, rồi kiểm tra onSubmit.
  expect(submittedPayload.source_documents).toHaveLength(2)
  expect(submittedPayload.source_documents.map(file => file.name)).toEqual(['a.pdf', 'b.docx'])
})
```

- [ ] **Step 2: Viết test để chứng minh từng file là một request độc lập**

```jsx
it('upload lần lượt từng file và chỉ trả lại file lỗi', async () => {
  apiFetch
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error('400'))
  const result = await submitPayloadWithFiles([fileA, fileB])
  expect(apiFetch).toHaveBeenCalledTimes(2)
  expect(result.failed_files.map(file => file.name)).toEqual([fileB.name])
})
```

- [ ] **Step 3: Chạy test để ghi nhận lỗi hoặc khoảng trống hiện tại**

Run: `npm run test -- --run src/features/contracts/ContractComposer.test.jsx src/pages/Contracts.test.jsx`

Expected: test mới phải fail nếu payload bị mất file, request không đủ, hoặc file lỗi không được giữ lại.

- [ ] **Step 4: Chuẩn hoá state và kết quả submit**

Giữ `sourceFiles` là `File[]`, không chuyển sang tên file/string. Khi submit, truyền nguyên từng `File` vào `source_documents`. Sau khi upload, chỉ set lại state bằng `failed_files`; khi không còn lỗi thì đóng modal và xoá state staging.

- [ ] **Step 5: Chạy lại test frontend**

Run: `npm run test -- --run src/features/contracts/ContractComposer.test.jsx src/pages/Contracts.test.jsx`

Expected: PASS; số lượng request bằng số file có kích thước hợp lệ và file lỗi vẫn có thể retry.

---

### Task 2: Ổn định preview file local trong modal

**Files:**
- Modify: `dev/frontend/src/components/ui/FilePreviewModal.jsx`
- Modify: `dev/frontend/src/features/contracts/ContractComposer.jsx`
- Test: `dev/frontend/src/components/ui/FilePreviewModal.test.jsx`

**Interfaces:**
- Consumes: `{ fileName, mimeType, url, blob }`, trong đó `blob` là `File` local nếu file chưa lưu.
- Produces: modal hiển thị ảnh/PDF/DOCX; định dạng không hỗ trợ vẫn có link mở tab mới và tải xuống.

- [ ] **Step 1: Viết test cho ba nhánh renderer**

```jsx
it('dùng file blob local để render docx, không fetch lại object URL', async () => {
  const file = new File([validDocxBytes], 'khach.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  render(<FilePreviewModal open fileName={file.name} mimeType={file.type} url="blob:local" blob={file} onClose={() => {}} />)
  await waitFor(() => expect(renderAsync).toHaveBeenCalledWith(file, expect.any(HTMLElement), null, expect.any(Object)))
  expect(fetch).not.toHaveBeenCalled()
})

it('dùng iframe cho PDF và img cho ảnh', () => {
  // Assert src và loại element theo extension/MIME.
})
```

- [ ] **Step 2: Viết test cho cleanup object URL**

```jsx
it('thu hồi object URL khi đóng preview hoặc unmount', () => {
  // Mở file A, mở file B, đóng modal; kiểm tra URL.revokeObjectURL được gọi.
})
```

- [ ] **Step 3: Chạy test để xác nhận lỗi preview**

Run: `npm run test -- --run src/components/ui/FilePreviewModal.test.jsx`

Expected: test phải tái hiện trường hợp DOCX bị fetch lại, blob rỗng, hoặc renderer bị gọi với dữ liệu không đúng.

- [ ] **Step 4: Giữ bytes local làm nguồn preview**

Khi người dùng bấm tên file trong `ContractComposer`, tạo một object URL từ chính `File` và truyền cả `url` lẫn `blob` vào `FilePreviewModal`. DOCX phải gọi `renderAsync(blob, ...)`; chỉ fetch URL khi modal được dùng cho tài liệu đã lưu và không có `blob`.

- [ ] **Step 5: Xử lý fallback rõ ràng**

Nếu DOCX không parse được hoặc file là `.doc`, `.xls`, `.xlsx`, không render vào vùng trắng; hiển thị tên file, thông báo định dạng không preview được và giữ nút tải xuống. Không coi fallback này là upload lỗi.

- [ ] **Step 6: Chạy test và build frontend**

Run: `npm run test -- --run src/components/ui/FilePreviewModal.test.jsx src/components/contracts/ContractDocumentViewer.test.jsx`

Run: `npm run build`

Expected: PASS; không có lỗi runtime trong modal; build thành công.

---

### Task 3: Làm upload backend có validation và lưu trữ theo từng file

**Files:**
- Modify: `dev/backend/src/routes/routes_document_register.py`
- Modify: `dev/backend/src/dossiers/register.py`
- Modify: `dev/backend/src/dossiers/documents.py`
- Test: `dev/backend/tests/test_document_register_upload.py`

**Interfaces:**
- Consumes: một `UploadFile` trên endpoint `POST /api/document-register/contracts/{contract_id}/source-documents`.
- Produces: HTTP 200 metadata gồm `object_key`, `file_name`, `size_bytes`; HTTP 400 có `detail` xác định rõ file bị từ chối.

- [ ] **Step 1: Viết test cho upload nhiều request độc lập**

```python
def test_each_source_document_is_stored_under_unique_key(client, minio_stub, db_session):
    first = upload_source_file(client, "a.pdf", b"a")
    second = upload_source_file(client, "b.pdf", b"b")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["object_key"] != second.json()["object_key"]
    assert count_contract_source_documents(db_session) == 2
    assert minio_stub.object_count() == 2
```

- [ ] **Step 2: Viết test cho từng loại validation**

```python
def test_rejects_empty_oversized_and_unsupported_files(client):
    assert upload_source_file(client, "empty.pdf", b"").status_code == 400
    assert upload_source_file(client, "large.pdf", b"x" * (25 * 1024 * 1024 + 1)).status_code == 400
    assert upload_source_file(client, "bad.exe", b"x").status_code == 400
```

- [ ] **Step 3: Chạy test backend trước khi sửa**

Run: `docker exec bachkhoa-erp-dev-backend-1 pytest -q backend/tests/test_document_register_upload.py`

Expected: test mới fail nếu backend gộp/ghi đè key, không commit từng file, hoặc trả lỗi không xác định.

- [ ] **Step 4: Giữ key MinIO duy nhất cho từng file**

Tạo `document_id = uuid.uuid4().hex` cho mỗi request và ghi theo mẫu `contracts/{contract_id}/source-documents/{document_id}/{neutral_filename}`. Không dùng tên file làm key duy nhất.

- [ ] **Step 5: Giữ transaction boundary theo request**

Mỗi request phải hoàn tất upload object, insert metadata và `db.commit()` riêng. Khi validation fail, không gọi MinIO. Khi database fail sau khi MinIO đã ghi, log object key và xoá object vừa tạo hoặc đưa vào cleanup queue để tránh object mồ côi.

- [ ] **Step 6: Trả lỗi đủ dữ kiện để frontend retry đúng file**

Giữ HTTP 400 cho validation, nhưng detail phải chứa nguyên nhân (rỗng, quá 25MB, extension hoặc MIME không hợp lệ). Frontend ghi nhận file tương ứng theo request đang chạy; không nuốt mất lỗi thành lỗi chung.

- [ ] **Step 7: Chạy lại test backend**

Run: `docker exec bachkhoa-erp-dev-backend-1 pytest -q backend/tests/test_document_register_upload.py`

Expected: PASS; upload hai file tạo hai object MinIO và hai dòng metadata.

---

### Task 4: Hoàn thiện retry, tiến độ và quan sát lỗi ở frontend

**Files:**
- Modify: `dev/frontend/src/pages/Contracts.jsx`
- Modify: `dev/frontend/src/features/contracts/ContractComposer.jsx`
- Test: `dev/frontend/src/pages/Contracts.test.jsx`

**Interfaces:**
- Consumes: kết quả mỗi request upload và lỗi backend có `detail`.
- Produces: trạng thái `đang tải`, `đã tải`, `lỗi`; nút “Tải lại tệp lỗi” chỉ gửi lại file thất bại.

- [ ] **Step 1: Viết test cho kết quả hỗn hợp**

```jsx
it('giữ lại đúng file thất bại và không gửi lại file đã thành công', async () => {
  apiFetch.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Định dạng không hợp lệ'))
  const firstResult = await submitNewContract([fileA, fileB])
  expect(firstResult.failed_files).toEqual([fileB])

  apiFetch.mockResolvedValueOnce({})
  await retryFailedFiles(firstResult.failed_files)
  expect(apiFetch).toHaveBeenCalledTimes(3)
})
```

- [ ] **Step 2: Chạy test để xác nhận retry không tạo hợp đồng trùng**

Run: `npm run test -- --run src/pages/Contracts.test.jsx`

Expected: lần retry chỉ gọi endpoint source-documents, không gọi lại `/api/contracts/generate`.

- [ ] **Step 3: Hiển thị tiến độ theo từng file**

Trong lúc vòng lặp chạy, cập nhật trạng thái theo tên file. Khi một request lỗi, hiển thị `detail` backend nếu có và giữ file trong `failed_files`; không chỉ log bằng `console.warn`.

- [ ] **Step 4: Giữ upload tuần tự làm mặc định**

Dùng `for...of` với `await` để giảm tải MinIO/backend và dễ xác định request lỗi. Chỉ chuyển sang song song có giới hạn nếu có yêu cầu hiệu năng và đã có test chống quá tải.

- [ ] **Step 5: Chạy test frontend đầy đủ liên quan**

Run: `npm run test -- --run src/components/ui/FilePreviewModal.test.jsx src/features/contracts/ContractComposer.test.jsx src/pages/Contracts.test.jsx`

Expected: PASS; không mất file, retry đúng file và preview không ảnh hưởng upload.

---

### Task 5: Kiểm thử tích hợp Docker/MinIO và chốt phạm vi

**Files:**
- Verify: `docker-compose*.yml`
- Verify: `dev/backend/src/routes/routes_contracts.py`
- Verify: `dev/backend/src/services/storage_service.py`
- Test: các test backend/frontend ở Task 2–4

- [ ] **Step 1: Build/restart đúng container đang chạy**

Run: `docker compose -f dev/docker-compose.yml up -d --build backend frontend`

Expected: backend/frontend chạy image chứa code mới.

- [ ] **Step 2: Thực hiện smoke test với bốn loại file**

Chọn cùng lúc `a.pdf`, `b.jpg`, `c.docx`, `d.xlsx`; mở preview từng file; lưu hợp đồng; kiểm tra mỗi file có request POST riêng và status 200.

- [ ] **Step 3: Đối chiếu database và MinIO**

Kiểm tra số dòng `dossier_documents` của hợp đồng bằng số file thành công và đếm object dưới prefix `contracts/{contract_id}/source-documents/`. Không chỉ dựa vào toast frontend.

- [ ] **Step 4: Kiểm tra log lỗi có định danh file**

Run: `docker logs --since 10m bachkhoa-erp-dev-backend-1`

Expected: nếu có lỗi, log thể hiện contract id, tên file, status và detail; không còn lỗi Unicode header khi trả tài liệu DOCX.

- [ ] **Step 5: Chạy toàn bộ verification trước khi bàn giao**

Run: `docker exec bachkhoa-erp-dev-backend-1 pytest -q`

Run: `npm run test -- --run`

Run: `npm run build`

Expected: tất cả test pass và build thành công; chỉ sau đó mới báo hoàn tất.

## OpenCode delegation

OpenCode có thể được điều khiển từ CLI bằng lệnh dạng:

```powershell
opencode run --dir T:\github\bachkhoa-erp --model <provider>/<model-id> --auto "Implement Task 1 from docs/superpowers/plans/2026-08-27-contract-file-staging-preview-upload.md. Run the targeted tests and report changed files and failures."
```

Quy trình đề xuất là để agent OpenCode thực hiện từng task trong worktree hiện tại, sau mỗi task dừng lại; Codex kiểm tra diff, GitNexus impact trước các chỉnh sửa symbol, chạy test/build, rồi review lại trước khi giao task tiếp theo. Không bật `--auto` nếu chưa chấp nhận việc agent tự thực thi lệnh ghi file.

Hiện `opencode models` chỉ hiển thị các model `opencode/*`; `ox alpha` chưa có provider/model ID trong cấu hình CLI, nên cần xác định đúng chuỗi model hoặc đăng nhập provider trước khi chạy agent bằng model đó.
