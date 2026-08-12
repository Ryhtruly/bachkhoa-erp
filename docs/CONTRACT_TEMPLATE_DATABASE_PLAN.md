# Ke hoach database cho hop dong mau DOCX

File mau: `01_Hop_dong_dich_vu_khung_Bach_Khoa_2026.docx`

Muc tieu: chuan hoa truong du lieu truoc. Du lieu se di theo luong:

`Zalo OA -> Google Form -> Google Sheet -> customer_intake_submissions -> customers/contracts/service_lines -> render hop dong DOCX`

Hop dong mau DOCX la dau ra sau cung. Neu bang dau vao chua chuan, viec render hop dong se bi sai hoac phai sua tay rat nhieu.

## 1. Nguyen tac thiet ke

Hop dong mau khong chi can bang `contracts`. Du lieu duoc chia theo dung nghia:

| Lop du lieu | Bang | Ly do |
|---|---|---|
| Du lieu khach tu dien | `customer_intake_submissions` | Luu raw payload tu Google Form/Sheet de doi chieu va xu ly loi |
| Ben A / khach hang da chuan hoa | `customers` | Thong tin dinh danh nguoi ky hoac doanh nghiep |
| Hop dong | `contracts` | Ma/so hop dong trong `id`, ngay ky, ngay hieu luc, noi ky, dieu khoan chung |
| Hang muc / tai san | `service_lines` | Thua dat, chu su dung, dia chi tai san, GCN theo tung hang muc |
| Mau hop dong | `contract_templates` | Luu file mau DOCX, version, danh sach placeholder |
| Phu luc | `contract_appendices` | Mot hop dong co the co nhieu phu luc |
| File da sinh | `contract_generated_documents` | Luu output va snapshot render de lich su khong bi doi nguoc |

Khong lay Google Sheet ghi thang vao `customers`. Sheet la du lieu tu khach tu nhap, nen phai qua buoc normalize/verify truoc.

## 2. Mapping placeholder DOCX

| Placeholder | Bang.cot | Ghi chu |
|---|---|---|
| `{{TEN_BEN_A}}` | `customers.full_name` | Ho ten ca nhan / ten cong ty |
| `{{CCCD_HOAC_MST_BEN_A}}` | `customers.id_card_number` hoac `customers.tax_id` | Ca nhan lay CCCD, doanh nghiep lay MST |
| `{{NGAY_CAP}}` | `customers.id_card_date` | Ngay cap CCCD |
| `{{NOI_CAP}}` | `customers.id_card_place` | Noi cap CCCD |
| `{{DIA_CHI_BEN_A}}` | `customers.address` | Dia chi lien lac / thuong tru |
| `{{DIEN_THOAI_BEN_A}}` | `customers.phone` | So dien thoai chinh |
| `{{EMAIL_ZALO_BEN_A}}` | `customers.email`, `customers.zalo_phone` | Render thanh email/zalo theo du lieu co |
| `{{DAI_DIEN_BEN_A}}` | `customers.representative_name` | Dung cho khach doanh nghiep |
| `{{CHUC_VU_BEN_A}}` | `customers.representative_role` | Chuc vu nguoi dai dien |
| `{{SO_HOP_DONG}}` | `contracts.id` | Ma/so hop dong dung truc tiep tu khoa chinh hop dong |
| `{{NAM}}`, `{{NGAY}}`, `{{THANG}}` | tu `contracts.date_signed` | Render tach ngay/thang/nam khi xuat file |
| `{{DIA_DIEM_KY}}` | `contracts.signing_place` | Dia diem ky |
| `{{NGAY_HIEU_LUC}}` | `contracts.effective_date` | Ngay hieu luc hop dong |
| `{{TONG_GIA_TRI_HOP_DONG}}` | `contracts.total_value` | Gia tri hop dong |
| `{{DA_BAO_GOM_HAY_CHUA_BAO_GOM_VAT}}` | `contracts.vat_policy`, `contracts.vat_note` | included / not_included / exempt / custom |
| `{{MA_TEN_PHU_LUC_KEM_THEO}}` | `contract_appendices` | Render danh sach ma + ten phu luc |
| `{{SO_BAN}}` | `contracts.copies_total` | Tong so ban hop dong |
| `{{SO_BAN_BEN_A}}` | `contracts.copies_party_a` | So ban Ben A giu |
| `{{SO_BAN_BEN_B}}` | `contracts.copies_party_b` | So ban Ben B giu |
| `{{SO_TRANG}}` | `contracts.page_count` | So trang hop dong |
| `{{SO_NGAY_CHAM_THANH_TOAN}}` | `contracts.late_payment_days` | Dieu khoan cham thanh toan |
| `{{THOI_HAN_HOAN_TIEN}}` | `contracts.refund_period_days` | Thoi han hoan tien |
| `{{THOI_HAN_KHAC_PHUC}}` | `contracts.remedy_period_days` | Thoi han khac phuc |
| `{{THOI_HAN_NGHIEM_THU}}` | `contracts.acceptance_period_days` | Thoi han nghiem thu |
| `{{THOI_HAN_PHAN_HOI}}` | `contracts.response_period_days` | Thoi han phan hoi |
| `{{CHU_SU_DUNG_CHU_SO_HUU}}` | `service_lines.land_owner_name` | Theo hang muc/tai san, khong nen gan cung vao khach hang |

