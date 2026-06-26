---
name: openclaw
description: >
  Skill xây dựng và triển khai hệ thống OpenClaw — AI Agent ERP cho Công ty Đo đạc Bách Khoa.
  Sử dụng skill này bất cứ khi nào người dùng đề cập đến: tự động hóa nghiệp vụ Bách Khoa,
  xây dựng flow OpenClaw, thiết kế module CRM/Hồ sơ/Nhân sự/Tài chính/Quy hoạch, tích hợp
  Google Sheet + Zalo OA + Telegram + Google Docs + Airtable + n8n, tạo hợp đồng tự động,
  báo giá tự động, pipeline bán hàng, quản lý hồ sơ đo vẽ, tính lương 3P, KPI dashboard,
  hoặc bất kỳ nghiệp vụ nào trong file Lập_trình_cds_Bách_Khoa_x_Wifim.xlsx.
  Kích hoạt skill này ngay cả khi người dùng chỉ hỏi về "OpenClaw", "Bách Khoa ERP",
  "tự động hóa Bách Khoa", hay "hệ thống quản lý đo đạc".
---

# OpenClaw — AI Agent ERP cho Công ty Đo đạc Bách Khoa

## Tổng quan hệ thống

OpenClaw là AI Agent trung tâm kết nối và tự động hóa toàn bộ nghiệp vụ của Công ty TNHH Kiến Trúc Xây Dựng & Đo Đạc Bản Đồ Bách Khoa. Mục tiêu cuối cùng: **1 Dashboard cho Giám đốc — mở điện thoại là biết công ty đang thế nào**.

## Kiến trúc tổng thể

```
NGUỒN ĐẦU VÀO          OPENCLAW CORE              ĐẦU RA
─────────────          ─────────────────          ────────
Zalo OA/Bot      →                         →    PDF/Word/Link
Website/Form     →    AI Agent Router      →    Báo cáo KPI
Facebook/Call    →    + Business Logic     →    Zalo/Telegram
Camera Hanet     →    + Scheduler/Cron     →    Dashboard CEO
MST.vn/API      →    + Log Engine         →    Hợp đồng/HĐ
                       ↕
              Google Sheet | Google Drive
              Google Docs  | Airtable
              Telegram     | n8n/webhook
```

## 8 Module nghiệp vụ chính

Đọc file references chi tiết theo từng module:
- `references/module-01-giam-doc.md` — Dashboard điều hành
- `references/module-02-crm.md` — CRM & Khách hàng
- `references/module-03-ho-so.md` — Hồ sơ & Sản xuất
- `references/module-04-nhan-su.md` — Nhân sự & Lương
- `references/module-05-tai-chinh.md` — Tài chính & Kế toán
- `references/module-06-quy-hoach.md` — AI Quy hoạch
- `references/module-07-seo.md` — SEO & Marketing
- `references/module-08-tri-thuc.md` — Tri thức doanh nghiệp

## Luồng nghiệp vụ cốt lõi (20 tác vụ tự động)

### Nhóm 1: Bán hàng & CRM

**NV01 — Báo giá tự động**
- Input: Loại dịch vụ, diện tích, vị trí, đơn giá
- Flow: Nhân viên nhập → OpenClaw tính giá từ bảng đơn giá → xuất PDF báo giá → lưu Airtable
- Output: File PDF báo giá + lịch sử trong Sheet

**NV02 — Báo giá theo ISO (từ Web/FB/Zalo/Call)**
- Input: Danh sách dịch vụ, số lượng, yêu cầu KH từ đa kênh
- Flow: KH yêu cầu → OpenClaw phân tích → Airtable tra giá → Google Docs template → PDF → Airtable record
- Output: File báo giá PDF + Link sheet

**NV03 — Tạo hợp đồng tự động**
- Input: Mã số thuế, SĐT, số tiền, điều khoản
- Flow: KH yêu cầu → OpenClaw tra MST.vn → Google Docs fill template → Lưu Drive → Gửi link KH + Telegram sales
- Output: File hợp đồng (Google Doc link) + Thông báo Telegram

