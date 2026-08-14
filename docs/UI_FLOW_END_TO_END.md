# Flow thao tác trên giao diện — từ tạo hợp đồng đến đóng hồ sơ

Ngày viết: **12/08/2026**
Mục đích: trả lời câu *"tạo quy trình xong rồi phân việc thì sẽ ra sao?"*
Trạng thái: **Mô tả hiện trạng + chỗ còn thiếu — chưa code**

---

## 1. Toàn cảnh: ai làm gì, theo thứ tự nào

```
GIÁM ĐỐC          │ NV ĐO VẼ           │ NV PHÁP LÝ         │ Hệ thống tự làm
──────────────────┼────────────────────┼────────────────────┼──────────────────────
① Tạo hợp đồng    │                    │                    │ → sinh Hạng mục
                  │                    │                    │
② Thiết lập       │                    │                    │
   quy trình      │                    │                    │
   (vẽ node)      │                    │                    │
                  │                    │                    │
③ Phân công       │                    │                    │
   từng node      │                    │                    │
                  │                    │                    │
④ Áp dụng ────────┼──▶                 │                    │ → node đầu: Sẵn sàng
                  │                    │                    │ → chuông báo NV
                  │ ⑤ Bắt đầu làm      │                    │ → tính hạn xử lý
                  │                    │                    │ → sinh hồ sơ Đo vẽ
                  │ ⑥ Nộp minh chứng   │                    │
                  │ ⑦ Nộp nghiệm thu ──┼───▶                │ → chuông báo Giám đốc
⑧ Duyệt đạt ──────┼────────────────────┼──▶                 │ → mở node kế
                  │                    │                    │ → sinh tiền khoán
                  │                    │                    │ → hồ sơ Đo vẽ:
                  │                    │                    │   "Đã bàn giao"
                  │                    │                    │ → chuông: "Có hồ sơ mới"
                  │                    │ ⑨ Tiếp nhận        │ → KPI bắt đầu chạy
                  │                    │ ⑩ Soạn & đi nộp    │
                  │                    │ ⑪ Nhập biên nhận   │
                  │                    │ ⑫ Tạm dừng (lý do) │ → KPI đóng băng
                  │                    │ ⑬ Tiếp tục         │ → KPI chạy lại
                  │                    │ ⑭ Đóng hồ sơ nộp ──┼─▶ MỞ KHOÁ node
                  │                    │   (có kết quả)     │   Bàn giao & lưu trữ
                  │                    │ ⑮ Nhận kết quả,    │
                  │                    │   bàn giao khách   │
                  │                    │ ⑯ Lưu trữ hồ sơ    │
                  │                    │ ⑰ Nộp nghiệm thu ──┼─▶ chuông Giám đốc
⑱ Duyệt node cuối ┼────────────────────┼───────────────────▶│ ✅ QUY TRÌNH XONG
                  │                    │                    │ → Đo vẽ: "Hoàn thành"
                  │                    │                    │ → khoá sửa cả 2 bên
```

**Hai mốc "đóng" khác nhau — chỗ dễ nhầm nhất:**

| | ⑭ Đóng hồ sơ nộp | ⑱ Kết thúc quy trình |
|---|---|---|
| Ai bấm | Nhân viên pháp lý (tại K06) | Giám đốc duyệt nghiệm thu node cuối |
| Nghĩa là | Xong việc với **cơ quan nhà nước** | Xong việc với **khách hàng** |
| Kéo theo | **Mở khoá** node Bàn giao & lưu trữ | Hồ sơ Đo vẽ → *Hoàn thành*, khoá sửa toàn bộ |

**Quy tắc xuyên suốt:** đo vẽ xong **chưa phải** hết việc; đóng hồ sơ ở cơ quan cũng **chưa phải** hết việc. Chỉ khi **bàn giao & lưu trữ xong** thì quy trình mới thật sự kết thúc.

---

## 2. Chi tiết từng màn hình

