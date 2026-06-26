---
name: openclaw_erp_commercial
description: >
  Skill cốt lõi để xây dựng và triển khai hệ thống OpenClaw — AI Agent ERP đa ngành.
  Sử dụng skill này bất cứ khi nào người dùng muốn tự động hóa nghiệp vụ doanh nghiệp,
  xây dựng luồng OpenClaw, thiết lập các module Quản trị Giám đốc, CRM Bán hàng, 
  Sản xuất/Nhân sự, và Tài chính. Skill này cung cấp bộ khung Prompt chuẩn mực để
  AI Agent hiểu và triển khai trọn vẹn 20 workflow tự động hóa cốt lõi.
---

# OpenClaw — AI Agent ERP (Bản Thương Mại Tổng Quát)

## Tổng quan
OpenClaw là giải pháp AI Agent trung tâm giúp tự động hóa toàn bộ luồng vận hành của một doanh nghiệp. Mục tiêu cuối cùng là tạo ra một hệ thống tự chạy từ khâu tiếp nhận khách hàng, tạo báo giá/hợp đồng, theo dõi tiến độ sản xuất, tính lương tự động đến báo cáo Dashboard cho CEO.

## Hướng dẫn sử dụng Skill
Khi được yêu cầu thiết lập hệ thống OpenClaw cho một doanh nghiệp bất kỳ, hãy đọc kỹ các tài liệu trong thư mục này theo thứ tự:

1. **`00_master_agent_prompt.md`**: Hiểu vai trò, kiến trúc 5 module và danh sách 20 nghiệp vụ (NV01-NV20) cần có.
2. **`01_database_schema_context.md`**: Nắm vững cấu trúc Database lõi (CRM, Production, Finance, HR) để thiết lập lưu trữ (bất kể dùng Excel, Google Sheets hay SQL).
3. **`02_crm_sales_workflow.md`**: Thiết lập luồng tự động cho việc Sale, Báo giá, Hợp đồng và Chăm sóc khách hàng.
4. **`03_production_hr_workflow.md`**: Thiết lập luồng Giao việc, Theo dõi deadline, Chấm công và Tính lương KPI tự động.
5. **`04_finance_dashboard_workflow.md`**: Thiết lập luồng Thu chi, Công nợ và Báo cáo Dashboard tự động gửi CEO.

## Nguyên tắc thiết kế
- **Lấy Data làm trung tâm**: Mọi hoạt động sinh ra từ AI đều phải được ghi log lại vào Database chung để các module khác kế thừa.
- **Micro-architecture**: Mã nguồn xử lý (Backend) phải được chia nhỏ thành các module/service độc lập để dễ bảo trì và dễ đổi Database (VD: từ Excel sang Google Sheets).
- **Tích hợp API Mở**: Luôn thiết kế sẵn các cổng giao tiếp (Webhook/API) để cắm thêm các dịch vụ bên thứ 3 (Telegram Bot, Zalo OA, Camera Hanet, AI Vision).
