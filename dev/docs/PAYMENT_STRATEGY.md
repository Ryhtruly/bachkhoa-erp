# Chiến Thuật Thanh Toán Tự Động — BachKhoa ERP

## Mục tiêu
Tự động hóa quy trình chi lương từ việc tính lương → tạo file chuyển khoản → xác nhận thanh toán.

---

## 1. Luồng nghiệp vụ tổng quan

```
Nhân viên cập nhật STK ngân hàng
         │
         ▼
HR chốt lương (bấm "Chốt lương")
         │
         ▼
Hệ thống tính lương tự động
├── Lương cơ bản
├── Tiền khoán nhiệm vụ (chính + phụ đo)
├── Phụ cấp (cắm mốc, hủy, ...)
├── Thưởng / Phạt
└── Tổng thực nhận
         │
         ▼
Export file CSV lương (đúng format ngân hàng)
         │
         ▼
HR upload lên Corporate Banking (VCB DigiBiz / eFAST / ...)
         │
         ▼
Giám đốc approve trên app ngân hàng
         │
         ▼
Ngân hàng xử lý → NV nhận tiền trong ngày
         │
         ▼
Download kết quả xác nhận từ ngân hàng
         │
         ▼
Cập nhật payment_status = "Đã thanh toán" trong hệ thống
```

---

## 2. Dữ liệu cần thu thập từ nhân viên

| Trường | Mô tả | Ví dụ |
|--------|-------|-------|
| `bank_name` | Mã ngân hàng | VCB, TCB, MB, ACB, BIDV |
| `bank_account_no` | Số tài khoản | 0123456789 |
| `bank_account_holder` | Tên chủ TK (viết hoa, không dấu) | NGUYEN VAN A |
| `bank_branch` | Chi nhánh / PGD | PGD Ba Dinh |
| `tax_code` | Mã số thuế (cho quyết toán thuế) | 0123456789 |

---

## 3. Định dạng file CSV theo ngân hàng

### Format chuẩn Vietcombank DigiBiz
```csv
STK,Ngân hàng,Tên chủ tài khoản,Số tiền,Nội dung chuyển khoản
0123456789,VCB,NGUYEN VAN A,12500000,Luong T7/2026
9876543210,TCB,TRAN VAN B,32000000,Luong T7/2026
```

### Format VietinBank eFAST
```csv
Số TK,Cơ quan,Tên,Cơ quan chuyển,Số tiền,Ghi chú
0123456789,,NGUYEN VAN A,,12500000,Luong T7/2026
```

### Format通用 (chung cho hầu hết ngân hàng)
```
account_number | bank_code | account_holder_name | amount | description
```

---

## 4. Kiến trúc hệ thống

### 4.1. Monolith (Phù hợp hiện tại)
```
┌─────────────────────────────────────┐
│         BachKhoa ERP (FastAPI)       │
│                                      │
│  ┌──────────┐    ┌──────────────┐   │
│  │ Payroll   │───▶│ Payment      │   │
│  │ Module    │    │ Export       │   │
│  │           │    │ (CSV Generator)│  │
│  └──────────┘    └──────────────┘   │
│                                      │
│  ┌──────────────────────────────┐   │
│  │ TaskPayRecord                 │   │
│  │ payment_status:               │   │
│  │  "Chưa thanh toán"            │   │
│  │  "Chờ ghi nhận"               │   │
│  │  "Đã xuất file"              │   │
│  │  "Đã thanh toán"              │   │
│  │  "Thất bại"                   │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

### 4.2. Event-Driven (Nâng cấp sau)
```
┌──────────┐     ┌──────────┐     ┌──────────────────┐
│ Supabase │────▶│ Debezium │────▶│ Kafka / Redis    │
│ (PostgreSQL)  │  (CDC)    │     │ Streams          │
└──────────┘     └──────────┘     └──────────────────┘
                                          │
                    ┌─────────────────────┤
                    ▼                     ▼
             ┌────────────┐    ┌──────────────┐
             │ Payment    │    │ Notification │
             │ Service    │    │ (Zalo/SMS)   │
             └────────────┘    └──────────────┘