### ① Tạo hợp đồng — *Giám đốc*
**Ở đâu:** tab **Hợp Đồng** → nút **➕** góc trên phải
**Điền:** mã HĐ (tự sinh) · khách hàng · SĐT · địa chỉ BĐS · **dịch vụ** · giá trị · ngày ký
**Hệ thống tự làm:** tạo khách hàng (nếu chưa có) + **tự sinh 1 Hạng mục** theo dịch vụ đã chọn + tạo công nợ + xuất file Word hợp đồng

> ⚠️ **Khoảng trống 1 — đây có thể là chỗ khiến bạn rối nhất**
> Bạn đã nói *"1 hợp đồng có thể có nhiều Hạng mục"*, nhưng hiện hệ thống **chỉ tạo đúng 1 Hạng mục** lúc tạo hợp đồng, và **không có nút nào để thêm Hạng mục thứ 2**.
> Ví dụ khách mua *Tách thửa – phần đo vẽ* **và** *Tách thửa* (pháp lý) → phải có 2 Hạng mục, nhưng giao diện hiện chỉ cho 1.
> **Cần bổ sung:** nút *"Thêm Hạng mục"* trong khung chi tiết hợp đồng.

### ② Thiết lập quy trình — *Giám đốc*
**Ở đâu:** chọn hợp đồng → nút **Quy trình** (đáy khung chi tiết bên phải)
**Làm gì:**
- Chọn **mẫu quy trình** có sẵn, hoặc **Tự thiết kế**
- **Thêm node** (K01…K09) rồi nối các bước bằng đường mũi tên
- Chọn từng node → khung bên phải có 4 thẻ:

| Thẻ | Đặt gì |
|---|---|
| **Node** | Tên bước · đầu ra nghiệm thu · **thời hạn (ngày + giờ)** · ☑ Bước đo vẽ · ☑ Yêu cầu nộp cơ quan |
| **Checklist** | Các mục phải nghiệm thu · có bắt buộc minh chứng không · **có tính khoán không** (gắn đầu việc + đơn giá) |
| **Phân công** | Ai làm · vai trò (Phụ trách chính / Phụ / Đi nộp…) |
| **Điều kiện** | Nhánh rẽ theo kết quả |

### ③④ Phân công & Áp dụng — *Giám đốc*
Phân công xong bấm **Áp dụng sửa đổi** (phải ghi lý do nếu quy trình đang chạy).
→ Node đầu chuyển **Sẵn sàng**, nhân viên được phân công nhận **chuông báo**.

### ⑤⑥⑦ Làm việc — *Nhân viên đo vẽ*
**Ở đâu:** đăng nhập → tab **Lịch trình** → thấy việc trên lịch tuần (có avatar người phụ trách)
1. Bấm việc → **Bắt đầu làm**
   → hạn xử lý **tự tính** = lúc bấm + thời lượng giám đốc đặt
   → nếu node có cờ *Bước đo vẽ* → **tự sinh 1 dòng** ở tab Hồ Sơ Đo Vẽ
2. Với mỗi mục checklist: **tải minh chứng** lên (ảnh/file)
3. Xong hết → bấm **Nộp nghiệm thu** → giám đốc nhận chuông

### ⑧ Duyệt nghiệm thu — *Giám đốc*
**Ở đâu:** bấm chuông → nhảy thẳng vào đúng node đang chờ
1. Duyệt từng minh chứng (Đạt / Không đạt)
2. Chọn **kết quả** → bấm **Duyệt đạt** (hoặc **Cần làm lại**)

**Hệ thống tự làm:** mở node kế · sinh **tiền khoán** cho người làm · cập nhật hồ sơ Đo vẽ thành *Đã bàn giao* (nếu Hạng mục có kèm pháp lý) hoặc *Hoàn thành* (nếu không) · bắn chuông cho pháp lý

### ⑨→⑭ Xử lý hồ sơ — *Nhân viên pháp lý*
**Ở đâu:** tab **Lịch trình** (ngay tại công việc) **hoặc** tab **Hồ Sơ Pháp Lý**

| Bấm | Từ trạng thái | Sang | KPI |
|---|---|---|---|
| **Tiếp nhận** | Chờ tiếp nhận | Đang xử lý | ▶ bắt đầu |
| **Nhập biên nhận** | Đang xử lý | (giữ nguyên) | — |
| **Tạm dừng** + chọn lý do | Đang xử lý | Tạm dừng | ⏸ đóng băng |
| **Tiếp tục** | Tạm dừng | Đang xử lý | ▶ chạy lại |
| **Đóng hồ sơ nộp** | Đang xử lý | Đã đóng (Lấy được / Bị bác) | ⏹ dừng đếm |