## 3. Cac thay doi database

### `customers`

| Cot moi | Kieu | Muc dich |
|---|---|---|
| `customer_type` | text | `individual` hoac `business` |
| `preferred_contact_channel` | text | Kenh uu tien: phone/email/zalo |
| `id_card_number` | varchar | CCCD/CMND ca nhan |
| `id_card_date` | date | Ngay cap CCCD |
| `id_card_place` | varchar | Noi cap CCCD |
| `email` | varchar | Email giao dich |
| `zalo_phone` | varchar | So Zalo giao dich |
| `representative_name` | varchar | Dai dien doanh nghiep |
| `representative_role` | varchar | Chuc vu dai dien |
| `source_channel` | text | Nguon tao khach: zalo_oa/google_form/google_sheet/manual |
| `source_reference` | jsonb | Luu id form/sheet/row da tao khach |
| `data_quality_status` | text | `unverified`, `needs_review`, `verified`, `rejected` |
| `identity_verified_at` | timestamptz | Thoi diem da kiem tra CCCD/MST |
| `identity_verified_by` | varchar FK | Nguoi xac minh thong tin |

### `customer_intake_submissions`

Bang nay la cua ngo nhan du lieu tu Zalo OA/Google Form/Google Sheet. No giu du lieu goc va du lieu da normalize, de neu render hop dong sai con truy nguoc duoc khach da dien gi.

| Cot | Kieu | Muc dich |
|---|---|---|
| `id` | varchar PK | ID submission |
| `source_channel` | text | `zalo_oa`, `google_form`, `google_sheet`, `manual`, `import` |
| `google_form_id` | text | ID Google Form neu co |
| `google_response_id` | text | ID cau tra loi tren Google Form neu lay duoc |
| `sheet_id` | text | ID Google Sheet |
| `worksheet_name` | text | Ten tab sheet |
| `sheet_row_number` | integer | Dong tren sheet |
| `submitted_at` | timestamptz | Luc khach gui form |
| `raw_payload` | jsonb | Du lieu nguyen ban theo cot sheet |
| `normalized_payload` | jsonb | Du lieu da map ve field chuan |
| `validation_errors` | jsonb | Loi thieu/sai field, vi du thieu CCCD |
| `status` | text | `new`, `normalized`, `needs_review`, `converted`, `duplicate`, `rejected` |
| `linked_customer_id` | varchar FK | Khach hang da tao/cap nhat |
| `linked_lead_id` | varchar FK | Lead tao tu submission |
| `linked_contract_id` | varchar FK | Hop dong tao tu submission |
| `linked_service_line_id` | varchar FK | Hang muc tao tu submission |
| `processed_by` | varchar FK | Nguoi xu ly/duyet du lieu |
| `processed_at` | timestamptz | Thoi diem xu ly |

### `contracts`

| Cot moi | Kieu | Muc dich |
|---|---|---|
| `effective_date` | date | Ngay hieu luc |
| `signing_place` | text | Dia diem ky |
| `vat_policy` | text | `included`, `not_included`, `exempt`, `custom` |
| `vat_rate` | numeric | Ty le VAT neu can |
| `vat_note` | text | Dien giai VAT tuy bien |
| `appendix_summary` | text | Tom tat phu luc neu can hien nhanh |
| `copies_total` | integer | Tong so ban |
| `copies_party_a` | integer | So ban Ben A giu |
| `copies_party_b` | integer | So ban Ben B giu |
| `page_count` | integer | So trang |
| `late_payment_days` | integer | So ngay cham thanh toan |
| `refund_period_days` | integer | Thoi han hoan tien |
| `remedy_period_days` | integer | Thoi han khac phuc |
| `acceptance_period_days` | integer | Thoi han nghiem thu |
| `response_period_days` | integer | Thoi han phan hoi |

