# 🔵 THIẾT KẾ UI — BỂ VIỆC (TASK POOL) TRANG NHÂN VIÊN

> Mockup markdown cho **Bể việc tự nhận** của trang nhân viên (Bách Khoa ERP).

---

## 0. NGUYÊN TẮC MODEL (đã chốt)

1. **1 THẺ = TRỌN CHUỖI K CỦA 1 HẠNG MỤC**, thuộc **1 phòng ban**. Không có thẻ K06/K08/bàn giao rời — bàn giao, nộp… là **bước bên trong chuỗi**.
2. **Nhận là ôm cả hạng mục → phải làm HẾT** mọi node của chuỗi đó (theo phòng ban của mình):
   - NV **Đo vẽ** nhận hạng mục Đo vẽ → làm hết chuỗi đo vẽ.
   - NV **Pháp lý** nhận hạng mục Pháp lý → làm hết chuỗi pháp lý.
   - NV **Xin phép XD** nhận hạng mục XPXD → làm hết chuỗi XPXD.
3. **Bận 1 node** → bấm **gửi node đó lên Bể việc nhờ hỗ trợ** (Help). Trong lúc chưa ai nhận, node vẫn thuộc trách nhiệm mình.
4. **Hạn mức = 3 hạng mục.** Đang giữ đủ 3 mà **không ai nhận hỗ trợ** → **buộc tự làm xong** mới được nhận chuỗi hạng mục mới.
5. Mỗi NV chỉ thấy **hạng mục + node hỗ trợ của phòng ban mình** (lọc bằng `task_pool_department_code`).

> **Khoán:** cộng khi checklist được **DUYỆT** (→ `work_pay_entitlements`), thẻ chỉ ghi **khoán dự kiến** (từ `work_item_rates`).

---

## 1. VỊ TRÍ TRÊN TRANG NHÂN VIÊN

```
┌───────────────────────────────────────────────────────────────────────┐
│ Chào buổi sáng, Nguyễn Văn A · Phòng Đo vẽ            [ Check-out ]     │
├───────────────────────────────────────────────────────────────────────┤
│ 🔵 BỂ VIỆC (tự nhận)   ← trên cùng, chỉ hiện hạng mục phòng Đo vẽ       │
├───────────────────────────────────────────────────────────────────────┤
│ ⏱ ĐANG LÀM (các node của hạng mục đã nhận)                             │
├───────────────────────────────────────────────────────────────────────┤
│ 📅 LỊCH LÀM VIỆC                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 2. HEADER + ĐỒNG HỒ TẢI

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ 💼 Bể việc Phòng Đo vẽ · 3 hạng mục sẵn sàng nhận                                  │
│ Tải của bạn: ██████░░░ 2/3 hạng mục · 🟢 nhận thêm 1                               │
│                                                                                    │
│ Lọc: [● Hạng mục nhận trọn 3]   [🆘 Node cần hỗ trợ 1]                             │
└──────────────────────────────────────────────────────────────────────────────────┘
```
- Chỉ hiện **hạng mục của phòng ban đang đăng nhập**.
- Đủ **3/3** → mờ hết nút "Nhận chuỗi", chỉ còn được bấm hỗ trợ / làm nốt việc cũ.

---

## 3. THẺ HẠNG MỤC (NHẬN TRỌN CHUỖI) — loại chính

### 3.1 · Hạng mục ĐO VẼ (chuỗi đo vẽ có hỗ trợ nộp)

```
┌─────────────────────────────────────────────────────────────┐
│ 📐 ĐO VẼ · Đo vẽ hiện trạng vị trí thửa đất                 │  ← service_package · hạng mục (task_type)
│ HĐ 014/BK-2026 · KH: Anh Tuấn · 📍 P. Tân Phong, Q.7        │  ← contract · customer · địa điểm
│ ⚡ Gấp · ⏱ Hạn cả chuỗi: 1 ngày                              │  ← priority · deadline
│ ───────────────────────────────────────────────────────────  │
│ 📋 TRỌN CHUỖI 6 BƯỚC — NHẬN LÀ LÀM HẾT:                      │
│   K01 Tiếp nhận & kiểm tra đầu vào ················· (—)      │
│   K02 Khảo sát & đo hiện trường ··················· 250k     │  ← role_amounts, có checklist
│       ☐ 4 ảnh mốc ranh GPS   ☐ File .csv toạ độ             │
│   K03 Chuẩn hoá tài liệu kỹ thuật (CAD) ··········· 200k     │
│       ☐ Bản vẽ .dwg đúng chuẩn   ☐ Xuất PDF                 │
│   K06 Hỗ trợ nộp một cửa ·························· 100k     │
│       ☐ Ảnh phiếu tiếp nhận                                  │
│   K08 Nhận kết quả & bàn giao ····················· 100k     │
│       ☐ Khách ký biên bản   ☐ Ảnh biên bản                 │
│   K09 Lưu trữ & đóng hồ sơ ························· (—)      │
│ ───────────────────────────────────────────────────────────  │
│ 💰 Tổng khoán dự kiến cả chuỗi: 650.000đ                    │  ← Σ khoán các bước
│              [ 🚀 NHẬN TRỌN HẠNG MỤC NÀY ]                   │  → claim cả chuỗi (service_line)
└─────────────────────────────────────────────────────────────┘
```

### 3.2 · Hạng mục PHÁP LÝ (chuỗi pháp lý có hồ sơ)