**Ba lý do tạm dừng** (bắt buộc chọn 1):
- **Chờ cơ quan** — đang thẩm định, ra thông báo thuế, đòi bổ sung giấy tờ
- **Chờ đo vẽ** — bản vẽ sai ranh → **đẩy ngược** về nhân viên đo vẽ, họ nhận chuông
- **Chờ nội bộ** — chờ sếp ký, chờ sale hối khách đóng thuế

> **Nút Đóng hồ sơ nộp** chỉ mở khi đã có kết quả từ cơ quan (lấy được, hoặc bị bác hẳn).
> Đóng xong → node **Bàn giao & lưu trữ** mới được phép bắt đầu. **Chưa đóng thì không đi tiếp được.**

### ⑮⑯⑰ Bàn giao & lưu trữ — *Nhân viên pháp lý*
Node này chỉ mở sau khi hồ sơ nộp đã đóng.
1. Đóng lệ phí, đi nhận kết quả · scan & lưu file
2. Bàn giao cho khách, lấy xác nhận · cập nhật công nợ
3. Chuẩn hoá tên file, lưu vào thư mục Hạng mục
4. **Nộp nghiệm thu** → giám đốc duyệt

> **Điều kiện nghiệm thu node này** (theo mô tả K08): đủ file kết quả · có xác nhận bàn giao · **công nợ đạt ngưỡng**.

### ⑱ Duyệt node cuối — *Giám đốc*
Duyệt xong → **quy trình kết thúc thật**: hồ sơ Đo vẽ chuyển *Hoàn thành*, khoá sửa toàn bộ hai phân hệ.

---

## 3. Những chỗ còn thiếu, xếp theo mức cản trở

| # | Thiếu gì | Hậu quả | Mức |
|---|---|---|---|
| 1 | **Nút thêm Hạng mục** vào hợp đồng đã có | Không tạo được hợp đồng nhiều Hạng mục — đúng thứ bạn cần | 🔴 Chặn |
| 2 | Nút **Tiếp nhận / Tạm dừng / Tiếp tục / Đóng** cho pháp lý | Không có máy trạng thái → không biết hồ sơ đang tắc ở đâu | 🔴 Chặn |
| 3 | Chuông **"Có hồ sơ mới từ đo vẽ"** | Pháp lý không biết có việc, phải tự vào dò | 🟠 Cao |
| 4 | **Đẩy ngược về đo vẽ** khi sai bản vẽ | Phải nhắn ngoài hệ thống, mất dấu vết | 🟠 Cao |
| 5 | Trạng thái đo vẽ **không tự cập nhật** | Xong rồi vẫn hiện "Đang thực hiện" (lỗi đang gặp) | 🟠 Cao |
| 6 | **Nhật ký chuyển trạng thái** hồ sơ pháp lý | Không tính được KPI có đóng băng | 🟡 Vừa |
| 7 | Hộp thoại **giật** khi bấm Sửa | Khó chịu, không sai dữ liệu | 🟡 Vừa |

---

## 4. Đề xuất thứ tự làm

**Bước 1 — Thông đường (làm trước):** mục 1 + 2 + 5
→ Sau bước này bạn **chạy trọn được một hồ sơ** từ tạo hợp đồng đến đóng, không phải can thiệp DB.

**Bước 2 — Thông tin liền mạch:** mục 3 + 4 + 6

**Bước 3 — Hoàn thiện:** mục 7 + báo cáo KPI

---

## 5. Cần bạn xác nhận

1. Flow ở mục 1 có đúng cách công ty đang chạy thật không? Chỗ nào lệch?
2. **Nút thêm Hạng mục** (khoảng trống 1) — làm luôn ở Bước 1 chứ?
3. Nút thao tác của pháp lý đặt **trong Lịch trình**, **trong tab Hồ Sơ Pháp Lý**, hay **cả hai**?
