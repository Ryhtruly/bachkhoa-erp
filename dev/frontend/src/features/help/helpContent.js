// Nội dung Hướng dẫn sử dụng. Viết theo đúng nhãn nút / tab đang hiện trên giao diện;
// đổi chữ trên giao diện thì sửa luôn ở đây.
//
// Mỗi mục:
//   id           — định danh, dùng làm neo
//   group        — nhóm trong mục lục
//   title        — tiêu đề
//   tabs         — tab của ứng dụng mà mục này mô tả (mở "?" ở tab đó sẽ nhảy thẳng tới mục)
//   audience     — 'all' | 'employee' | 'management'  (không gian làm việc được thấy)
//   permission   — quyền đọc cần có (khớp permissions của người dùng)
//   directorOnly — chỉ Giám đốc / admin
//   blocks       — nội dung: { p } đoạn văn · { steps: [] } các bước · { list: [] } gạch đầu dòng
//                  · { tip } mẹo · { warn } lưu ý · { table: { head: [], rows: [[]] } }
//   Trong chuỗi, **đậm** được in đậm.

export const HELP_GROUPS = [
  'Bắt đầu',
  'Dành cho nhân viên',
  'Kinh doanh & khách hàng',
  'Hợp đồng & hồ sơ',
  'Điều hành (Giám đốc)',
  'Tài chính',
  'Nhân sự & tri thức',
  'Hệ thống',
]