### `service_lines`

| Cot moi | Kieu | Muc dich |
|---|---|---|
| `land_owner_name` | varchar | Chu su dung/chu so huu tren GCN |
| `property_certificate_number` | varchar | So GCN/thong tin giay chung nhan |
| `property_address` | text | Dia chi tai san |
| `property_metadata` | jsonb | Du lieu tai san linh hoat ve sau |

### Bang moi

| Bang | Muc dich |
|---|---|
| `customer_intake_submissions` | Luu tung dong/form response tu Google Form/Sheet truoc khi tao khach/hop dong |
| `contract_templates` | Luu mau DOCX, version, placeholder schema, render rules |
| `contract_appendices` | Luu danh sach phu luc theo hop dong |
| `contract_generated_documents` | Luu file hop dong da sinh va snapshot du lieu |

## 4. Mo phong data

### Khach hang ca nhan

Raw data tu Google Sheet vao truoc:

| Truong | Gia tri |
|---|---|
| `customer_intake_submissions.source_channel` | `google_sheet` |
| `customer_intake_submissions.sheet_id` | `1abc...sheet` |
| `customer_intake_submissions.worksheet_name` | `Form Responses 1` |
| `customer_intake_submissions.sheet_row_number` | `25` |
| `customer_intake_submissions.status` | `needs_review` |
| `customer_intake_submissions.raw_payload` | `{"Ho ten":"Nguyen Van A","SDT":"0901234567","CCCD":"079099001234"}` |
| `customer_intake_submissions.normalized_payload` | `{"full_name":"Nguyen Van A","phone":"0901234567","id_card_number":"079099001234"}` |

| Truong | Gia tri |
|---|---|
| `customers.customer_type` | `individual` |
| `customers.source_channel` | `google_sheet` |
| `customers.data_quality_status` | `verified` |
| `customers.full_name` | `Nguyen Van A` |
| `customers.id_card_number` | `079099001234` |
| `customers.id_card_date` | `2020-05-10` |
| `customers.id_card_place` | `Cuc Canh sat QLHC ve TTXH` |
| `customers.phone` | `0901234567` |
| `customers.email` | `nguyenvana@example.com` |
| `customers.zalo_phone` | `0901234567` |

### Hop dong

| Truong | Gia tri |
|---|---|
| `contracts.id` | `HDDV-002` |
| `contracts.customer_id` | `CUS_A` |
| `contracts.date_signed` | `2026-08-07` |
| `contracts.effective_date` | `2026-08-07` |
| `contracts.signing_place` | `TP. Ho Chi Minh` |
| `contracts.total_value` | `5000000` |
| `contracts.vat_policy` | `not_included` |
| `contracts.copies_total` | `2` |
| `contracts.copies_party_a` | `1` |
| `contracts.copies_party_b` | `1` |

### Hang muc

| Truong | Gia tri |
|---|---|
| `service_lines.contract_id` | `HDDV-002` |
| `service_lines.service_package` | `Goi do ve` |
| `service_lines.service_type` | `Cap doi - phan do ve` |
| `service_lines.land_owner_name` | `Ho Thi My Hang` |
| `service_lines.property_address` | `Quan 1, TP.HCM` |
| `service_lines.price` | `5000000` |

### File da sinh

`contract_generated_documents.render_data_snapshot` se luu ban chup:

```json
{
  "TEN_BEN_A": "Nguyen Van A",
  "CCCD_HOAC_MST_BEN_A": "079099001234",
  "NGAY_CAP": "10/05/2020",
  "NOI_CAP": "Cuc Canh sat QLHC ve TTXH",
  "DIA_CHI_BEN_A": "Quan 1, TP.HCM",
  "DIEN_THOAI_BEN_A": "0901234567",
  "EMAIL_ZALO_BEN_A": "nguyenvana@example.com / Zalo: 0901234567",
  "SO_HOP_DONG": "HDDV-002",
  "NGAY": "07",
  "THANG": "08",
  "NAM": "2026",
  "DIA_DIEM_KY": "TP. Ho Chi Minh",
  "TONG_GIA_TRI_HOP_DONG": "5.000.000 dong"
}
```

Ly do can snapshot: hop dong da ky phai giu nguyen noi dung cu, ke ca sau nay khach doi dia chi, doi CCCD, hoac cap nhat so dien thoai.