```
┌─────────────────────────────────────────────────────────────┐
│ ⚖️ PHÁP LÝ · Tách thửa                                      │  ← màu cam
│ HĐ 008/BK-2026 · KH: Anh Phát · 📍 P. Tân Thuận, Q.7        │
│ ★ Ưu tiên · ⏱ Hạn cả chuỗi: 5 ngày                          │
│ ───────────────────────────────────────────────────────────  │
│ 📋 TRỌN CHUỖI 5 BƯỚC — NHẬN LÀ LÀM HẾT:                      │
│   K01 Tiếp nhận & kiểm tra đầu vào ················· (—)      │
│   K05 Soạn bộ hồ sơ pháp lý ······················· 200k     │
│       ☐ Gom giấy tờ   ☐ Rà quy hoạch                        │
│   K06 Nộp & theo dõi hồ sơ (vòng đời cơ quan) ····· 100k     │
│       ☐ Số biên nhận + ngày hẹn tr  (panel biên nhận)       │
│   K08 Nhận kết quả & bàn giao ····················· 100k     │
│       ☐ Kế toán duyệt phí ✓   ☐ Khách ký biên bản          │
│   K09 Lưu trữ & đóng hồ sơ ························· (—)      │
│ ───────────────────────────────────────────────────────────  │
│ 💰 Tổng khoán dự kiến cả chuỗi: 400.000đ                    │
│              [ 🚀 NHẬN TRỌN HẠNG MỤC NÀY ]                   │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 · Hạng mục XIN PHÉP XÂY DỰNG *(chuỗi tương tự — màu xanh lá)*
```
┌─────────────────────────────────────────────────────────────┐
│ 🏗️ XIN PHÉP XD · Xin phép xây dựng mới                      │
│ HĐ 0xx · KH: ... · 📍 ...   ⏱ Hạn cả chuỗi: N ngày          │
│ 📋 TRỌN CHUỖI: K01 → K05 hồ sơ XD → K06 nộp SXD → K08 nhận GP│
│    (mỗi bước + checklist + khoán, giống trên)               │
│ 💰 Tổng khoán dự kiến: xxx.000đ   [ 🚀 NHẬN TRỌN HẠNG MỤC ] │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. THẺ NODE CẦN HỖ TRỢ (Help / Cứu viện) — loại phụ

> Là **1 node lẻ** ai đó đang ôm nhưng bận, bắn lên nhờ làm hộ. Chỉ hiện cho cùng phòng ban.

```
┌─────────────────────────────────────────────────────────────┐
│ 🆘 CẦN HỖ TRỢ · K03 Chuẩn hoá CAD                [viền đỏ]  │
│ Thuộc HĐ 011/BK-2026 · KH: Chị Hạnh · 📍 P. Phú Mỹ, Q.7     │
│ 👤 Người nhờ: Lê Văn C — "Sốt cao, không ngồi vẽ được"      │  ← replacement_reason
│ 📎 Kế thừa sẵn: 4 ảnh GPS + file toạ độ K02                 │  ← inherited_files
│ ☐ Bản vẽ .dwg   ☐ Xuất PDF                                  │
│ 💰 Khoán bước này: 200.000đ   ⏱ SLA 4 giờ                  │
│           [ 🆘 NHẬN LÀM HỘ NODE NÀY ]                        │  → claim node lẻ (không tính là 1 hạng mục mới nếu chỉ giúp)
└─────────────────────────────────────────────────────────────┘
```
- Không ai nhận trong SLA → thông báo nhắc **người nhờ tự làm**.
- Người nhờ **vẫn giữ tải** hạng mục đó cho tới khi node được đóng.

---

## 5. HÀNH VI HẠN MỨC & NÚT

| Tình huống | Hiển thị |
| :--- | :--- |
| Còn slot (giữ < 3) | 🟢 `[ 🚀 NHẬN TRỌN HẠNG MỤC ]` sáng |
| **Đủ 3/3 hạng mục** | 🚫 mờ hết nút "Nhận trọn", banner "Làm xong 1 hạng mục mới nhận thêm được" |
| Đang có node chạy dở | vẫn nhận hỗ trợ được, nhưng ưu tiên làm xong |
| Node đang có người ưu tiên | badge "Đang có người làm", không nhận chồng |

---

## 6. BACKEND CẦN ĐIỀU CHỈNH (khớp model này)

| # | Việc | Hiện trạng |
| :--- | :--- | :--- |
| **1** | `get_task_pool` **gộp node theo `service_line` (hạng mục)** → 1 item = 1 chuỗi (mảng các bước + checklist + khoán + tổng) | Hiện trả **per-node** → phải gộp |
| **2** | Thêm **checklist** vào từng bước của item | Chưa có |
| **3** | **Claim = nhận cả chuỗi**: tạo `task_node_assignments` (role MAIN) cho **mọi node** của hạng mục cho 1 người | Hiện claim per-node |
| **4** | Hạn mức đếm theo **`service_line` (hạng mục)**, tối đa 3 | Pool guards đã có, cần đếm theo hạng mục |
| **5** | **Help/Cứu viện**: `POST /tasks/{node}/yield-to-pool` + nhận `claim-help` node lẻ | yield chưa có |

---

## 7. CHUỖI K THẬT THEO TEMPLATE (tham chiếu code)

| Gói | Template | Chuỗi bước |
| :--- | :--- | :--- |
| Đo vẽ | Quy trình Đo vẽ có hỗ trợ nộp | K01 → K02 đo → K03 CAD → K06 nộp → K08 bàn giao → K09 |
| Đo vẽ | Đo vẽ nhà (không nộp) | K01 → K02 → K03 → K08 → K09 |
| Pháp lý | Pháp lý có hồ sơ | K01 → K05 hồ sơ → K06 nộp (vòng đời) → K08 → K09 |
| Pháp lý | Tách thửa có sẵn hồ sơ | K01 → K05 → K08 → K09 |

*(node_key template: receive=K01, survey=K02, standardize=K03, prepare=K05, submit=K06, deliver=K08, archive=K09)*
