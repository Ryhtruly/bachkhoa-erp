# HƯỚNG DẪN KẾT NỐI TIẾP NHẬN YÊU CẦU DỊCH VỤ (LEAD INTAKE)
### BÁCH KHOA ERP • HỆ THỐNG CRM & TIẾP NHẬN TỰ ĐỘNG

Tài liệu này hướng dẫn chi tiết cách khai thác hệ thống tiếp nhận khách hàng tự động từ **Web Form Zalo (tích hợp sẵn)** và **Google Forms**.

---

## 🚀 CÁCH 1: DÙNG WEB FORM TRỰC TIẾP (KHUYÊN DÙNG — CÓ SẴN 100%)

Trang web form tiếp nhận đã được tích hợp sẵn vào mã nguồn ERP, tối ưu đặc biệt cho điện thoại di động (Mobile-First) để gửi qua Zalo.

### 1. Đường dẫn truy cập:
* Khi chạy local: **`http://localhost:3000/intake`** (hoặc `http://localhost:3000/yeu-cau-dich-vu`)
* Khi đưa lên domain: **`https://nhadatbachkhoa.com/intake`**

### 2. Ưu điểm & Tính năng thông minh:
* **Không cần đăng nhập**, giao diện chuẩn nhận diện Bách Khoa (cam - đen sang trọng).
* **Tự động đổi trường theo loại dịch vụ:**
  - Khách chọn *Đo hiện trạng* $\rightarrow$ Ô nhập hiển thị: *Diện tích đất ước tính (m²)*.
  - Khách chọn *Cắm mốc ranh* $\rightarrow$ Ô nhập tự đổi thành: *Số lượng mốc cần cắm*.
  - Khách chọn *Pháp lý / Cấp đổi / Sang tên* $\rightarrow$ Không bắt nhập diện tích đất, đổi thành: *Số thửa / Quy mô hồ sơ*.
  - Khách chọn *Xin phép xây dựng* $\rightarrow$ Ô nhập tự đổi thành: *Quy mô công trình (diện tích sàn, số tầng)*.
* **Tự động đổ về Database & CRM:** Ngay khi khách bấm Gửi:
  - Database tạo `Customer`, `CustomerIntakeSubmission` và `LeadPipeline`.
  - Màn hình CRM Kanban của nhân viên lập tức hiện thẻ Lead ở cột **`TIẾP CẬN`**.
  - Khách nhận được mã biên nhận `LEAD-XXXXXXXX` và nút bấm kết nối trực tiếp đến Zalo của kỹ sư Bách Khoa.

### 3. Nút Copy Link trên màn hình CRM:
* Trên thanh công cụ trang **CRM**, nhân viên kinh doanh chỉ cần bấm nút:
  👉 **`[Copy Link Form Zalo]`** là link tự động được lưu vào bộ nhớ tạm để dán vào tin nhắn Zalo gửi ngay cho khách hàng.

---

## 📑 CÁCH 2: KẾT NỐI VỚI GOOGLE FORMS (DÙNG CHO NHÂN VIÊN HIỆN TRƯỜNG)

Nếu bạn muốn dùng thêm Google Form để nhân viên tự nhập trên Google Sheets:

### Bước 1: Tạo Google Form với các câu hỏi:
1. **Họ và tên khách hàng** (Câu trả lời ngắn - Bắt buộc)
2. **Số điện thoại Zalo** (Câu trả lời ngắn - Bắt buộc)
3. **Địa chỉ thửa đất / Vị trí BĐS** (Đoạn - Bắt buộc)
4. **Loại dịch vụ** (Trắc nghiệm): *Đo hiện trạng vị trí / Cắm mốc ranh giới / Cấp đổi sổ / Chuyển nhượng / Xin phép xây dựng...*
5. **Quy mô / Diện tích (nếu có)** (Câu trả lời ngắn)
6. **Ghi chú thêm** (Đoạn)

### Bước 2: Dán mã Google Apps Script tự động chuyển dữ liệu về ERP:
1. Trong Google Form, chọn tab **Câu trả lời** $\rightarrow$ bấm biểu tượng **Google Sheet (Xem trong Trang tính)**.
2. Tại Google Sheet, chọn menu **Tiện ích mở rộng (Extensions)** $\rightarrow$ **Apps Script**.
3. Xóa code cũ và dán toàn bộ đoạn mã bên dưới vào:

```javascript
/**
 * Google Apps Script - Tự động đẩy dữ liệu từ Google Form về Bách Khoa ERP
 */
function onFormSubmit(e) {
  // THAY ĐỔI ĐƯỜNG DẪN NÀY THÀNH DOMAIN ERP CỦA BẠN (HOẶC NGROK KHI TEST)
  var ERP_WEBHOOK_URL = "http://YOUR-ERP-DOMAIN:8080/api/intake/lead";

  try {
    var itemResponses = e.response.getItemResponses();
    var payload = {
      customer_name: "",
      phone: "",
      target_property_address: "",
      service_type: "Tư vấn chung",
      scale_info: "",
      notes: "",
      source: "Google Form",
      google_form_id: e.source.getId(),
      google_response_id: e.response.getId()
    };

    // Duyệt qua từng câu hỏi trong Form
    for (var i = 0; i < itemResponses.length; i++) {
      var itemResponse = itemResponses[i];
      var question = itemResponse.getItem().getTitle().toLowerCase();
      var answer = itemResponse.getResponse();

      if (question.indexOf("tên") !== -1 || question.indexOf("họ") !== -1) {
        payload.customer_name = answer;
      } else if (question.indexOf("thoại") !== -1 || question.indexOf("phone") !== -1 || question.indexOf("sđt") !== -1) {
        payload.phone = String(answer);
      } else if (question.indexOf("địa chỉ") !== -1 || question.indexOf("thửa") !== -1 || question.indexOf("đất") !== -1) {
        payload.target_property_address = answer;
      } else if (question.indexOf("dịch vụ") !== -1 || question.indexOf("nhu cầu") !== -1) {
        payload.service_type = answer;
      } else if (question.indexOf("quy mô") !== -1 || question.indexOf("diện tích") !== -1 || question.indexOf("mốc") !== -1) {
        payload.scale_info = answer;
      } else if (question.indexOf("ghi chú") !== -1 || question.indexOf("yêu cầu") !== -1) {
        payload.notes = answer;
      }
    }

    if (!payload.customer_name || !payload.phone) {
      Logger.log("Thiếu Tên hoặc SĐT, bỏ qua.");
      return;
    }

    // Gửi dữ liệu về Bách Khoa ERP
    var options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(ERP_WEBHOOK_URL, options);
    Logger.log("ERP Response: " + response.getContentText());
  } catch (err) {
    Logger.log("Lỗi gửi dữ liệu về ERP: " + err.toString());
  }
}
```

4. Bấm biểu tượng **Kích hoạt (Triggers - hình đồng hồ bên trái)**:
   - Bấm **Thêm trình kích hoạt (Add Trigger)**.
   - Chọn hàm chạy: `onFormSubmit`.
   - Chọn loại nguồn sự kiện: `Từ trang tính (From spreadsheet)`.
   - Chọn loại sự kiện: `Khi gửi biểu mẫu (On form submit)`.
   - Bấm **Lưu (Save)** và cấp quyền truy cập.

---

## 🎯 KIỂM TRA & NGHIỆM THU

1. **Khách điền Form:**
   Khách truy cập `/intake` trên điện thoại $\rightarrow$ Chọn Gói Đo Vẽ $\rightarrow$ Chọn "Đo hiện trạng" $\rightarrow$ Nhập diện tích $150m^2$, Họ tên, SĐT, Vị trí đất $\rightarrow$ Bấm **[Gửi Yêu Cầu]**.
2. **Khách nhìn thấy:**
   Màn hình xác nhận màu xanh lục tuyệt đẹp kèm mã tiếp nhận `LEAD-XXXXXXXX` và link liên hệ Zalo kỹ sư.
3. **Nhân viên nhìn thấy:**
   Mở màn hình **CRM** của ERP $\rightarrow$ Thẻ khách hàng lập tức xuất hiện ngay ở cột **`TIẾP CẬN`** với đầy đủ thông tin dịch vụ, quy mô và số điện thoại!