```

---

## 5. Các phương án thanh toán

### Phương án 1: Export CSV (Recommended cho giai đoạn 1)
- **Mô tả:** Hệ thống tạo file CSV → HR upload lên ngân hàng
- **Ưu điểm:** Đơn giản, không cần API tích hợp, mọi ngân hàng đều hỗ trợ
- **Nhược:** Thủ công 1 bước (upload file)
- **Chi phí triển khai:** Thấp
- **Thời gian:** 2-3 ngày phát triển

### Phương án 2: VietQR API
- **Mô tả:** Gọi VietQR API tạo QR code cho từng khoản lương → gửi link QR cho NV qua Zalo
- **Ưu điểm:** NV nhận tiền ngay, không cần bank portal
- **Nhược:** Cần tích hợp API, mỗi NV cần 1 lần quét QR
- **Chi phí triển khai:** Trung bình (cần phí API VietQR ~500đ/giao dịch)
- **Thời gian:** 5-7 ngày phát triển

### Phương án 3: Banking API tự động
- **Mô tả:** Tích hợp API ngân hàng (VCB DigiBiz API, Techcombank API...) để chuyển tiền tự động
- **Ưu điểm:** Hoàn toàn tự động, 1 click thanh toán cả phòng ban
- **Nhược:** Cần đăng ký API doanh nghiệp (khó, mất thời gian), phí cao
- **Chi phí triển khai:** Cao
- **Thời gian:** 2-4 tuần

### Phương án 4: SePay API (Middleware ngân hàng)
- **Mô tả:** SePay là middleware kết nối 50+ ngân hàng VN, cung cấp 1 API duy nhất
- **Ưu điểm:** Không cần ký hợp đồng riêng với từng ngân hàng
- **Nhược:** Phí service, phụ thuộc bên thứ 3
- **Chi phí triển khai:** Trung bình
- **Thời gian:** 1 tuần phát triển

---

## 6. So sánh các phương án

| Tiêu chí | CSV Upload | VietQR | Banking API | SePay |
|-----------|-----------|--------|-------------|-------|
| Tự động hóa | 60% | 85% | 100% | 95% |
| Chi phí triển khai | Thấp | Trung bình | Cao | Trung bình |
| Phí giao dịch | 0đ | ~500đ/GD | Theo ngân hàng | Theo gói |
| Độ phức tạp | Thấp | Trung bình | Cao | Trung bình |
| Số ngân hàng hỗ trợ | Tất cả | Hầu hết | Từng bank | 50+ |
| Phù hợp | Doanh nghiệp nhỏ | Doanh nghiệp vừa | Doanh nghiệp lớn | Mọi quy mô |
| Thời gian triển khai | 2-3 ngày | 5-7 ngày | 2-4 tuần | 1 tuần |

---

## 7. Khuyến nghị

### Giai đoạn 1 (Ngay现在): Export CSV
- Triển khai nhanh, không cần tích hợp thêm
- Nhân viên văn phòng đều quen upload CSV lên ngân hàng
- Chi phí 0đ

### Giai đoạn 2 (3-6 tháng): VietQR
- Tự động hóa hơn, NV nhận tiền nhanh hơn
- Tích hợp gửi QR qua Zalo (Zalo OA API)
- Chi phí thấp (~500đ/giao dịch)

### Giai đoạn 3 (6-12 tháng): Banking API
- Khi doanh nghiệp đủ lớn và có nhu cầu tự động hóa hoàn toàn
- Đăng ký API với 1-2 ngân hàng chính
- Cần xem xét yêu cầu bảo mật & compliance

---

## 8. Quy trình nghiệp vụ chi tiết

### Bước 1: Nhân viên cập nhật STK
```
NV đăng nhập ERP → Cập nhật thông tin ngân hàng
├── Chọn ngân hàng (dropdown 50+ ngân hàng VN)
├── Nhập số tài khoản
├── Nhập tên chủ TK (viết hoa, không dấu)
└── Xác nhận
```

### Bước 2: HR chốt lương
```
HR vào tab "Tính lương" → Chọn tháng → Bấm "Chốt lương"
├── Hệ thống tự động tính: base + khoán + phụ cấp + thưởng - phạt
├── Tạo TaskPayRecord cho từng nhiệm vụ
└── Hiển thị tổng: "Tổng chi lương tháng 7/2026: 245,000,000₫"
```

### Bước 3: Export file lương
```
HR bấm "Xuất file CSV lương"
├── Hệ thống filter TaskPayRecord = "Chờ ghi nhận"
├── Join với employees để lấy STK ngân hàng
├── Generate CSV đúng format ngân hàng
└── Download file: luong_T7_2026_VCB.csv
```

### Bước 4: Upload ngân hàng
```
HR đăng nhập VCB DigiBiz → Chọn "Chuyển tiền theo lô"
├── Upload file luong_T7_2026_VCB.csv
├── Kiểm tra danh sách (hệ thống ngân hàng validate)
├── Submit → Director approve trên app VCB
└── Ngân hàng xử lý → NV nhận tiền
```

### Bước 5: Cập nhật kết quả
```
HR download file kết quả từ ngân hàng
├── Import kết quả vào ERP
├── Cập nhật payment_status:
│   ├── "Đã thanh toán" (thành công)
│   └── "Thất bại" (lỗi STK, số dư không đủ...)
└── Hiển thị báo cáo: "Đã thanh toán 45/48 nhân viên"
```

---

## 9. Database Schema mở rộng

```sql
-- Thêm trường ngân hàng vào employees
ALTER TABLE employees ADD COLUMN bank_name VARCHAR(10);
ALTER TABLE employees ADD COLUMN bank_account_no VARCHAR(20);
ALTER TABLE employees ADD COLUMN bank_account_holder VARCHAR(100);
ALTER TABLE employees ADD COLUMN bank_branch VARCHAR(100);