**NV05 — Pipeline bán hàng (Lead → Chốt)**
- Input: Lead từ Web/FB/Zalo/Call
- Flow: Lead vào Sheet → OpenClaw đánh giá (scoring) → Telegram báo CEO → Sales xử lý → Cập nhật trạng thái
- Output: Pipeline sheet + Báo cáo Telegram

**NV06 — CSKH tự động (Nhắc nợ, bảo hành, sinh nhật)**
- Input: Dữ liệu Công nợ từ Sheet, thông tin KH
- Flow: Cron OpenClaw → Check Sheet → Gửi Zalo/FB/Telegram → Ghi log lịch sử
- Output: KH nhận thông báo + Lịch sử giao tiếp

### Nhóm 2: Hồ sơ & Sản xuất

**NV11 — Quản lý hồ sơ đo vẽ**
- Input: Mã hồ sơ, khách hàng, địa chỉ
- Flow: Tiếp nhận → Phân công kỹ thuật → Đo đạc → Xử lý → Bàn giao
- Output: Báo cáo tiến độ, trạng thái hồ sơ, thời gian xử lý
- Loại hồ sơ: Đo vẽ hiện trạng, Hoàn công, Tách/Hợp thửa, Chuyển mục đích, GPXD

**NV14 — Tra cứu quy hoạch bằng AI**
- Input: Tọa độ, hình ảnh, PDF quy hoạch
- Flow: Tiếp nhận → AI phân tích (PDF/JPG/CAD/VN2000) → Xuất báo cáo PDF
- Output: Báo cáo quy hoạch PDF

### Nhóm 3: Nhân sự & Lương

**NV12 — Tính lương theo cơ chế 3P**
- Input: Mã hồ sơ, nhân viên, đơn giá/hạng mục công việc
- Flow: Đối chiếu hồ sơ hoàn thành → Tính lương P1+P2+P3 → Tổng hợp bảng lương
- Output: Bảng lương tháng

**NV13 — KPI nhân viên**
- Input: Công việc, doanh số, hồ sơ hoàn thành
- Flow: Tổng hợp dữ liệu → Chấm điểm tự động → Báo cáo
- Output: Báo cáo KPI

**NV19 — Chấm công tự động (Camera Hanet)**
- Input: Dữ liệu nhận diện khuôn mặt từ camera Hanet
- Flow: Camera Hanet → Webhook/API → Google Apps Script/n8n → Google Sheet chấm công → Dashboard → Bảng lương
- Output: Báo cáo trễ, ngày nghỉ, tích hợp lương

### Nhóm 4: Tài chính & Báo cáo

**NV07 — KPI Dashboard & Báo cáo CEO**
- Input: Sheet (doanh thu, KPI, lợi nhuận)
- Flow: Cron OpenClaw → Query Sheet → Tính KPI → Telegram báo CEO hàng tuần/tháng
- Output: Báo cáo KPI Telegram + Sheet Dashboard

**NV10 — Quản lý công nợ**
- Input: Hợp đồng, số tiền thu theo đợt
- Flow: Cập nhật thanh toán → Đối chiếu → Gửi nhắc nhở tự động
- Output: Danh sách công nợ + Cảnh báo

**NV15 — Thu chi hàng ngày**
- Input: Phiếu thu, phiếu chi (kết nối mã hồ sơ)
- Flow: Nhập chứng từ → Tổng hợp → Đối chiếu mã hồ sơ
- Output: Sổ quỹ, báo cáo thu chi

### Nhóm 5: AI & Tự động hóa

**NV08 — Tổng đài AI Call Center**
- Input: Cuộc gọi đến
- Flow: KH gọi → AI Voice Agent trả lời 24/7 → Xác định nhu cầu → Trả lời/Chuyển NV → Ghi log → Airtable
- Output: Lịch sử cuộc gọi + Lead mới trong Sheet