export const HELP_SECTIONS = [
  // ───────────────────────────── Bắt đầu ─────────────────────────────
  {
    id: 'bat-dau',
    group: 'Bắt đầu',
    title: 'Làm quen với giao diện',
    audience: 'all',
    blocks: [
      { p: 'Bách Khoa ERP quản lý trọn vòng đời một dịch vụ: từ lúc khách để lại thông tin, chốt hợp đồng, nhân viên đo vẽ – làm pháp lý, đến lúc bàn giao, thu tiền và tính lương khoán.' },
      { p: 'Màn hình gồm 3 vùng:' },
      {
        list: [
          '**Thanh điều hướng bên trái** — các phân hệ bạn được dùng. Bấm biểu tượng ở đầu thanh để thu gọn / mở rộng. Trên điện thoại, bấm nút ☰ ở góc trên bên trái để mở.',
          '**Thanh trên cùng** — nút **Làm mới**, nút 🌙/☀️ đổi giao diện sáng – tối, nút **?** mở hướng dẫn này, **chuông** thông báo việc cần xử lý và **menu tài khoản** (ảnh đại diện).',
          '**Vùng làm việc** ở giữa — nội dung của phân hệ đang chọn.',
        ],
      },
      { tip: 'Menu chỉ hiện các phân hệ bạn có quyền. Nếu thiếu một mục cần dùng, hãy nhờ Giám đốc cấp quyền trong **Nhân Sự & Đào Tạo**.' },
      { p: 'Có hai không gian làm việc:' },
      {
        table: {
          head: ['Không gian', 'Dành cho', 'Các mục chính'],
          rows: [
            ['Quản lý', 'Giám đốc, kế toán, sale, trưởng phòng', 'Tổng Quan, CRM, Khách Hàng, Hợp Đồng, Hồ sơ, Thu Chi, KPI, Nhân sự, Cấu Hình'],
            ['Nhân viên', 'Thợ đo, vẽ CAD, chuyên viên pháp lý', 'Lịch trình (Bể việc), Hồ sơ của phòng mình, Đào Tạo & ISO, Lương'],
          ],
        },
      },
    ],
  },
  {
    id: 'tai-khoan',
    group: 'Bắt đầu',
    title: 'Tài khoản, mật khẩu & đăng xuất',
    audience: 'all',
    blocks: [
      {
        steps: [
          'Lần đầu: mở email mời từ công ty, bấm đường dẫn để **đặt mật khẩu** rồi đăng nhập bằng tên đăng nhập được cấp.',
          'Đổi mật khẩu: bấm **ảnh đại diện** ở góc phải → **Đổi mật khẩu**.',
          'Xem nhanh lương: ảnh đại diện → **Phiếu lương của tôi**.',
          'Kết thúc phiên: ảnh đại diện → **Đăng xuất**. Nên đăng xuất khi dùng máy chung.',
        ],
      },
      { warn: 'Không chia sẻ tài khoản. Mọi thao tác (duyệt, nộp, thu tiền…) đều được ghi lại theo người thực hiện.' },
    ],
  },
  {
    id: 'thong-bao-tro-ly',
    group: 'Bắt đầu',
    title: 'Thông báo & Trợ lý AI nội bộ',
    audience: 'all',
    blocks: [
      { p: '**Chuông thông báo** ở thanh trên hiện số việc đang chờ bạn xử lý (phiếu chờ duyệt, bước bị từ chối, việc mới…). Bấm vào một dòng để đi thẳng tới nơi cần xử lý.' },
      { p: '**Trợ lý Nội bộ** là nút chat ở góc dưới bên phải. Hỏi bằng tiếng Việt về quy trình, quy định, tài liệu ISO — trợ lý trả lời dựa trên tài liệu trong **Đào Tạo & ISO** và cơ sở tri thức công ty.' },
      {
        list: [
          'Hỏi ngắn, rõ một ý: “Quy trình cắm mốc gồm những bước nào?”.',
          'Câu hỏi ngoài tài liệu, trợ lý sẽ báo cần liên hệ nhân viên quản lý thay vì tự bịa.',
          'Bấm biểu tượng thùng rác trong khung chat để **xoá lịch sử trò chuyện**.',
        ],
      },
      { tip: 'Trợ lý chỉ “biết” những gì có trong tài liệu đã tải lên. Muốn trợ lý trả lời được thêm, hãy bổ sung tài liệu ở mục **Đào Tạo & ISO** (xem mục “Đào tạo & ISO (Wiki)”).' },
    ],
  },

  // ───────────────────────────── Nhân viên ─────────────────────────────
  {
    id: 'be-viec',
    group: 'Dành cho nhân viên',
    title: 'Lịch trình & Bể việc — nhận việc',
    audience: 'employee',
    tabs: ['employee-dashboard'],
    blocks: [
      { p: 'Mục **Lịch trình** là bàn làm việc hằng ngày: việc bạn đang giữ, lịch theo tuần, tiến độ và thành tích hôm nay, và **Bể việc** — nơi các bước công việc chờ người nhận.' },
      { p: '**Tải của bạn** cho biết bạn đang giữ bao nhiêu hạng mục trên mức tối đa (ví dụ 1 / 3). Khi đủ tải, phải hoàn thành một hạng mục mới nhận thêm được.' },
      {
        table: {
          head: ['Loại thẻ trong Bể việc', 'Ý nghĩa', 'Nút'],
          rows: [
            ['Hạng mục mới', 'Trọn chuỗi bước của một hạng mục, kèm tổng khoán dự kiến', '**Nhận trọn**'],
            ['Slot thợ phụ', 'Đi cùng thợ chính ra hiện trường, khoán cố định. Suất đóng ngay khi thợ chính bấm **Bắt đầu đo** — nhận sớm mới còn', '**Nhận làm phụ**'],
            ['Cần hỗ trợ', 'Đồng nghiệp nhờ làm thay một bước. Khoán là đề xuất, Giám đốc chốt khi duyệt', '**Nhận làm hộ**'],
          ],
        },
      },
      {
        steps: [
          'Mở **Lịch trình**, kéo xuống **Bể việc**; dùng các nhóm lọc để xem theo loại việc.',
          'Bấm **Chi tiết** để xem địa chỉ, các bước và mức khoán.',
          'Bấm nút nhận tương ứng. Việc chuyển lên **Hạng mục bạn đã nhận**.',
        ],
      },
      { p: '**Gặp sự cố không làm tiếp được** (ốm, hỏng máy…): mở bước đang làm → **Nhờ hỗ trợ**. Bước được đưa lên Bể việc dạng “Cần hỗ trợ”. Trong lúc chưa ai nhận, bạn vẫn chịu trách nhiệm bước đó; đổi ý thì bấm **Rút lời nhờ** để tự làm tiếp.' },
    ],
  },
  {
    id: 'lam-buoc',
    group: 'Dành cho nhân viên',
    title: 'Thực hiện bước & nộp nghiệm thu',
    audience: 'employee',
    tabs: ['employee-dashboard'],
    blocks: [
      { p: 'Mỗi hợp đồng chạy theo các **bước (node)** như K01 Tiếp nhận, K02 Đo hiện trường, K03 Chuẩn hoá kỹ thuật… Mỗi bước có **danh sách checklist** — những việc phải làm và minh chứng phải nộp.' },
      {
        steps: [
          'Mở hạng mục đã nhận → chọn bước hiện tại. Trạng thái bước hiện ở đầu thẻ: **Sẵn sàng làm**, **Đang làm**, **Chờ tới lượt**, **Cần sửa**.',
          'Bấm **Bắt đầu làm** (bước đo hiện trường: **Bắt đầu đo hiện trường**). Chỉ sau khi bắt đầu mới nộp được minh chứng; đồng hồ **Thời gian còn lại** bắt đầu chạy.',
          'Với từng mục checklist: tải tệp minh chứng (ảnh, PDF, bản vẽ…), ghi chú nếu cần.',
          'Nộp nghiệm thu. Nếu quá hạn, hệ thống bắt buộc nhập **Lý do nộp trễ**.',
          'Chờ Giám đốc duyệt. Mục đã duyệt chuyển **Đã duyệt**; bị trả về thì chuyển **Bị từ chối** kèm lý do — sửa và nộp lại.',
        ],
      },
      { tip: 'Hồ sơ gắn nhãn **ưu tiên** có **thưởng dự kiến** khi hoàn thành đúng hạn.' },
      { p: '**Tủ hồ sơ đính kèm** (nút **Mở tủ hồ sơ theo bước**) chứa giấy tờ của hạng mục, kể cả **Tài liệu kế thừa** từ các bước trước — không cần xin lại đồng nghiệp.' },
      { p: '**Phát sinh loại giấy tờ mới** chưa có trong checklist (ví dụ ảnh mốc ranh phát sinh): dùng **Đề xuất loại tài liệu phát sinh** — điền tên, lý do, số lượng, nguồn, đính kèm tệp rồi **Gửi duyệt**. Trong lúc chờ Giám đốc duyệt thì không sửa được đề xuất.' },
      { warn: 'Khi đang gửi hồ sơ nghiệm thu, không đóng hay thoát trang cho tới khi hệ thống báo xong.' },
    ],
  },
  {
    id: 'luong-cua-toi',
    group: 'Dành cho nhân viên',
    title: 'Lương của tôi',
    audience: 'all',
    tabs: ['payroll'],
    blocks: [
      { p: 'Mục **Lương** (hoặc ảnh đại diện → **Phiếu lương của tôi**) cho xem tổng lương kỳ đang chọn và chi tiết cấu thành:' },
      {
        list: [
          '**Lương cơ bản** — theo hợp đồng lao động.',
          '**Lương khoán** — tự cộng từ các checklist đã được nghiệm thu, không nhập tay.',
          '**Thưởng / khấu trừ** và **Hoa hồng** chốt hợp đồng (nếu có).',
        ],
      },
      { p: 'Trạng thái kỳ: **Tạm tính** / **Đang mở** (còn thay đổi) → **Đã chốt sổ** → **Đã xác nhận chi trả**. Bấm **In phiếu lương** để in hoặc lưu PDF. **Lịch sử các kỳ lương** nằm bên dưới.' },
      { tip: 'Cần đối soát số liệu? Liên hệ Giám đốc hoặc bộ phận Kế toán.' },
    ],
  },

  // ───────────────────────── Kinh doanh & khách hàng ─────────────────────────
  {
    id: 'crm',
    group: 'Kinh doanh & khách hàng',
    title: 'CRM Bán Hàng — từ lead đến hợp đồng',
    audience: 'all',
    permission: 'crm',
    tabs: ['crm'],
    blocks: [
      { p: 'CRM hiển thị khách tiềm năng (lead) theo cột trạng thái, ví dụ **Đang Tư Vấn / Báo Giá** → **Chốt Thành Hợp Đồng**. Kéo thả thẻ sang cột khác để chuyển trạng thái.' },
      {
        steps: [
          'Bấm **Tạo Lead Mới**: nhập **Tên khách**, **Số điện thoại Zalo**, **Nguồn khách hàng** (Zalo cá nhân, Hotline, Khách giới thiệu…) và nhu cầu / vị trí / quy mô → **Tạo Mới & Đưa vào Pipeline**.',
          'Lead chưa có người phụ trách: bấm **Nhận lead này** để đưa vào danh sách của bạn.',
          'Tư vấn xong, kéo thẻ sang cột chốt → hộp **Xác nhận Chốt Deal & Tạo Hợp Đồng** hiện ra: nhập **giá trị hợp đồng gốc**, quy mô / diện tích / số mốc, MST hoặc CCCD (tuỳ chọn) → **Chốt Deal & Sinh Hợp Đồng Tự Động**.',
        ],
      },
      { tip: 'Khách thân thiết được **tự động áp dụng chiết khấu**; hộp chốt deal hiện cả số tiền gốc và giá trị thực tế sau giảm. Quy mô bạn nhập được điền sẵn vào mục “Diện tích/Quy mô” trên hợp đồng Word.' },
      { p: '**Để khách tự đăng ký**: bấm **Mã QR Form** để tải ảnh QR (chọn sẵn gói / hạng mục nếu muốn) gửi khách quét bằng Zalo hoặc camera; hoặc dùng nút sao chép link trang đăng ký gửi qua Zalo. Phiếu khách gửi tự vào CRM thành lead mới.' },
      { p: 'Bộ lọc **Nguồn khách hàng** và **Sale phụ trách** ở đầu trang giúp xem theo kênh / theo người.' },
      { p: '**Thiết lập CRM** (Giám đốc): tỷ lệ **hoa hồng Sale** chung (chỉ áp dụng cho hợp đồng chốt sau khi lưu) và **giới hạn tải Sale** — số lead mở tối đa, điểm tải, ngưỡng cảnh báo.' },
    ],
  },
  {
    id: 'khach-hang',
    group: 'Kinh doanh & khách hàng',
    title: 'Khách Hàng',
    audience: 'management',
    permission: 'customer',
    tabs: ['customers'],
    blocks: [
      { p: 'Danh bạ khách hàng cá nhân và doanh nghiệp, kèm toàn bộ lịch sử hợp đồng.' },
      {
        list: [
          'Ô tìm kiếm nhận **tên, SĐT, CCCD, MST** (gõ không dấu cũng được).',
          'Bấm một khách để xem thông tin định danh, liên hệ, danh sách hợp đồng với **Doanh số** và **Còn nợ**.',
          'Bấm **Sửa** để cập nhật thông tin. Khách cũ được tự điền khi soạn hợp đồng mới.',
          'Nhãn **Ưu đãi** cho biết khách thân thiết; Giám đốc chỉnh ở **Thiết lập ưu đãi khách hàng thân thiết**.',
        ],
      },
    ],
  },
  {
    id: 'form-khach',
    group: 'Kinh doanh & khách hàng',
    title: 'Trang đăng ký dịch vụ cho khách',
    audience: 'management',
    permission: 'crm',
    tabs: ['crm'],
    blocks: [
      { p: 'Trang công khai (đường dẫn /yeu-cau-dich-vu) để khách tự điền: chọn nhóm dịch vụ và hạng mục, nhập địa chỉ thửa đất, quy mô (diện tích, số mốc, số thửa tách…), họ tên và số Zalo, rồi **Gửi Yêu Cầu Khảo Sát & Nhận Báo Giá**.' },
      { p: 'Khách nhận **mã phiếu tiếp nhận** và nút nhắn Zalo trực tiếp kỹ sư. Phiếu vào CRM thành lead để sale gọi lại.' },
      { tip: 'Ô quy mô thay đổi theo hạng mục khách chọn (cắm mốc hỏi số mốc, tách thửa hỏi số lô…) để báo giá sát hơn.' },
    ],
  },

  // ───────────────────────── Hợp đồng & hồ sơ ─────────────────────────
  {
    id: 'hop-dong',
    group: 'Hợp đồng & hồ sơ',
    title: 'Hợp Đồng — soạn, theo dõi, huỷ',
    audience: 'management',
    permission: 'contract',
    tabs: ['contracts'],
    blocks: [
      {
        steps: [
          'Bấm **Soạn hợp đồng mới**. Chọn khách — khách cũ được **tự điền** thông tin.',
          'Tải **Hồ sơ khách gửi** (ảnh, PDF, tệp Office nhận qua Zalo); bước K01 sẽ phân loại sau.',
          'Nhập **Địa chỉ bất động sản** (tỉnh, phường/xã, số nhà).',
          'Chọn **Gói dịch vụ** và **Hạng mục** — **Giấy tờ cần thu của khách** tự hiện theo hạng mục; chọn **Mẫu hợp đồng**.',
          'Nhập **Giá trị hợp đồng** — gõ tắt được: `18.5tr`, `500k`, hoặc bấm +1 / +5 / +10 triệu.',
          'Chọn **Độ ưu tiên**: Bình thường, Ưu tiên cao (x1,2), Gấp (x1,5) và ghi lý do; đặt **Ngày ký**, **Hạn hoàn thành**.',
          'Thanh cuối cho biết đã điền đủ các trường bắt buộc chưa → lưu.',
        ],
      },
      { p: 'Chọn một hợp đồng trong danh sách để xem chi tiết, **Mở tài liệu hợp đồng** (bản Word) hoặc bấm **Quy trình** để mở sơ đồ công việc.' },
      {
        table: {
          head: ['Thao tác', 'Khi nào dùng', 'Hệ quả'],
          rows: [
            ['**Hủy hợp đồng**', 'Khách dừng dự án, ngừng thực hiện', 'Quy trình đang chạy chuyển **Đã huỷ**; dữ liệu tài chính và hồ sơ vẫn giữ để đối soát. Bắt buộc nhập lý do (≥ 5 ký tự)'],
            ['**Xoá hợp đồng**', 'Chỉ cho hợp đồng tạo nhầm / nháp, chưa thu tiền', 'Xoá hẳn hợp đồng, hạng mục và công nợ — **không thể khôi phục**. Phải gõ lại đúng mã hợp đồng để xác nhận'],
          ],
        },
      },
    ],
  },
  {
    id: 'quy-trinh-hd',
    group: 'Hợp đồng & hồ sơ',
    title: 'Quy trình công việc của hợp đồng',
    audience: 'management',
    permission: 'contract',
    tabs: ['contracts'],
    blocks: [
      { p: 'Mỗi hạng mục chạy theo một sơ đồ các bước (node) nối với nhau. Sơ đồ được lấy từ **quy trình mẫu** của Gói & Hạng mục, có thể chỉnh riêng cho từng hợp đồng.' },
      {
        table: {
          head: ['Mã', 'Bước', 'Việc chính'],
          rows: [
            ['K01', 'Tiếp nhận & kiểm tra đầu vào', 'Nhận giấy tờ của khách, kiểm tra tính hợp lệ'],
            ['K02', 'Khảo sát & đo hiện trường', 'Khảo sát thực địa, đo GPS RTK, mốc ranh'],
            ['K03', 'Chuẩn hoá tài liệu kỹ thuật', 'Xử lý số liệu, vẽ bản đồ CAD, tính diện tích'],
            ['K04', 'Soạn bộ hồ sơ pháp lý', 'Soạn đơn từ, rà quy hoạch, hoàn thiện bộ hồ sơ'],
            ['K05a', 'Nộp hồ sơ (nội nghiệp)', 'Nộp hồ sơ kỹ thuật thẩm định, nhận phiếu tiếp nhận'],
            ['K05b', 'Nộp & theo dõi hồ sơ một cửa', 'Nộp tại một cửa, nhập mã biên nhận, theo dõi ngày hẹn'],
            ['K06', 'Nhận kết quả & bàn giao', 'Nhận kết quả, bàn giao cho khách, ký biên bản (có cổng kiểm soát công nợ)'],
            ['K07', 'Lưu trữ & đóng hồ sơ', 'Scan số hoá, lưu kho bản cứng, hoàn tất'],
          ],
        },
      },
      { p: 'Bấm một node để mở bảng bên phải với 3 tab:' },
      {
        list: [
          '**Node** — tên bước, thời hạn xử lý, **danh sách checklist**, tài liệu đầu ra, gói khoán (**Gắn gói khoán**) và người duyệt.',
          '**Phân công** — giao thẳng cho nhân viên, hoặc để **Bể việc** cho phòng ban nhận; có thể kích hoạt trước, phân công sau.',
          '**Năng lực** — năng lực bước chạy ngầm tự động (đo, CAD, pháp lý, nộp một cửa, bàn giao…).',
        ],
      },
      { p: '**Duyệt nghiệm thu**: khi nhân viên nộp, node hiện “chờ Giám đốc duyệt”. Xem minh chứng → **Duyệt đạt** hoặc **Từ chối** (ghi lý do). Node có rẽ nhánh thì chọn **Kết quả xử lý** để đi đúng nhánh, ví dụ **Cần làm lại**.' },
      { warn: 'Node đã bắt đầu thì danh sách nghiệm thu bị khoá; bản sửa chỉ được đổi đường chuyển bước hoặc thêm node mới, và chỉ có hiệu lực sau khi Giám đốc bấm **Áp dụng sửa đổi**.' },
      { p: '**Huỷ phiên vận hành** là thao tác kết thúc vĩnh viễn: node đang mở bị huỷ, node đã hoàn tất và khoán đã nghiệm thu được giữ; phải chọn nhóm lý do và nhập lý do chi tiết.' },
    ],
  },
  {
    id: 'ho-so-do-ve',
    group: 'Hợp đồng & hồ sơ',
    title: 'Hồ Sơ Đo Vẽ',
    audience: 'all',
    permission: 'survey_record',
    tabs: ['tasks'],
    blocks: [
      { p: 'Danh sách hồ sơ đo vẽ của các hợp đồng: tên hồ sơ, phường, khách hàng, người phụ trách, độ ưu tiên, trạng thái, cảnh báo hạn và các mốc ngày.' },
      {
        list: [
          'Lọc theo **Trạng thái**, **Gói dịch vụ**, **Hạng mục**, **Độ ưu tiên**, **Phường**.',
          'Cột **Cảnh báo**: Trong hạn · Sắp đến hạn · **Trễ hạn** · Chưa đặt hạn.',
          'Bấm **Chi tiết** để xem, **Sửa** để cập nhật phụ trách chính, phụ đo, ngày nộp nghiệm thu, ghi chú…',
          '**Tủ hồ sơ đo vẽ** chứa tệp của hồ sơ, sắp theo bước.',
        ],
      },
      { tip: 'Hồ sơ đã hoàn tất thì không sửa được nữa.' },
    ],
  },
  {
    id: 'ho-so-phap-ly',
    group: 'Hợp đồng & hồ sơ',
    title: 'Hồ Sơ Pháp Lý (Một Cửa)',
    audience: 'all',
    permission: 'legal_submission',
    tabs: ['legal'],
    blocks: [
      { p: 'Hồ sơ pháp lý được tạo sẵn từ bước soạn thảo (K04). Màn hình theo dõi từng bộ hồ sơ nộp cơ quan: số biên nhận, cơ quan tiếp nhận, ngày nhận biên nhận, **ngày hẹn trả kết quả**.' },
      {
        steps: [
          'Sau khi nộp tại cơ quan, mở hồ sơ → **Sửa**.',
          'Nhập **Số biên nhận**, chọn **Cơ quan tiếp nhận**, **Ngày nhận biên nhận**, **Ngày hẹn trả kết quả**.',
          'Dán link ảnh chụp biên nhận và link Drive hồ sơ tổng hợp → lưu.',
        ],
      },
      { tip: 'Lọc **Tình trạng** để thấy nhanh hồ sơ chưa nộp hoặc sắp tới ngày hẹn trả.' },
    ],
  },
  {
    id: 'ban-giao',
    group: 'Hợp đồng & hồ sơ',
    title: 'Bàn giao cho khách & kiểm soát công nợ',
    audience: 'all',
    tabs: ['contracts', 'employee-dashboard'],
    blocks: [
      { p: 'Bước bàn giao (K06) có **cổng kiểm soát công nợ**: khách chưa trả đủ tiền thì bước bị **Khóa nợ**, chưa giao hồ sơ được.' },
      {
        steps: [
          'Khách thanh toán tại chỗ: nhập **số tiền khách thanh toán**, người nộp, hình thức (tiền mặt / chuyển khoản) và **ảnh bill / biên lai** (bắt buộc). Phiếu thu chờ duyệt rồi mới trừ công nợ.',
          'Cần giao khi khách còn nợ: bấm **Xin duyệt nợ**, nêu lý do (≥ 5 ký tự), **hạn thanh toán cam kết**, đính kèm file cam kết nếu có.',
          'Giám đốc **Duyệt nợ** hoặc **Từ chối**. Duyệt chỉ mở khoá bước bàn giao, **không xoá công nợ** — trạng thái thành “Đã bàn giao — còn công nợ”.',
          'Hoàn thành **Checklist minh chứng bàn giao** và **Giao hồ sơ cho khách**.',
        ],
      },
    ],
  },

  // ───────────────────────── Điều hành ─────────────────────────
  {
    id: 'tong-quan',
    group: 'Điều hành (Giám đốc)',
    title: 'Tổng Quan',
    audience: 'management',
    directorOnly: true,
    tabs: ['dashboard'],
    blocks: [
      { p: 'Bức tranh tài chính và tiến độ toàn công ty:' },
      {
        list: [
          'Chỉ số nhanh: **Giá trị HĐ**, **Đã thu**, **Công nợ**, tổng hồ sơ, đang xử lý, **hồ sơ quá hạn**.',
          'Biểu đồ doanh thu & công nợ theo tháng, doanh thu theo dịch vụ, tỉ lệ trạng thái hồ sơ, cơ cấu chi phí.',
          '**Top 5 khách nợ nhiều nhất** và **Hồ sơ mới tiếp nhận** (bấm **Xem tất cả** để mở danh sách).',
        ],
      },
    ],
  },
  {
    id: 'timeline',
    group: 'Điều hành (Giám đốc)',
    title: 'Quản Lý Timeline',
    audience: 'management',
    directorOnly: true,
    tabs: ['timeline'],
    blocks: [
      { p: 'Biểu đồ thời gian (Gantt) của mọi hợp đồng / hạng mục: mỗi thanh là một node, màu theo trạng thái — hoàn thành, đang xử lý, **trễ hạn**, chưa bắt đầu.' },
      {
        list: [
          'Tìm theo hợp đồng, khách hàng, hạng mục.',
          'Lọc trạng thái (đang vận hành, **có node trễ hạn**, đã hoàn thành, đã huỷ) và loại node (Đo vẽ, Pháp lý, Dùng chung).',
          'Phóng to / thu nhỏ trục thời gian; bấm **Hôm nay** để về ngày hiện tại.',
          'Bấm một thanh để xem người phụ trách, các mốc thực tế → **Đi tới chi tiết Node**.',
        ],
      },
    ],
  },
  {
    id: 'hang-cho-duyet',
    group: 'Điều hành (Giám đốc)',
    title: 'Hàng Chờ Duyệt',
    audience: 'management',
    directorOnly: true,
    tabs: ['approvals'],
    blocks: [
      { p: 'Mọi phiếu cần chữ ký Giám đốc gom về một chỗ để không phiếu nào bị treo, ví dụ đề xuất **loại tài liệu phát sinh** của nhân viên.' },
      {
        steps: [
          'Mở một phiếu, kiểm tra nội dung và tệp đính kèm.',
          'Chuẩn hoá trước khi duyệt: **tên chính thức**, số lượng, **nguồn** (Khách hàng cung cấp / Công ty soạn lập / Cơ quan Nhà nước trả) và **phạm vi áp dụng** — chỉ hạng mục này, mọi hạng mục cùng loại, cùng gói, hoặc mọi hạng mục.',
          'Đánh dấu **Bắt buộc trước khi nộp** / **Cần Giám đốc duyệt** nếu cần → Duyệt. Hoặc **Từ chối** / **Yêu cầu bổ sung**.',
        ],
      },
    ],
  },
  {
    id: 'quy-trinh-mau',
    group: 'Điều hành (Giám đốc)',
    title: 'Quy Trình & Mẫu Giấy',
    audience: 'management',
    directorOnly: true,
    tabs: ['doc-templates'],
    blocks: [
      { p: 'Nơi chuẩn hoá cách công ty làm việc. Gồm hai phần:' },
      { p: '**1. Sơ đồ quy trình mẫu (Workflow Studio)** — quy trình chuẩn cho từng Combo (Gói dịch vụ + Hạng mục). Hợp đồng mới tạo ra sẽ chạy theo mẫu **mặc định** của combo.' },
      {
        list: [
          'Chọn Gói & Hạng mục ở thanh trên, chọn mẫu quy trình.',
          'Thêm node, nối các node, bấm một node để sửa checklist, người duyệt, phòng ban nhận việc, thời hạn.',
          'Checklist có tiền khoán: **Gắn gói khoán** → chọn công việc; mục **Lương khoán** hiện định mức cho thợ **Chính** và thợ **Phụ** (có dòng Phụ nghĩa là tự mở suất thợ phụ).',
          '**Nhân bản** mẫu trong cùng combo, hoặc **⚡ Nhân bản sang Combo** khác chỉ trong một lần bấm (có thể đặt làm mặc định cho combo đích).',
        ],
      },
      { p: '**2. Danh mục mẫu giấy tờ (Document Register)** — mỗi hạng mục cần những loại giấy nào: nguồn phát sinh (khách cung cấp, công ty soạn, cơ quan trả), bắt buộc hay tuỳ chọn, bản gốc hay bản sao. Bấm **Thêm loại giấy** để bổ sung; quản lý luôn **cây Gói và Hạng mục** và **danh mục nơi lưu bản cứng**.' },
      { warn: 'Hệ thống cảnh báo khi có loại giấy tờ bắt buộc chưa được gán vào bước nào, hoặc bước chưa gắn gói khoán (nhân viên làm bước đó sẽ không nhận khoán). Kiểm tra kỹ trước khi lưu.' },
    ],
  },
  {
    id: 'kpi',
    group: 'Điều hành (Giám đốc)',
    title: 'KPI Nhân Sự',
    audience: 'management',
    directorOnly: true,
    permission: 'hr',
    tabs: ['kpi'],
    blocks: [
      { p: 'Bảng điểm KPI theo tháng (thang 100), tính từ: **số hồ sơ hoàn thành**, **tỷ lệ đúng hạn**, **lỗi nộp lại** và **thời gian xử lý trung bình**.' },
      {
        list: [
          'Chọn **Kỳ đánh giá** (tháng) ở đầu trang.',
          'Xem xếp hạng, người **dẫn đầu kỳ** và phân bổ hiệu suất.',
          'Trên màn hình hẹp, vuốt ngang bảng để xem đủ chỉ số.',
        ],
      },
    ],
  },

  // ───────────────────────── Tài chính ─────────────────────────
  {
    id: 'thu-chi',
    group: 'Tài chính',
    title: 'Thu Chi Sổ Quỹ — tổng quan phân hệ',
    audience: 'management',
    permission: 'finance',
    tabs: ['cashflow'],
    blocks: [
      { p: 'Phân hệ tài chính chia 3 nhóm tab (chọn nhóm ở thanh **Phân hệ**):' },
      {
        table: {
          head: ['Nhóm', 'Tab'],
          rows: [
            ['Dòng tiền & sổ quỹ', 'Báo cáo tháng · Nhật ký thu chi · Quỹ tiền mặt · Quỹ ngân hàng · Chứng từ in (Thu/Chi)'],
            ['Công nợ & tạm ứng', 'Thu công nợ · Công nợ phải thu · Đề xuất tạm ứng · Quyết toán hoàn ứng'],
            ['Lương 3P & danh mục', 'Lương khoán nhiệm vụ · Bảng giá khoán · Lương VP & hoa hồng · Thiết lập tài chính'],
          ],
        },
      },
      {
        table: {
          head: ['Việc', 'Giám đốc', 'Kế toán'],
          rows: [
            ['Lập phiếu thu', '✅', '—'],
            ['Lập phiếu chi', '✅', '✅ (chờ Giám đốc duyệt)'],
            ['Duyệt phiếu thu / chi, tạm ứng', '✅', '—'],
            ['Xem doanh thu, công nợ phải thu', '✅', 'Ẩn (kế toán chỉ thấy phần chi)'],
            ['Chốt sổ quỹ, khoá bảng lương', '✅', '—'],
          ],
        },
      },
      {
        steps: [
          'Lập phiếu: ở **Nhật ký thu chi** (hoặc Quỹ tiền mặt / ngân hàng) bấm **Lập phiếu thu** hoặc **Lập phiếu chi**, chọn hạng mục, số tiền, hình thức, diễn giải, đính kèm chứng từ.',
          'Phiếu chi của kế toán ở trạng thái **Chờ duyệt** — quỹ chưa bị trừ cho tới khi Giám đốc duyệt.',
          'Giám đốc mở phiếu → **Duyệt phiếu** hoặc **Từ chối** (bắt buộc ghi lý do).',
          'In phiếu thu, phiếu chi, tạm ứng, thanh toán tạm ứng theo mẫu Thông tư 99/2025 ở tab **Chứng từ in**.',
        ],
      },
      { warn: 'Phiếu đã ghi nhận không bị xoá cứng. Phiếu sai thì **Hủy phiếu** (ghi lý do) — hệ thống tự tạo bút toán đảo. Giao dịch thuộc kỳ đã **chốt sổ** thì không thêm, sửa hay huỷ được.' },
      { tip: 'Tài liệu chi tiết từng nghiệp vụ tài chính: xem “Sổ tay hướng dẫn sử dụng module Kế toán & Tài chính” trong **Đào Tạo & ISO** (nếu đã được tải lên).' },
    ],
  },
  {
    id: 'cong-no',
    group: 'Tài chính',
    title: 'Thu công nợ & tạm ứng',
    audience: 'management',
    permission: 'finance',
    tabs: ['cashflow'],
    blocks: [
      { p: '**Thu công nợ** (Giám đốc) liệt kê hợp đồng còn nợ — đỏ: còn nợ, xanh: đã thu đủ và phiếu thu đã duyệt. Danh sách tự cập nhật mỗi 30 giây.' },
      {
        list: [
          '**Ghi nhận thanh toán**: nhập số tiền khách đưa, ảnh bill, hình thức — trừ công nợ và cập nhật sổ quỹ ngay.',
          '**Xóa nợ / Miễn giảm**: Giám đốc duyệt, ghi lý do.',
          '**Chuyển nợ sang HĐ mới**: gộp nợ sang hợp đồng khác của cùng khách (xem trước tổng nợ mới trước khi xác nhận).',
          'Lọc **Nợ quá 7 ngày**, đã / chưa bàn giao để ưu tiên đôn đốc.',
        ],
      },
      { p: '**Công nợ phải thu** có phân tích tuổi nợ và xử lý hợp đồng **nộp thừa** (hoàn tiền thừa).' },
      { p: '**Tạm ứng**: nhân viên gửi đề xuất → Giám đốc duyệt → kế toán chi tiền. Sau chuyến công tác, kế toán làm **Quyết toán hoàn ứng**: hệ thống tự tạo phiếu thu tiền thừa hoặc phiếu chi bù.' },
    ],
  },
  {
    id: 'luong-khoan',
    group: 'Tài chính',
    title: 'Lương khoán, bảng giá khoán & lương văn phòng',
    audience: 'management',
    permission: 'finance',
    tabs: ['cashflow'],
    blocks: [
      {
        list: [
          '**Bảng giá khoán** — đơn giá cho từng công việc và vai trò (Chính / Phụ / Nộp), có ngày hiệu lực và trạng thái nháp / ban hành. Đây là nguồn của mục “Lương khoán” trong quy trình mẫu.',
          '**Lương khoán nhiệm vụ** — bảng kê tự sinh 100% từ checklist đã nghiệm thu; không nhập tay.',
          '**Lương VP & hoa hồng** — lương khối văn phòng và hoa hồng kinh doanh. Giám đốc **khoá sổ lương tháng**; kế toán xác nhận **đã chi trả**.',
        ],
      },
      { tip: 'Đổi giá khoán không làm thay đổi các khoản đã nghiệm thu trước đó.' },
    ],
  },

  // ───────────────────────── Nhân sự & tri thức ─────────────────────────
  {
    id: 'nhan-su',
    group: 'Nhân sự & tri thức',
    title: 'Nhân sự & phòng ban',
    audience: 'management',
    permission: 'hr',
    tabs: ['wiki'],
    blocks: [
      { p: 'Mục **Nhân Sự & Đào Tạo** gồm 3 tab: **Danh sách nhân sự**, **Phòng ban**, **Đào Tạo & ISO**.' },
      {
        steps: [
          'Bấm **Thêm** để tạo hồ sơ nhân viên: thông tin chung (phòng ban, chức danh, loại hợp đồng, ngày vào làm, lương cơ bản), định danh, cư trú & liên hệ, ngân hàng.',
          'Cấp quyền đăng nhập: **Tạo tài khoản** → chọn tên đăng nhập và **vai trò hệ thống** → hệ thống gửi email mời đặt mật khẩu (**Gửi lại email mời** nếu nhân viên chưa nhận).',
          'Nhân viên nghỉ: **Khoá tài khoản** (mở lại bằng **Kích hoạt lại tài khoản**).',
        ],
      },
      { warn: 'Cấp vai trò ngoài chuyên môn phòng ban sẽ hiện **cảnh báo phân quyền** và phải xác nhận — chỉ làm khi thật cần.' },
      { p: '**Chuyển giao việc** khi nhân viên nghỉ hoặc chuyển vị trí — chọn một trong 3 phương án:' },
      {
        list: [
          '**Bàn giao cho nhân sự khác** — chuyển toàn bộ bước hợp đồng, checklist, khách CRM cho người nhận.',
          '**Giải phóng về Bể việc chung** — nhả các bước lên Bể việc để người đủ năng lực tự nhận.',
          '**Giữ nguyên & phân công lại sau**.',
        ],
      },
      { p: 'Có thể tick **khoá tài khoản sau khi bàn giao**. Tab **Phòng ban**: thêm, sửa, tạm ngừng phòng ban và xem nhân sự trực thuộc.' },
    ],
  },
  {
    id: 'wiki',
    group: 'Nhân sự & tri thức',
    title: 'Đào tạo & ISO (Wiki)',
    audience: 'all',
    permission: 'wiki',
    tabs: ['wiki'],
    blocks: [
      { p: 'Kho tài liệu nội bộ: quy trình ISO, sổ tay, hướng dẫn. Tài liệu tải lên đây cũng là **nguồn tri thức của Trợ lý AI**.' },
      {
        steps: [
          'Bấm **Thêm Tài Liệu Mới**: nhập **mã tài liệu** duy nhất (VD: ISO-001), tên, phân loại, mô tả.',
          'Kéo thả hoặc chọn tệp (tối đa 25MB) → lưu. Hệ thống tự đọc nội dung để Trợ lý AI tra cứu.',
          'Tìm theo tên / mã, lọc theo phân loại; **Mở file**, **Tải về**, **Sửa** (thay tệp mới) hoặc **Xóa**.',
        ],
      },
      {
        table: {
          head: ['Định dạng', 'Trợ lý AI đọc được?'],
          rows: [
            ['Word .docx chỉ có chữ, .txt, .md', '✅ Tốt nhất'],
            ['PDF xuất từ Word', '🟡 Được, bảng dễ bị lộn xộn'],
            ['Bảng trong file Word', '❌ Bị bỏ qua — nên chuyển thành gạch đầu dòng'],
            ['PDF scan / ảnh chụp', '❌ Không đọc được chữ'],
          ],
        },
      },
      { tip: 'Mỗi tài liệu chỉ khoảng 12.000 chữ đầu (≈ 25–30 trang) được Trợ lý AI đọc. Tài liệu dài nên tách mỗi quy trình một file, đặt tiêu đề rõ ràng.' },
    ],
  },

  // ───────────────────────── Hệ thống ─────────────────────────
  {
    id: 'cau-hinh',
    group: 'Hệ thống',
    title: 'Cấu Hình tích hợp',
    audience: 'management',
    directorOnly: true,
    tabs: ['settings'],
    blocks: [
      { p: 'Nhập API Key / Token cho các dịch vụ bên ngoài. Dữ liệu được mã hoá khi lưu.' },
      {
        table: {
          head: ['Nhóm', 'Dùng cho'],
          rows: [
            ['Xuất File (Báo giá, Hợp đồng)', 'Mẫu Google Docs hợp đồng, tài khoản dịch vụ Google'],
            ['Thông báo & Chăm sóc', 'Zalo, Telegram (nhóm nội bộ)'],
            ['AI & Call Center', 'Gemini API Key, Trợ lý AI (nhà cung cấp, model, API key riêng), Stringee'],
            ['Chấm công tự động', 'Webhook URL dán vào Hanet Dashboard'],
          ],
        },
      },
      {
        list: [
          '**Trợ lý AI**: chỉ cần nhập **Google Gemini API Key** là trợ lý dùng Gemini. Muốn dùng DeepSeek thì gõ `deepseek` ở ô nhà cung cấp và nhập API key riêng.',
          '**Model Chatbot** để trống là dùng mặc định. Khi Google ngừng một model, chỉ cần gõ tên model mới vào đây.',
          'Nút kiểm tra cạnh một số ô giúp thử key trước khi dùng.',
        ],
      },
    ],
  },
  {
    id: 'faq',
    group: 'Hệ thống',
    title: 'Câu hỏi thường gặp',
    audience: 'all',
    blocks: [
      { p: '**Không thấy một mục trên menu?** Tài khoản chưa có quyền. Nhờ Giám đốc kiểm tra vai trò trong Nhân sự.' },
      { p: '**Không nộp được minh chứng?** Phải bấm **Bắt đầu làm** trước. Nếu bước đang “Chờ duyệt” thì chờ Giám đốc xử lý.' },
      { p: '**Không nhận thêm việc được?** Bạn đã đủ tải. Hoàn thành một hạng mục để mở slot.' },
      { p: '**Không bàn giao được hồ sơ?** Khách còn nợ — bước K06 đang **Khóa nợ**. Thu đủ tiền hoặc **Xin duyệt nợ**.' },
      { p: '**Trợ lý AI trả lời “vượt quá khả năng”?** Câu hỏi không có trong tài liệu đã tải lên. Hỏi lại cụ thể hơn, hoặc bổ sung tài liệu vào Wiki.' },
      { p: '**Số liệu chưa cập nhật?** Bấm nút **Làm mới** trên thanh trên cùng.' },
      { p: '**Thông báo lỗi khó hiểu?** Chụp màn hình kèm thời điểm, gửi cho quản trị hệ thống.' },
    ],
  },
]
