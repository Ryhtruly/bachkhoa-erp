# Xem va luu DOCX hop dong tu du lieu hien tai

## Muc tieu

Khi tao hop dong, nguoi dung tu chon vi tri luu file Word tren may. Nut **Mo tai lieu** xem noi dung DOCX ngay trong ung dung, khong tai xuong va khong dung PDF. Moi lan xem hoac luu, DOCX phai duoc dung tu du lieu dang luu hien tai cua hop dong.

## Pham vi

- Khong luu DOCX vao `static/generated_docs`, MinIO, hay bat ky kho luu tru server nao.
- Khong dung PDF.
- Khong mo rong viec luu `customer_email`, `due_date`, hay `sales_source`. Cac truong nay se rong neu ban ghi hien tai khong co gia tri tuong ung.
- Khong su dung `render_data_snapshot` de tao noi dung DOCX nua. Du lieu snapshot cua cac ban ghi cu duoc giu nguyen de tuong thich nguoc, nhung khong duoc doc trong luong xem/tai moi.

## Thiet ke

### 1. Tao va luu DOCX tren may

1. Su kien bam **Luu hop dong** goi ngay `window.showSaveFilePicker` voi ten DOCX goi y, truoc moi `await` goi API.
2. Neu nguoi dung huy hop chon vi tri, dung luong va khong tao hop dong.
3. Neu trinh duyet khong ho tro File System Access API, thong bao ro rang va khong tao hop dong; khong co co che tu dong download.
4. Sau khi co file handle, frontend goi `POST /api/contracts/generate` de luu hop dong.
5. Frontend tai DOCX tu URL duoc tra ve, co Bearer token, ghi Blob vao handle da chon, dong writable stream va thong bao thanh cong.
6. Neu tao hop dong thanh cong nhung tai/ghi DOCX that bai, hop dong van ton tai. UI thong bao loi va nguoi dung co the xem tai lieu de thu luu lai sau.

### 2. Dung DOCX tu du lieu hien tai

Endpoint `GET /api/contracts/{contract_id}/document` kiem tra quyen `contract:read`, tai hop dong va cac ban ghi lien quan hien tai, sau do dung DOCX trong bo nho bang template hien hanh.

Nguon du lieu theo thu tu:

| Truong template | Nguon hien tai |
| --- | --- |
| Ma, gia tri, ngay ky, dich vu | `Contract` |
| Ten, dien thoai, dia chi, email | `Customer` |
| Dia chi/dich vu/gia hang muc | `ServiceLine` |
| Han thanh toan | `Receivable` |
| Nguon ban | `LeadPipeline` cua hop dong |

Khi quan he hoac gia tri chua ton tai, renderer nhan chuoi rong. Khong thay bang gia tri snapshot, gia tri mac dinh suy doan, hay du lieu tu hop dong khac.

`ContractGeneratedDocument` chi con vai tro metadata rang tai lieu da duoc phat hanh va duong dan API bao ve; endpoint khong phu thuoc snapshot de phuc vu tai lieu.

### 3. Xem tai lieu trong web

Frontend tai DOCX qua fetch co Bearer token, giu Blob trong bo nho va dung `docx-preview` de render vao modal xem tai lieu cua trang Hop dong. Khong mo tab moi, khong tao lien ket download, va thu hoi tai nguyen khi dong modal.

### 4. Xu ly loi

- Huy Save As: thong bao trung tinh, khong goi API tao hop dong.
- Khong ho tro picker: thong bao can dung trinh duyet ho tro, khong fallback download.
- Loi tao hop dong: khong ghi vao file handle.
- Loi lay/render DOCX: modal hien thong bao loi; trang hop dong van su dung duoc.
- Loi ghi file sau khi hop dong da tao: thong bao hop dong da luu trong he thong va chi dan nut xem tai lieu de thu lai.

## Kiem thu

- Unit test frontend cho viec lay file handle truoc network, huy picker, trinh duyet khong ho tro va ghi Blob vao handle.
- Unit test frontend cho tai DOCX co Authorization va render/cleanup viewer.
- Unit test backend cho mapping tu cac model hien tai, gia tri rong khi du lieu khong ton tai va phan hoi DOCX inline.
- Build frontend va chay cac unit test an toan; backend integration chi chay voi `TEST_DATABASE_URL` dung co so du lieu test duoc phep.

## Tieu chi chap nhan

1. Edge hien Save As khi nguoi dung bam Luu hop dong.
2. Khong co DOCX moi trong `static/generated_docs` sau luong tao hop dong.
3. Mo tai lieu hien noi dung Word trong ung dung, khong kich hoat tai file va khong dung PDF.
4. Cap nhat du lieu hop dong da duoc luu se phan anh o lan xem/luu DOCX ke tiep.
5. Cac truong email, han thanh toan va nguon ban chua luu se khong hien gia tri snapshot cu.