**NV16 — Bot Zalo tiếp nhận khách**
- Input: Nội dung khách gửi qua Zalo OA
- Flow: AI phân tích → Tạo hồ sơ → Phân công xử lý
- Output: Thông tin khách hàng + Hồ sơ mới

## Workflow triển khai OpenClaw

### Phase 1 — Nền tảng dữ liệu (tuần 1-2)
1. Thiết lập Google Sheet master (Khách hàng, Hồ sơ, Hợp đồng, Thu chi, Nhân viên)
2. Thiết lập Google Drive cấu trúc folder
3. Kết nối n8n/webhook với các nguồn dữ liệu
4. Cấu hình Airtable cho CRM và Pipeline

### Phase 2 — Module CRM & Hồ sơ (tuần 3-4)
1. Build flow báo giá tự động (NV01, NV02)
2. Build flow tạo hợp đồng qua MST.vn (NV03)
3. Build quản lý hồ sơ đo vẽ (NV11)
4. Tích hợp Zalo OA Bot (NV16)

### Phase 3 — Nhân sự & Tài chính (tuần 5-6)
1. Chấm công camera Hanet → Sheet (NV19)
2. Tính lương 3P tự động (NV12)
3. KPI Dashboard nhân viên (NV13)
4. Quản lý thu chi + công nợ (NV10, NV15)

### Phase 4 — AI & Báo cáo (tuần 7-8)
1. AI Quy hoạch (PDF/CAD analysis) (NV14)
2. KPI Dashboard CEO + Telegram (NV07)
3. CSKH tự động nhắc nợ/bảo hành (NV06)
4. AI Call Center 24/7 (NV08)

### Phase 5 — Tinh chỉnh & Scale (tuần 9-10)
1. Pipeline bán hàng full funnel (NV05)
2. Tri thức doanh nghiệp + AI hỏi đáp nội bộ
3. SEO & Marketing automation
4. Kiểm thử toàn hệ thống, training nhân sự

## Stack công nghệ

| Lớp | Công nghệ | Vai trò |
|-----|-----------|---------|
| AI Agent | OpenClaw (Claude API) | Não bộ xử lý ngôn ngữ, logic |
| Automation | n8n / Make (Integromat) | Workflow orchestration |
| Database | Google Sheet + Airtable | Dữ liệu vận hành |
| Storage | Google Drive | File hồ sơ, bản vẽ, hợp đồng |
| Document | Google Docs | Template hợp đồng, báo giá |
| Notification | Telegram Bot + Zalo OA | Thông báo nội bộ + KH |
| HR/Attendance | Hanet API | Chấm công khuôn mặt |
| Business | MST.vn API | Tra cứu thông tin doanh nghiệp |
| AI Vision | Claude Vision | Phân tích PDF quy hoạch, bản đồ |

## Quy tắc khi dùng skill này

1. **Luôn đọc file references** của module liên quan trước khi thiết kế chi tiết
2. **Ưu tiên Google Sheet** làm nguồn dữ liệu chính (đã có sẵn tại công ty)
3. **Mọi action đều phải ghi log** vào Sheet tương ứng
4. **Thông báo CEO** qua Telegram với mọi sự kiện quan trọng
5. **Template Google Docs** cho tất cả output có định dạng (hợp đồng, báo giá)
6. **Mã hồ sơ là khóa chính** kết nối tất cả các module

## Khi thiết kế chi tiết một nghiệp vụ, cần xác định

- [ ] Tên nghiệp vụ & mã (NVxx)
- [ ] Kênh đầu vào (Zalo/Web/Call/Manual)
- [ ] Dữ liệu đầu vào cần thiết
- [ ] Bảng Google Sheet liên quan
- [ ] Logic xử lý từng bước
- [ ] Template output (nếu có)
- [ ] Điều kiện trigger tự động
- [ ] Thông báo gửi đi (ai nhận, kênh nào)
- [ ] Dữ liệu ghi log lại
- [ ] Điều kiện lỗi & xử lý ngoại lệ