-- Bảng theo dõi lịch sử thanh toán
CREATE TABLE payment_batches (
    id VARCHAR PRIMARY KEY,
    payroll_month DATE NOT NULL,
    bank_code VARCHAR(10) NOT NULL,
    total_amount DECIMAL(15,2) NOT NULL,
    employee_count INTEGER NOT NULL,
    file_name VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending',  -- pending/processing/completed/failed
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Bảng chi tiết thanh toán
CREATE TABLE payment_batch_items (
    id VARCHAR PRIMARY KEY,
    batch_id VARCHAR REFERENCES payment_batches(id),
    task_pay_record_id VARCHAR REFERENCES task_pay_records(id),
    bank_code VARCHAR(10),
    bank_account_no VARCHAR(20),
    bank_account_holder VARCHAR(100),
    amount DECIMAL(15,2),
    status VARCHAR(20) DEFAULT 'pending',  -- pending/success/failed
    bank_response TEXT,
    paid_at TIMESTAMP
);
```

---

## 10. API Endpoints bổ sung

```
GET  /api/payroll/payment-banks          -- Danh sách ngân hàng hỗ trợ
POST /api/payroll/export-csv             -- Export file CSV lương
GET  /api/payroll/payment-batches        -- Danh sách batch thanh toán
POST /api/payroll/payment-batches/{id}/import-result  -- Import kết quả từ ngân hàng
GET  /api/payroll/payment-summary        -- Tổng quan thanh toán theo tháng
```

---

## 11. Zalo OA Integration (Giai đoạn 2)

```
Khi NV nhận tiền → Gửi thông báo qua Zalo OA:

"💰 [BachKhoa ERP] Thông báo lương tháng 7/2026

Kính gửi: Nguyễn Văn A
Phòng: Đo đạc

├─ Lương cơ bản:    7,000,000₫
├─ Khoán chính:     5,200,000₫ (4 nhiệm vụ)
├─ Khoán phụ đo:    1,200,000₫ (3 nhiệm vụ)
├─ Phụ cấp:           400,000₫
├─ Thưởng:            300,000₫
├─ Phạt:               0₫
─────────────────────────────
TỔNG THỰC NHẬN:   14,100,000₫

Đã chuyển vào tài khoản VCB ****6789
Trân trọng!"
```

---

## 12. Bảo mật & Compliance

- **PCI DSS:** Không lưu CVV/CVV2, chỉ lưu 4 số cuối STK
- **Mã hóa:** AES-256 cho bank_account_no
- **Audit log:** Ghi lại ai export file, lúc nào, file nào
- **Phân quyền:** Chỉ HR export, Director approve
- **Xóa data:** Auto-xóa file CSV sau 7 ngày

---

## 13. Timeline triển khai

| Giai đoạn | Thời gian | Nội dung |
|-----------|----------|----------|
| Giai đoạn 1 | 2-3 ngày | Form cập nhật STK + Export CSV |
| Giai đoạn 2 | 1 tuần | Payment batch tracking + Import kết quả |
| Giai đoạn 3 | 2 tuần | Zalo OA notification |
| Giai đoạn 4 | 1-2 tháng | VietQR API integration |
| Giai đoạn 5 | 2-3 tháng | Banking API (nếu cần) |

---

## 14. Ngân hàng phổ biến tại Việt Nam

| Ngân hàng | Mã | Corporate Banking | API |
|-----------|----|-------------------|-----|
| Vietcombank | VCB | DigiBiz | Có (doanh nghiệp) |
| VietinBank | CTG | eFAST | Có (doanh nghiệp) |
| BIDV | BIDV | SmartBanking Pro | Có |
| Techcombank | TCB | Techcombank Business | Có |
| MB Bank | MB | MBBank Corporate | Có |
| ACB | ACB | ACB iBank | Có |
| VPBank | VPB | VPBank NEO Corporate | Có |
| Sacombank | STB | Sacombank Pay | Có |

---

*Cập nhật: 2026-07-14*
*Phiên bản: 1.0*
