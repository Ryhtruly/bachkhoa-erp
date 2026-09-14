# Phân tách nghiệp vụ Thu và Chi theo vai trò

## Mục tiêu

Phân hệ Kế toán phải phản ánh đúng phân công mới:

- Giám đốc quản lý toàn bộ nghiệp vụ thu, gồm thu tiền, thu công nợ hợp đồng và thu hoàn ứng.
- Kế toán quản lý nghiệp vụ chi, gồm phiếu chi, tạm ứng, chi bù hoàn ứng và đối soát chi.
- Mọi phiếu chi do Kế toán lập phải ở trạng thái chờ Giám đốc duyệt.
- Giám đốc vẫn xem được toàn bộ thu và chi.
- Kế toán được xem số dư hiện tại của quỹ để quyết định khả năng chi, nhưng không được xem dữ liệu thu hoặc các số liệu có thể hiện doanh thu/lợi nhuận.

## Ma trận quyền nghiệp vụ

| Nghiệp vụ | Giám đốc | Kế toán |
|---|---|---|
| Xem phiếu thu | Có | Không |
| Tạo/sửa phiếu thu | Có | Không |
| Duyệt phiếu thu | Có | Không |
| Xem phiếu chi | Có | Có |
| Tạo/sửa phiếu chi | Có | Có, tạo ở trạng thái chờ duyệt |
| Duyệt/từ chối phiếu chi | Có | Không |
| Xem số dư quỹ hiện tại | Có | Có |
| Xem công nợ phải thu/doanh thu/lợi nhuận | Có | Không |
| Xem và lập phiếu hoàn tiền khách hàng | Có | Không |
| Lập phiếu tạm ứng chính thức sau khi yêu cầu được duyệt | Có | Có |
| Đối soát hoàn ứng | Có | Có |
| Hoàn ứng thừa cho công ty | Xác nhận phiếu thu | Chỉ lập yêu cầu thu, không tự hoàn tất |
| Chi bù tạm ứng thiếu | Duyệt phiếu chi | Lập phiếu chi chờ duyệt |

## Quy tắc dữ liệu trả về

- Các endpoint danh sách/detai dòng tiền phải lọc phía backend theo actor, không tin vào filter do frontend gửi.
- Với Kế toán, các danh sách dòng tiền chỉ được trả về `EXPENSE`, `ADVANCE` và `REIMBURSEMENT` khi chúng biểu diễn khoản chi; không trả về `INCOME`.
- Số dư quỹ vẫn được tính từ toàn bộ giao dịch đã duyệt, nhưng response cho Kế toán chỉ trả số dư và tổng chi; không trả `total_income` hoặc chi tiết thu.
- Báo cáo tháng/tổng hợp cho Kế toán chỉ trả số liệu chi và số dư cần thiết; không trả doanh thu, lợi nhuận, `income_by_contract` hoặc các trường tương đương.
- Endpoint công nợ phải thu, thu công nợ và hoàn tiền khách hàng chỉ dành cho Giám đốc.
- Endpoint danh sách hợp đồng dùng cho việc gắn khoản chi phải loại bỏ số tiền hợp đồng, đã thu và còn phải thu khi actor là Kế toán.

## Luồng hoàn ứng

- Chênh lệch bằng 0: chỉ đánh dấu đã quyết toán, không sinh phiếu mới.
- Chênh lệch dương: sinh phiếu `INCOME` ở trạng thái chờ duyệt; chỉ Giám đốc được duyệt.
- Chênh lệch âm: sinh phiếu `EXPENSE` ở trạng thái chờ duyệt; Kế toán lập, Giám đốc duyệt.

## Phạm vi không thay đổi

- Nhân viên vẫn gửi yêu cầu tạm ứng qua Employee Portal.
- Giám đốc vẫn duyệt hoặc từ chối yêu cầu tạm ứng.
- Kế toán chỉ lập phiếu tạm ứng chính thức từ yêu cầu đã được Giám đốc duyệt.
- Không thay đổi quyền lương, KPI, CRM, workflow hoặc legal.
- Giám đốc tiếp tục là role `admin`; Kế toán tiếp tục là role `accountant`.
