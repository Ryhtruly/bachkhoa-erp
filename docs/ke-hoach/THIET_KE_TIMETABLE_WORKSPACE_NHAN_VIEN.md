# 🏢 BẢN ĐẶC TẢ KIẾN TRÚC & THIẾT KẾ: BỘ ĐÔI MÀN HÌNH TIMETABLE (NHÂN VIÊN & GIÁM ĐỐC) — BACH KHOA ERP

> **Tôn chỉ thiết kế cốt lõi:**  
> 1. **Cơ Chế Nhân Viên Làm Thêm Giờ & Nộp Xong Sớm (Overtime & Early Finish):**
>    - **Nút nộp 24/7:** Nhân viên ở lại tối làm thêm (18:00–21:00) hoặc làm ở nhà đều có thể nộp nghiệm thu bất kỳ lúc nào.
>    - **Tự động giải phóng lịch ngày hôm sau:** Block giữ chỗ `[ 🔗 Ngày 2/2 ]` trên ngày tiếp theo tự động biến mất, trả về trạng thái `⚪ TRỐNG LỊCH (RẢNH)`.
>    - **Tối ưu năng suất cho Sếp:** Cột ngày hôm sau trên Bảng Điều Phối chuyển sang màu xanh rảnh ➔ Sếp có thể giao ngay việc mới cho nhân viên.
>    - **Đẩy nhanh tiến độ HĐ (DAG Acceleration):** Node tiếp theo chuyển sang `READY` sớm hơn 1 ngày.
> 2. **Giải Pháp Thiết Kế Cho Việc Kéo Dài 2 Ngày (Multi-Day Tasks):**
>    - **Nguyên tắc "Không vẽ xuyên đêm":** Không kéo dải nối qua đêm (18:00 ➔ 07:30 sáng hôm sau là vô lý).
>    - **Dải All-Day Banner Header:** Dải ruy-băng nằm ngang đầu ngày vắt ngang 2 cột Thứ 4 & Thứ 5 để nhận diện ngay công việc kéo dài 2 ngày.
>    - **Khối Day-Chunking trên Trục giờ:** Tách làm 2 block giờ hành chính chuẩn (08:00–17:30, trừ 11:30–13:00 nghỉ trưa) kèm huy hiệu `[ 🔗 Ngày 1/2 ]` và `[ 🔗 Ngày 2/2 ]`.
> 3. **Timetable To Rộng, Thoáng Đãng (Maximize Real Estate):**
>    - Mở rộng container toàn màn hình (`max-width: 100%`), Timetable chiếm **85%–100% diện tích**.
>    - Bổ sung nút **`[ ⛶ Mở rộng toàn màn hình / Thu gọn Sidebar ]`**.
>    - Tăng chiều cao slot giờ lên **48px–56px**, chữ to rõ, không co rút.
> 4. **Khớp 100% Tên 7 Node Chuẩn Hóa (`K01`, `K02`, `K03`, `K05`, `K06`, `K08`, `K09` — Bỏ K04 và K07)**.
> 5. **3 Trọng Tâm Cốt Lõi:** Phân việc thông minh · Quản lý thời gian · Quản lý tiến độ HĐ.

---

# PHẦN 1: NGUYÊN LÝ KHOA HỌC XÁC ĐỊNH "QUÁ TẢI" (THE OVERLOAD PRINCIPLE)

| Tiêu Chí Quá Tải | Khối ĐO VẼ KỸ THUẬT (Phụ trách K02 & K03) | Khối PHÁP LÝ HỒ SƠ (Phụ trách K05, K06, K08) |
|---|---|---|
| **Bản chất công việc** | **Vật lý tại thực địa & Nội nghiệp:** Khảo sát & đo hiện trường K02, Chuẩn hoá tài liệu kỹ thuật K03. | **Hành chính & Một Cửa:** Soạn bộ hồ sơ K05, Nộp & theo dõi K06, Nhận kết quả & bàn giao K08. |
| **Giới hạn thời gian** | Tối đa **8.0 giờ/ngày** (gồm cả thời gian chạy xe ngoài đường). | Bị bó hẹp theo **Giờ mở cửa Cơ quan Nhà nước** (07:30–11:00 & 13:30–16:30). |
| **Định mức trần/ngày** | **Tối đa 2 – 3 thửa đất/ngày** (mỗi thửa 2.0h – 2.5h). | **Tối đa 2 cơ quan/buổi** (mỗi nơi mất 1.5h xếp hàng). |
| **Báo động 🔴 QUÁ TẢI khi:** | 1. Tổng giờ làm trong ngày **> 8.0 giờ**.<br>2. Có **≥ 2 lịch đo ở 2 Quận/Huyện khác nhau** trong cùng 1 buổi (Dựa trên `property_address`).<br>3. Bị **trùng giờ đo K02** tại 2 thửa đất khác nhau. | 1. Bị giao nộp **≥ 2 cơ quan ở 2 Quận khác nhau** trong cùng 1 buổi (Dựa trên `submitted_agency`).<br>2. Đang ôm **> 10 hồ sơ** cùng có hạn nộp bổ sung trong tuần.<br>3. Hồ sơ K06 bị cơ quan trả về yêu cầu giải trình gấp trong 24h. |
| **Chiến lược San Tải** | **Gom cùng địa bàn:** Thửa đất gần nhau cho 1 đội đi đo 1 lần. | **Gom cùng cơ quan (Batching):** Nộp 3 hồ sơ cùng ở VPĐK Q.7 cho 1 người đi. |

---

# PHẦN 2: MÀN HÌNH NHÂN VIÊN (HIỂN THỊ KHI LÀM THÊM TỐI & XONG SỚM)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┬──────────────────────┐
│ 👤 Nguyễn Văn A (Phòng Đo Vẽ) · Hôm nay: Thứ 4, 19/08/2026                                            [ ⛶ Mở rộng toàn màn hình ]     │ 🏖️ PHÉP NĂM & LƯƠNG  │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────┤
│ 📅 LỊCH LÀM VIỆC CỦA TÔI  [ < ]  17/08 – 23/08/2026  [ > ]  [ Hôm nay ]  | 🔍 [ 🏷️ Tất cả việc ▾ ] | Chế độ: (•) Tuần ( ) Ngày             │ • Phép năm: 12 ngày  │
├─────────┬──────────────────────────┬──────────────────────────┬───────────────────────────────┬──────────────────────────────┬─────────┤ • Khoán tuần này:    │
│ TRỤC GIỜ│ THỨ 2 (17/08)            │ THỨ 3 (18/08)            │ THỨ 4 (19/08 - HÔM NAY)       │ THỨ 5 (20/08 - ĐÃ GIẢI PHÓNG)│ THỨ 6   │   💰 3.600.000 đ     │
├─────────┼──────────────────────────┼──────────────────────────┼───────────────────────────────┼──────────────────────────────┼─────────┤   [ + Tạo đơn nghỉ ] │
│ 07:30   │                          │                          │ ┌───────────────────────────┐ │ ⚪ TRỐNG LỊCH (RẢNH)         │         ├──────────────────────┤
│   │     │                          │                          │ │ [🟢 Xong] 001/BK-2026      │ │ (Đã xong sớm từ tối T4 🟢)  │         │ 🔔 NHẮC TIẾN ĐỘ KHẨN │
│ 08:30   │ ┌──────────────────────┐ │                          │ │ [K02] Khảo sát & đo       │ │                              │         │ • 🛡️ Sếp duyệt nợ H04│
│   │     │ │ [🟢 Xong] 002/BK-2026 │ │                          │ │       hiện trường         │ │ [ + Nhận việc mới ]        │         │   (Sẵn sàng K08)     │
│ 09:30   │ │ [K02] Khảo sát & đo  │ │                          │ │ ⏱ 07:30–09:00 (1.5h)       │ │                              │         │                      │
│   │     │ │       hiện trường    │ │                          │ └───────────────────────────┘ │                              │         │ 📁 TÀI LIỆU GHIM     │
│ 10:30   │ │ ⏱ 08:30–10:30 (2.0h) │ │ ┌──────────────────────┐ │ ┌───────────────────────────┐ │                              │         │ • 📄 BB bàn giao K08 │
│   │     │ └──────────────────────┘ │ │ [K03] Chuẩn hoá tài  │ │ │ [🔵 Chờ duyệt] 001/BK-2026  │ │                              │         │ • 📐 Ký hiệu đo 2026 │
│ 11:30   │                          │ │       liệu kỹ thuật  │ │ │ [K03] Chuẩn hoá tài       │ │                              │         │                      │
│         │                          │ │ ⏱ 10:30–11:30 (1.0h) │ │ │       liệu kỹ thuật       │ │                              │         │ ⚡ LIÊN KẾT NHANH    │
│         │                          │ └──────────────────────┘ │ │ ⏱ 09:30–11:00 (1.5h)        │ │                              │         │ [ 📖 Sổ tay NV ]     │
├─────────┴──────────────────────────┴──────────────────────────┴───────────────────────────────┴──────────────────────────────┴─────────┤ [ 🏢 Sơ đồ TC ]      │
│ ☕ 11:30 – 13:00 : NGHỈ TRƯA & ĂN CƠM (KHUNG GIỜ KHÓA - KHÔNG XẾP LỊCH)                                                                 │                      │
├─────────┬──────────────────────────┬──────────────────────────┬───────────────────────────────┬──────────────────────────────┬─────────┤                      │
│ 13:00   │                          │                          │                               │                              │         │                      │
│   │     │                          │                          │ 🔴 14:15 ━━━━━━━━━━━━━━━━━━━━━┿━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┿━━━━━━━━━┥                      │
│ 14:00   │                          │ ┌──────────────────────┐ │ ┌───────────────────────────┐ │                              │         │                      │
│   │     │                          │ │ [🔵 Chờ] 003/BK-2026 │ │ │ [🔴 ĐANG CHẠY] HĐ004/BK   │ │                              │         │                      │
│ 15:00   │                          │ │ [K03] Chuẩn hoá tài  │ │ │ [K02] Khảo sát & đo       │ │                              │         │                      │
│   │     │                          │ │       liệu kỹ thuật  │ │ │       hiện trường         │ │                              │         │                      │
│ 16:00   │                          │ │ ⏱ 14:00–15:30 (1.5h) │ │ │ ⏱ 14:00–16:30 (2.5h)      │ │                              │         │                      │
│   │     │                          │ └──────────────────────┘ │ │ 📍 123 Nguyễn Thị Thập, Q.7 │ │                              │         │                      │
│ 17:00   │                          │                          │ └───────────────────────────┘ │                              │         │                      │
│ 18:00   │                          │                          │ ┌───────────────────────────┐ │                              │         │                      │
│   │     │                          │                          │ │ 🌟 [TỐI LÀM THÊM: 18–20h] │ │                              │         │                      │
│ 20:00   │                          │                          │ │ [🟢 XONG SỚM] HĐ004/BK     │ │                              │         │                      │
│         │                          │                          │ │ [K03] Chuẩn hoá tài liệu  │ │                              │         │                      │
│         │                          │                          │ │ ⏱ 18:00–20:15 (2.25h)      │ │                              │         │                      │
│         │                          │                          │ └───────────────────────────┘ │                              │         │                      │
└─────────┴──────────────────────────┴──────────────────────────┴───────────────────────────────┴──────────────────────────────┴─────────┴──────────────────────┘
```
