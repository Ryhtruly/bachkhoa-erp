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
//                  · { image: { src: '/help/x.png', caption } } ảnh chụp (scripts/help-screenshots)
//   Trong chuỗi, **đậm** được in đậm; [1] là số tròn khớp với số khoanh trên ảnh.

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
    title: 'Tài khoản & mật khẩu',
    audience: 'all',
    blocks: [
      { p: 'Có 4 việc liên quan tới mật khẩu: **kích hoạt tài khoản** lần đầu, **đăng nhập**, **quên mật khẩu** và **đổi mật khẩu**. Mật khẩu tối thiểu 6 ký tự.' },

      { p: '**1. Kích hoạt tài khoản (lần đầu)** — Giám đốc tạo tài khoản cho bạn trong mục Nhân sự, hệ thống gửi **email mời**. Mở email, bấm đường dẫn để vào trang đặt mật khẩu:' },
      { image: { src: '/help/mat-khau-kich-hoat.png', caption: 'Trang kích hoạt tài khoản mở từ email mời.' } },
      {
        steps: [
          'Kiểm tra đúng **tên đăng nhập** và tên nhân sự của mình [1].',
          'Nhập **mật khẩu mới** [2] — dòng chữ xanh “Tối thiểu 6 ký tự” hiện khi đạt yêu cầu. Bấm biểu tượng con mắt để xem lại chữ đã gõ.',
          'Nhập lại ở ô **xác nhận** [3] cho tới khi hiện “Mật khẩu khớp nhau”.',
          'Bấm **Lưu mật khẩu & Đăng nhập** [4] — hệ thống tự đăng nhập luôn.',
        ],
      },
      { warn: 'Đường dẫn trong email chỉ dùng được **một lần** và hết hạn sau **48 giờ**. Hết hạn thì nhờ Giám đốc bấm **Gửi lại email mời** trong mục Nhân sự.' },

      { p: '**2. Đăng nhập**' },
      { image: { src: '/help/mat-khau-dang-nhap.png', caption: 'Màn đăng nhập.' } },
      {
        steps: [
          'Nhập **tên đăng nhập** [1] và **mật khẩu** [2]. Tick **Ghi nhớ** nếu dùng máy riêng.',
          'Bấm **Truy cập hệ thống** [3].',
          'Quên mật khẩu thì bấm **Quên mật khẩu?** [4] (xem phần 3).',
        ],
      },

      { p: '**3. Quên mật khẩu** — lấy lại bằng mã OTP gửi về email của tài khoản:' },
      { image: { src: '/help/mat-khau-quen-1.png', caption: 'Bước 1: nhập tài khoản hoặc email.' } },
      { steps: ['Nhập **tên đăng nhập hoặc email** [1] → bấm **Gửi mã OTP qua Email** [2].'] },
      { image: { src: '/help/mat-khau-quen-2.png', caption: 'Bước 2: nhập mã OTP trong email.' } },
      {
        steps: [
          'Mở email, lấy **mã OTP 6 số** (hiệu lực **10 phút**) và nhập vào [1] → **Tiếp tục đặt mật khẩu** [2].',
          'Không thấy email? Xem thư mục Spam, hoặc đợi hết đếm ngược rồi bấm **Gửi lại mã OTP** [3]. Gõ nhầm tài khoản thì bấm **← Đổi email**.',
        ],
      },
      { image: { src: '/help/mat-khau-quen-3.png', caption: 'Bước 3: đặt mật khẩu mới.' } },
      { steps: ['Nhập **mật khẩu mới** [1], nhập lại [2] → **Cập nhật & Đăng nhập** [3].'] },
      { tip: 'Tài khoản chưa có email thì không nhận được OTP — nhờ Giám đốc cập nhật email trong hồ sơ nhân sự.' },

      { p: '**4. Đổi mật khẩu** (khi đang đăng nhập)' },
      { image: { src: '/help/mat-khau-doi-1.png', caption: 'Bấm ảnh đại diện ở góc phải → Đổi mật khẩu.' } },
      { image: { src: '/help/mat-khau-doi-2.png', caption: 'Hộp Đổi mật khẩu tài khoản.' } },
      {
        steps: [
          'Bấm **ảnh đại diện** ở góc trên bên phải → **Đổi mật khẩu** [1].',
          'Nhập **mật khẩu hiện tại** [2], **mật khẩu mới** [3] (khác mật khẩu cũ) và **xác nhận** [4].',
          'Bấm **Đổi mật khẩu** [5].',
        ],
      },
      { p: 'Cũng trong menu ảnh đại diện: **Phiếu lương của tôi** và **Đăng xuất** — nên đăng xuất khi dùng máy chung.' },
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
      { p: 'Mục **Lịch trình** là bàn làm việc hằng ngày của bạn: thanh tải, lịch tuần, các hạng mục đang giữ và **Bể việc** — nơi các việc chờ người nhận.' },
      { image: { src: '/help/be-viec-tai.png', caption: '[1] Thanh **Tải của bạn**: đang giữ bao nhiêu hạng mục trên mức tối đa.' } },
      { p: 'Khi thanh tải đầy, bạn phải hoàn thành một hạng mục thì mới nhận thêm được.' },
      { image: { src: '/help/be-viec-be.png', caption: 'Bể việc của phòng — mỗi thẻ là một hạng mục kèm tổng khoán dự kiến.' } },
      {
        steps: [
          'Kéo xuống **Bể việc**. Chọn nhóm việc [1]: **Nhận trọn** (trọn chuỗi bước của một hạng mục), **Thợ phụ** (đi cùng thợ chính) hoặc **Hỗ trợ** (đồng nghiệp nhờ làm thay).',
          'Bấm **Chi tiết** [2] để xem địa chỉ, khách, các bước và mức khoán từng bước.',
          'Bấm **Nhận trọn** [3] (ở tab Thợ phụ là **Nhận làm phụ**, tab Hỗ trợ là **Nhận làm hộ**). Việc chuyển lên mục **Hạng mục bạn đã nhận**.',
        ],
      },
      { tip: 'Suất **thợ phụ** đóng ngay khi thợ chính bấm **Bắt đầu đo** — muốn đi phụ thì nhận sớm. Việc **Hỗ trợ** có khoán đề xuất; Giám đốc chốt số cuối khi duyệt.' },
      { image: { src: '/help/be-viec-hang-muc.png', caption: 'Hạng mục bạn đã nhận: bước hiện tại, tiến độ và khoán đã đạt / tổng khoán.' } },
      {
        list: [
          '**Mở ra làm** [1] — vào màn làm việc của bước hiện tại (xem mục “Thực hiện bước & nộp nghiệm thu”).',
          '**Nhờ hỗ trợ** [2] — khi gặp sự cố không tự làm tiếp được (ốm, hỏng máy…). Bước được đưa lên Bể việc dạng “Hỗ trợ”. Trong lúc chưa ai nhận, bạn vẫn chịu trách nhiệm; đổi ý thì bấm **Rút lại lời nhờ**.',
        ],
      },
    ],
  },
  {
    id: 'lam-buoc',
    group: 'Dành cho nhân viên',
    title: 'Thực hiện bước & nộp nghiệm thu',
    audience: 'employee',
    tabs: ['employee-dashboard'],
    blocks: [
      { p: 'Mỗi hợp đồng chạy theo các **bước** (K01 Tiếp nhận, K02 Đo hiện trường, K03 Chuẩn hoá kỹ thuật…). Mỗi bước có **danh sách checklist** — việc phải làm và minh chứng phải nộp. Bấm **Mở ra làm** ở hạng mục đã nhận để vào màn dưới đây.' },
      { image: { src: '/help/lam-buoc.png', caption: 'Màn làm việc của một bước.' } },
      {
        steps: [
          'Dải bước [1] cho biết bước nào **đã hoàn thành**, bước nào **đang xử lý** và bước nào **chưa tới**. Bước của người khác hiện để xem nhưng không bấm được.',
          'Bấm **Bắt đầu làm** [2] (bước đo: **Bắt đầu đo hiện trường**). Chỉ sau khi bắt đầu mới nộp được minh chứng; ô **Thời gian còn lại** đếm ngược tới hạn.',
          'Với từng mục checklist, bấm **Chọn file minh chứng** [3] để tải ảnh / PDF / bản vẽ. Mục ghi **Bắt buộc** thì không được bỏ trống.',
          'Cần giấy tờ khách gửi hoặc tài liệu của bước trước? Bấm **Mở tủ hồ sơ theo bước** [4] (hoặc mở **Kho giấy tờ khách gửi** phía trên checklist).',
          'Đủ minh chứng thì nộp nghiệm thu. Nếu quá hạn, hệ thống bắt buộc ghi **Lý do nộp trễ**.',
        ],
      },
      { p: 'Sau khi nộp: mục chuyển **Chờ duyệt**. Giám đốc duyệt thì thành **Đã duyệt** và khoán được cộng vào lương; bị trả về thì thành **Bị từ chối** kèm lý do — sửa rồi nộp lại.' },
      { p: 'Ô vàng cuối trang cho biết **Khoán nhiệm vụ**, **Thưởng dự kiến** (hồ sơ ưu tiên hoàn thành đúng hạn) và **Tổng**. Gặp sự cố thì bấm **Nhờ hỗ trợ** [5].' },
      { p: '**Phát sinh loại giấy chưa có trong checklist** (ví dụ ảnh mốc ranh phát sinh): dùng **Đề xuất loại tài liệu phát sinh** — điền tên, lý do, số lượng, nguồn, đính kèm tệp rồi **Gửi duyệt**.' },
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
    id: 'sale-quy-trinh',
    group: 'Kinh doanh & khách hàng',
    title: 'Quy trình Sale: từ mã QR tới hợp đồng',
    audience: 'all',
    permission: 'crm',
    tabs: ['crm'],
    blocks: [
      { p: 'Toàn bộ đường đi của một khách, từ lúc nhận mã QR tới lúc có hợp đồng và công việc chạy:' },
      {
        table: {
          head: ['Bước', 'Ai làm', 'Việc', 'Hệ thống tự làm'],
          rows: [
            ['1. Gửi form', 'Sale', 'Gửi mã QR hoặc đường dẫn form cho khách qua Zalo', '—'],
            ['2. Điền form', 'Khách', 'Quét QR, chọn dịch vụ, nhập thửa đất & SĐT, bấm Gửi', 'Tạo lead ở cột **Tiếp cận**, báo chuông + Telegram'],
            ['3. Nhận lead', 'Sale', 'Bấm **Nhận lead này**', 'Khoá lead cho người bấm trước, kiểm tra giới hạn tải'],
            ['4. Tư vấn', 'Sale', 'Chuyển **Báo giá → Đàm phán**', 'Cộng điểm tải theo cột'],
            ['5. Chốt', 'Sale', 'Chuyển sang **Chốt**, nhập giá trị', '**Tự tạo hợp đồng**, file Word, công nợ, sổ giấy tờ'],
            ['6. Khởi động', 'Giám đốc', 'Mở hợp đồng → **Quy trình** → **Kích hoạt**', 'Các bước K01… lên Bể việc cho nhân viên nhận'],
          ],
        },
      },

      { p: '**Bước 1 — Sale gửi form cho khách.** Chỉ **Sale** gửi form (không có bot tự gửi). Ở CRM bấm **Mã QR Form**:' },
      { image: { src: '/help/sale-qr.png', caption: 'Tạo mã QR mở sẵn đúng dịch vụ khách cần.' } },
      {
        steps: [
          'Chọn **Gói dịch vụ** [1] và **Hạng mục** [2] (không bắt buộc) — khách quét mã [3] sẽ vào thẳng form của dịch vụ đó, không phải tự chọn.',
          'Bấm **Sao chép** [4] lấy đường dẫn dán vào tin nhắn Zalo gửi khách, hoặc **Tải Ảnh QR** [5] gửi ảnh cho khách quét (in lên danh thiếp, tờ rơi nếu cần).',
        ],
      },
      { tip: 'Khách hỏi dịch vụ nào thì gửi đúng mã QR / đường dẫn của dịch vụ đó (Đo hiện trạng, Cắm mốc, Cấp đổi sổ…) để khách khỏi phải tự chọn. Nút **Copy Link Form Zalo** trên thanh CRM lấy nhanh đường dẫn chung.' },

      { p: '**Bước 2 — Khách mở form và điền.** Không cần tài khoản, dùng tốt trên điện thoại:' },
      { image: { src: '/help/sale-form-1.png', caption: 'Khách chọn nhóm dịch vụ và hạng mục.' } },
      { image: { src: '/help/sale-form-2.png', caption: 'Khách nhập thửa đất, quy mô và thông tin liên hệ.' } },
      {
        steps: [
          'Chọn nhóm dịch vụ [1] (Đo Vẽ, Pháp Lý, Xin Phép Xây Dựng) rồi bấm chọn **hạng mục muốn tư vấn** [2] — đã chọn sẵn nếu khách mở từ mã QR theo dịch vụ. Danh sách hạng mục lấy từ danh mục **Gói & Hạng mục** trong Quy Trình & Mẫu Giấy: thêm hạng mục mới ở đó là form tự hiện.',
          'Nhập quy mô [3] — ô này tự đổi theo hạng mục: diện tích (đo hiện trạng), số mốc (cắm mốc), số lô (tách thửa)…',
          'Nhập địa chỉ thửa đất [4], họ tên [5], số Zalo [6] rồi bấm **Gửi Yêu Cầu Khảo Sát & Nhận Báo Giá** [7].',
        ],
      },
      { image: { src: '/help/sale-form-xong.png', caption: 'Khách nhận mã phiếu LEAD-… và nút nhắn Zalo trực tiếp kỹ sư.' } },
      {
        list: [
          'Ngay khi khách bấm Gửi, hệ thống **tìm khách theo số điện thoại** — khách cũ không bị tạo trùng, chỉ bổ sung địa chỉ / email / MST còn thiếu.',
          'Tạo **lead mới ở cột Tiếp cận** với nhu cầu ghi sẵn dạng “Dịch vụ: … | Quy mô: … | Vị trí BĐS: …”.',
          'Báo **chuông thông báo** trong ERP và tin **Telegram** nhóm nội bộ để sale gọi lại sớm.',
          'Chống spam: mỗi mạng chỉ gửi được 5 lần / phút.',
        ],
      },

      { p: '**Bước 3 — Sale nhận lead.** Lead mới chưa có người phụ trách hiện cho mọi sale ở cột Tiếp cận. Bấm **Nhận lead này**: ai bấm trước người đó giữ; từ đó chỉ người giữ (và Giám đốc) được đổi trạng thái lead. Sale kéo một lead chưa ai nhận sang cột khác thì hệ thống tự nhận hộ trước.' },
      {
        table: {
          head: ['Giới hạn tải của mỗi Sale', 'Mặc định'],
          rows: [
            ['Điểm mỗi lead đang mở', 'Tiếp cận 1 · Báo giá 2 · Đàm phán 3 (lead đã Chốt không tính)'],
            ['Tổng điểm tối đa', '15 điểm'],
            ['Số lead mở tối đa', '20 lead'],
          ],
        },
      },
      { p: 'Vượt một trong hai ngưỡng thì không nhận thêm lead được — chốt hoặc chuyển bớt lead trước. Giám đốc chỉnh các con số này ở **Thiết lập CRM**.' },

      { p: '**Bước 4 — Tư vấn.** Chuyển thẻ qua **Báo giá** rồi **Đàm phán** (ô **Chuyển** trên thẻ hoặc kéo thả). Dùng nút **Chat Zalo** trên thẻ để nhắn khách.' },

      { p: '**Bước 5 — Chốt deal, hợp đồng tự tạo.** Chuyển thẻ sang **Chốt**:' },
      { image: { src: '/help/sale-chot.png', caption: 'Hộp Xác nhận Chốt Deal & Tạo Hợp Đồng.' } },
      {
        steps: [
          'Khách cũ đủ điều kiện được báo **ưu đãi khách thân thiết** [1] và tự trừ chiết khấu.',
          'Nhập **Giá trị hợp đồng gốc** [2] (bắt buộc) — bên dưới hiện số tiền sau ưu đãi và hoa hồng sale dự kiến.',
          'Kiểm tra **Quy mô / Diện tích / Số mốc** [3] (điền sẵn từ lead) và nhập **MST / CCCD** [4] nếu có.',
          'Bấm **Chốt Deal & Sinh Hợp Đồng Tự Động** [5].',
        ],
      },
      { p: 'Ngay khi bấm, hệ thống **tự làm toàn bộ** những việc sau — không cần soạn tay:' },
      {
        list: [
          'Cấp **mã hợp đồng** theo quy tắc `xxx/BK-năm`, ngày ký là hôm nay, **sale phụ trách** là người đang giữ lead.',
          'Xác định **hạng mục** từ phần “Dịch vụ: …” của lead (không khớp tên thì dùng hạng mục mặc định — Giám đốc nên kiểm tra lại).',
          'Sinh **file hợp đồng Word** từ mẫu: tên khách, SĐT, địa chỉ, MST/CCCD, dịch vụ, quy mô, số tiền bằng số và bằng chữ — lưu vào **Tủ hồ sơ**.',
          'Mở **hạng mục công việc** kèm **sổ giấy tờ** mặc định của hạng mục.',
          'Ghi **công nợ phải thu** bằng giá trị hợp đồng.',
          '**Khoá tỷ lệ hoa hồng** tại thời điểm chốt (đổi tỷ lệ sau này không ảnh hưởng hợp đồng đã chốt).',
          'Đánh dấu phiếu đăng ký gốc của khách là “đã chuyển thành hợp đồng” và báo **Telegram** có hợp đồng mới.',
        ],
      },

      { p: '**Bước 6 — Khởi động công việc (Giám đốc).** Hợp đồng mới hiện trong **Hợp Đồng** với trạng thái **Chưa có quy trình**. Giám đốc mở hợp đồng → **Quy trình** → chọn mẫu quy trình → **Kích hoạt**; lúc đó các bước K01, K02… mới lên Bể việc cho nhân viên nhận. Trước khi kích hoạt nên kiểm tra lại hạng mục và file Word.' },
      { tip: '**Hoa hồng Sale** = tỷ lệ đã khoá lúc chốt × tiền **thực thu** của hợp đồng trong tháng (phiếu thu đã hoàn tất, trừ tiền hoàn cho khách). Khách trả làm nhiều đợt thì hoa hồng về theo từng đợt, xem ở **Phiếu lương của tôi**.' },
    ],
  },
  {
    id: 'crm',
    group: 'Kinh doanh & khách hàng',
    title: 'CRM Bán Hàng — màn hình & thao tác',
    audience: 'all',
    permission: 'crm',
    tabs: ['crm'],
    blocks: [
      { p: 'CRM xếp lead theo 4 cột: **Tiếp cận → Báo giá → Đàm phán → Chốt**. Bốn ô trên cùng cho biết tổng lead, số đang tư vấn / báo giá, số đã chốt và tỉ lệ chốt. Luồng đầy đủ xem mục “Quy trình Sale: từ mã QR tới hợp đồng”.' },
      { image: { src: '/help/crm-tong-quan.png', caption: 'Màn CRM của Giám đốc. Sale chỉ thấy lead của mình và lead chưa có người nhận.' } },
      {
        list: [
          '**Tạo Lead Mới** [1] — thêm khách gọi điện / nhắn tin trực tiếp (không qua form).',
          '**Nhận lead này** [2] — giữ lead chưa có người phụ trách.',
          'Ô **Chuyển** [3] trên mỗi thẻ — đổi cột (hoặc kéo thả thẻ). Chuyển sang **Chốt** mở hộp chốt deal.',
          '**Mã QR Form** [4] và **Copy Link Form Zalo** [5] — lấy mã QR / đường dẫn form để Sale gửi khách qua Zalo. **Xem Form** mở thử trang khách thấy.',
          '**Bộ lọc** theo nguồn khách và sale phụ trách; **Thiết lập CRM** (Giám đốc) chỉnh hoa hồng và giới hạn tải.',
        ],
      },
      { image: { src: '/help/crm-tao-lead.png', caption: 'Hộp Tạo Khách Hàng (Lead) Mới.' } },
      {
        steps: [
          'Nhập **Tên khách hàng** [1] và **Số điện thoại Zalo** [2] (bắt buộc).',
          'Chọn **Nguồn khách hàng** [3]: Zalo cá nhân, Hotline công ty, Khách giới thiệu…',
          'Ghi **nhu cầu / vị trí đất / quy mô** [4] theo dạng “Dịch vụ: Đo hiện trạng | Vị trí: Quận 7 | Quy mô: 120m2” — phần “Dịch vụ:” được dùng để chọn hạng mục khi chốt.',
          'Bấm **Tạo Mới & Đưa vào Pipeline** [5]. Thẻ mới xuất hiện ở cột Tiếp cận.',
        ],
      },
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

  // ───────────────────────── Hợp đồng & hồ sơ ─────────────────────────
  {
    id: 'hop-dong',
    group: 'Hợp đồng & hồ sơ',
    title: 'Hợp Đồng — soạn, theo dõi, huỷ',
    audience: 'management',
    permission: 'contract',
    tabs: ['contracts'],
    blocks: [
      { image: { src: '/help/hop-dong-danh-sach.png', caption: 'Danh sách hợp đồng. Dòng viền đỏ là hợp đồng còn nợ.' } },
      {
        list: [
          'Nút **+** [1] — **Soạn hợp đồng mới**.',
          'Ô tìm kiếm [2] — theo mã hợp đồng, khách hàng, địa điểm; bên cạnh có lọc ngày ký, sắp xếp và **Bộ lọc**.',
          'Bấm một dòng [3] để xem chi tiết ở khung bên phải: khách, ngày ký, giá trị, gói & hạng mục, **Xem hợp đồng** (bản Word) và **Tủ hồ sơ**.',
          '**Quy trình** [4] — mở sơ đồ các bước công việc của hợp đồng (xem mục “Quy trình công việc của hợp đồng”).',
          '**Hủy hợp đồng** [5] — khi khách dừng dự án (xem bảng cuối mục).',
        ],
      },
      { p: '**Soạn hợp đồng mới** — form chia 3 phần:' },
      { image: { src: '/help/hop-dong-soan-1.png', caption: 'Phần 1: khách hàng, hồ sơ khách gửi, địa chỉ, dịch vụ.' } },
      {
        steps: [
          'Chọn **Cá nhân** hoặc **Doanh nghiệp**, nhập **tên khách** [1], số điện thoại, CCCD. Khách cũ được **tự điền** thông tin.',
          'Bấm **Tài liệu khách gửi** [2] để tải ảnh / PDF / tệp Office nhận qua Zalo — bước K01 sẽ phân loại sau.',
          'Chọn **Tỉnh / Thành phố** [3] rồi **Phường / Xã** từ danh sách; số nhà, đường không bắt buộc.',
          'Chọn **Gói dịch vụ** [4] và **Hạng mục**.',
        ],
      },
      { image: { src: '/help/hop-dong-soan-2.png', caption: 'Phần 2: giấy tờ cần thu, Sale, mẫu hợp đồng, giá trị.' } },
      {
        steps: [
          'Chọn cách thu **Giấy tờ của khách** [5]: **Dùng bộ mặc định** theo hạng mục, **Chọn thủ công** từng loại, hoặc **Không yêu cầu giấy tờ**. Hệ thống không chọn sẵn — bắt buộc phải chọn.',
          'Nhập **Giá trị hợp đồng** [6] — gõ tắt được `18.5tr`, `500k`, hoặc bấm +1 / +5 / +10 triệu; số tiền bằng chữ hiện ngay bên dưới để đối chiếu.',
        ],
      },
      { image: { src: '/help/hop-dong-soan-3.png', caption: 'Phần 3: độ ưu tiên, thời hạn và lưu.' } },
      {
        steps: [
          'Chọn **Độ ưu tiên hồ sơ** [7]: Bình thường, Ưu tiên cao (x1,2) hoặc Gấp (x1,5) và ghi lý do ưu tiên.',
          'Đặt **Ngày ký** và **Hạn hoàn thành** [8] — ô bên phải tự tính số ngày.',
          'Góc dưới trái báo **còn thiếu bao nhiêu trường bắt buộc**. Đủ rồi thì bấm **Lưu hợp đồng** [9].',
        ],
      },
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
    id: 'mau-hop-dong',
    group: 'Hợp đồng & hồ sơ',
    title: 'Mẫu hợp đồng — tải lên, xem trước, ban hành',
    audience: 'management',
    permission: 'contract',
    tabs: ['contracts'],
    blocks: [
      { p: 'Màn **Mẫu hợp đồng** là nơi Giám đốc quản lý các tệp Word mẫu dùng khi sinh hợp đồng. Mỗi mã mẫu có nhiều phiên bản; chỉ phiên bản **Đang ban hành** được dùng cho hợp đồng mới.' },
      {
        steps: [
          'Mở phân hệ **Hợp Đồng** rồi chọn tab **Mẫu hợp đồng**.',
          'Bấm **Thêm mẫu mới**, nhập **Mã mẫu**, tên, mô tả và chọn tệp Word `.docx` (tối đa 20 MiB). Có thể bỏ chọn **Ban hành ngay sau khi tải lên** để lưu bản nháp trước.',
          'Sau khi tải xong, kiểm tra cột **Tải lên** là **Sẵn sàng**. Bấm biểu tượng **Xem trước** để đọc nội dung Word ngay trong cửa sổ xem trước; bấm biểu tượng tải xuống nếu cần lưu tệp về máy.',
          'Dùng **Tra cứu placeholder** để xem các ký hiệu `{{...}}` có thể đặt trong DOCX. Placeholder trong đoạn văn và bảng được thay tự động khi sinh hợp đồng.',
        ],
      },
      { p: '**Tạo phiên bản mới** — ở đầu mỗi nhóm mẫu, bấm **Nâng cấp từ vN** (hoặc nút + trong dòng phiên bản), chọn tệp DOCX mới rồi tải lên. Tên và mã mẫu được kế thừa nếu để trống.' },
      {
        table: {
          head: ['Nút / trạng thái', 'Cách dùng'],
          rows: [
            ['**Ban hành**', 'Đưa bản DOCX sẵn sàng thành phiên bản dùng cho hợp đồng mới.'],
            ['**Lưu trữ**', 'Ngừng dùng phiên bản đang ban hành; tệp và lịch sử vẫn được giữ lại. Hệ thống không cho lưu trữ phiên bản ban hành cuối cùng.'],
            ['**Tải lên thất bại**', 'Bấm **Thử tải lại cùng tệp** và chọn lại đúng tệp DOCX. Bản lỗi vẫn giữ mã phiên bản để đối soát.'],
            ['**Bản nháp**', 'Chưa được dùng cho hợp đồng mới cho tới khi bấm **Ban hành**.'],
          ],
        },
      },
      { tip: 'Có thể lọc theo trạng thái hoặc tìm theo mã / tên mẫu. Nên xem trước và kiểm tra placeholder trước khi ban hành phiên bản mới.' },
      { warn: 'Header, Footer và Textbox hiện chưa được thay placeholder tự động. Không lưu thông tin khách hàng thật trong tệp mẫu dùng để kiểm thử.' },
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
      { p: 'Bảng trên là các bước của **mẫu chuẩn**. Quy trình không bị bó vào K01–K07: có thể thêm bước tự do (N01, N02…), đặt tên, nối nhánh tuỳ ý — việc bước tự động làm gì do **năng lực** quyết định (xem mục “Năng lực bước”).' },
      { p: 'Bấm một node để mở bảng bên phải với 3 tab:' },
      {
        list: [
          '**Node** — tên bước, thời hạn xử lý, **danh sách checklist**, tài liệu đầu ra, gói khoán (**Gắn gói khoán**) và người duyệt.',
          '**Phân công** — giao thẳng cho nhân viên, hoặc để **Bể việc** cho phòng ban nhận; có thể kích hoạt trước, phân công sau.',
          '**Năng lực** — loại việc của bước (đo, CAD, pháp lý, nộp một cửa, bàn giao…); mỗi năng lực tự tạo hồ sơ / mở cổng riêng (xem mục “Năng lực bước”).',
        ],
      },
      { p: '**Duyệt nghiệm thu**: khi nhân viên nộp, node hiện “chờ Giám đốc duyệt”. Xem minh chứng → **Duyệt đạt** hoặc **Từ chối** (ghi lý do). Node có rẽ nhánh thì chọn **Kết quả xử lý** để đi đúng nhánh, ví dụ **Cần làm lại**.' },
      { warn: 'Node đã bắt đầu thì danh sách nghiệm thu bị khoá; bản sửa chỉ được đổi đường chuyển bước hoặc thêm node mới, và chỉ có hiệu lực sau khi Giám đốc bấm **Áp dụng sửa đổi**.' },
      { p: 'Phát hiện lỗi ở một bước đã nghiệm thu? Xem mục **Quay ngược bước** — nhân viên xin, Giám đốc duyệt, hệ thống kéo các bước liên quan về làm lại.' },
      { p: '**Huỷ phiên vận hành** là thao tác kết thúc vĩnh viễn: node đang mở bị huỷ, node đã hoàn tất và khoán đã nghiệm thu được giữ; phải chọn nhóm lý do và nhập lý do chi tiết.' },
    ],
  },
  {
    id: 'quay-lai-buoc',
    group: 'Hợp đồng & hồ sơ',
    title: 'Quay ngược bước (trả hồ sơ về bước trước)',
    audience: 'all',
    blocks: [
      { p: 'Dùng khi phát hiện lỗi của một bước **đã nghiệm thu xong** — ví dụ chuyên viên pháp lý đang nộp một cửa (K05b) thì cơ quan trả hồ sơ vì **bản vẽ sai ranh**, phải kéo bước vẽ CAD (K03) về sửa.' },
      { warn: 'Nguyên tắc: **không ai tự lùi bước được**. Nhân viên chỉ **gửi phiếu xin quay lại**; phiếu chưa thay đổi gì cho tới khi **Giám đốc duyệt**. Mỗi hạng mục chỉ có **một phiếu chờ duyệt** tại một thời điểm.' },

      { p: '**Phía nhân viên — gửi phiếu xin quay lại**' },
      { image: { src: '/help/quay-lai-1-tam-dung.png', caption: 'Bước đang làm (K05b) — dải Tạm dừng.' } },
      { image: { src: '/help/quay-lai-2-ly-do.png', caption: 'Chọn lý do “Chờ đo vẽ sửa”.' } },
      { image: { src: '/help/quay-lai-3-chon-buoc.png', caption: 'Chọn bước cần quay về và xem trước các bước bị ảnh hưởng.' } },
      {
        steps: [
          'Ở bước đang làm, bấm **Tạm dừng** [1] (có ở các bước được phép tạm dừng, thường là bước nộp / theo dõi hồ sơ cơ quan).',
          'Chọn lý do **Chờ đo vẽ sửa** [2], ghi **đang chờ gì** [3] rồi bấm **Tiếp tục chọn bước** [4].',
          'Chọn **bước cần quay về** [5] — chỉ chọn được các bước **đã chạy** trước bước hiện tại. Khung bên trái cho biết người phụ trách, trạng thái và **gửi đi sẽ kéo bao nhiêu bước** về trạng thái cần sửa; các bước bị kéo theo gắn nhãn **sẽ phải làm lại** [6].',
          'Ghi rõ **lý do cho Giám đốc** [7] (tối thiểu 5 ký tự: sai ở đâu, cơ quan yêu cầu gì) → **Gửi yêu cầu** [8].',
        ],
      },
      { tip: 'Hai lý do tạm dừng còn lại — **Chờ cơ quan** và **Chờ nội bộ** — chỉ dừng đồng hồ của bước hiện tại (không bị tính trễ vì việc ngoài tầm tay), **không** quay ngược bước nào.' },

      { p: '**Phía Giám đốc — duyệt trong Hàng Chờ Duyệt**' },
      { image: { src: '/help/quay-lai-4-duyet.png', caption: 'Phiếu xin quay lại trong Hàng Chờ Duyệt.' } },
      {
        list: [
          'Phiếu ghi rõ hợp đồng, khách, người gửi, **bước đích và số bước bị ảnh hưởng** [1] cùng **lý do** [2].',
          '**Từ chối** [3] — bắt buộc ghi lý do để nhân viên biết; quy trình giữ nguyên.',
          '**Duyệt & trả về K…** [4] — hệ thống thực hiện quay ngược ngay (bảng dưới). Người gửi nhận thông báo kết quả.',
        ],
      },

      { p: '**Hệ thống làm gì khi Giám đốc duyệt** (ví dụ quay về K03 từ K05b):' },
      {
        table: {
          head: ['Nhóm bước', 'Ví dụ', 'Sau khi duyệt'],
          rows: [
            ['Các bước **trước** bước đích', 'K01, K02', 'Giữ nguyên “Đã nghiệm thu” — buổi đo hiện trường không phải làm lại'],
            ['**Bước đích**', 'K03', 'Chuyển **Cần sửa**; có **hạn sửa** riêng = nửa thời hạn chuẩn của bước, tối đa **24 giờ**'],
            ['Các bước **sau** bước đích', 'K04, K05b', 'Chuyển **Chờ tới lượt** — không ai nộp được trước khi bước đích sửa xong, rồi chạy lại lần lượt'],
          ],
        },
      },
      {
        list: [
          'Checklist của các bước bị kéo về trở lại **chưa nộp**; các tờ đã duyệt phải **duyệt lại**. **File cũ không bị xoá** — vẫn xem được để biết phải sửa gì.',
          'Lượt nghiệm thu đang chờ duyệt của các bước đó bị huỷ.',
          'Dữ liệu đặc thù được đặt lại: biên nhận một cửa “Hoàn thành” quay về “Đang chi nhánh”, hồ sơ pháp lý đã đóng được mở lại, thợ đo có thể **Bắt đầu đo** ca mới, bước bàn giao phải kiểm tra lại cổng công nợ.',
          '**Hạn của cả chuỗi được tính lại** từ đầu.',
          'Mọi người đang giữ các bước bị trả về nhận thông báo **“Hồ sơ bị trả về, cần làm lại”** kèm lý do — kể cả phòng khác.',
        ],
      },
      { warn: '**Tiền khoán**: khoán đã phát cho các bước bị kéo về **không bị thu hồi** (việc đã làm thật). Nhưng người làm lại phần việc **của chính mình** thì **không được trả khoán thêm lần nữa**.' },
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
      { p: 'Mọi phiếu cần chữ ký Giám đốc gom về một chỗ để không phiếu nào bị treo: **Xin quay lại bước** (xem mục “Quay ngược bước”) và đề xuất **loại tài liệu phát sinh** của nhân viên.' },
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
          'Thêm node, nối các node, bấm một node để sửa checklist, người duyệt, phòng ban nhận việc, thời hạn và **năng lực bước** (xem mục “Năng lực bước”).',
          'Checklist có tiền khoán: **Gắn gói khoán** → chọn công việc; mục **Lương khoán** hiện định mức cho thợ **Chính** và thợ **Phụ** (có dòng Phụ nghĩa là tự mở suất thợ phụ).',
          '**Nhân bản** mẫu trong cùng combo, hoặc **⚡ Nhân bản sang Combo** khác chỉ trong một lần bấm (có thể đặt làm mặc định cho combo đích).',
        ],
      },
      { p: '**2. Danh mục mẫu giấy tờ (Document Register)** — mỗi hạng mục cần những loại giấy nào: nguồn phát sinh (khách cung cấp, công ty soạn, cơ quan trả), bắt buộc hay tuỳ chọn, bản gốc hay bản sao. Bấm **Thêm loại giấy** để bổ sung; quản lý luôn **cây Gói và Hạng mục** và **danh mục nơi lưu bản cứng**.' },
      { warn: 'Hệ thống cảnh báo khi có loại giấy tờ bắt buộc chưa được gán vào bước nào, hoặc bước chưa gắn gói khoán (nhân viên làm bước đó sẽ không nhận khoán). Kiểm tra kỹ trước khi lưu.' },
    ],
  },
  {
    id: 'nang-luc-buoc',
    group: 'Điều hành (Giám đốc)',
    title: 'Năng lực bước — mỗi bước tự động làm gì',
    audience: 'management',
    directorOnly: true,
    blocks: [
      { p: '**Năng lực** là “loại việc” của một bước trong quy trình. Chọn đúng năng lực thì khi quy trình chạy tới bước đó, hệ thống **tự tạo hồ sơ, tự mở đúng công cụ và tự chặn / mở cổng** cho nhân viên — không cần ai nhớ làm tay.' },
      { tip: 'Bước (node) là **tự do**: đặt tên, mã, thứ tự, nối nhánh tuỳ ý. Bấm **Thêm node** trên thanh công cụ sẽ tạo “Bước mới” (mã N01, N02…) với năng lực mặc định **Tác nghiệp tiêu chuẩn**. Bước tự động làm gì **chỉ phụ thuộc năng lực bạn chọn** — mã K01…K07 trong mẫu chuẩn chỉ là nhãn.' },

      { p: '**Đường vào**' },
      { image: { src: '/help/nang-luc-duong-vao.png', caption: 'Mở năng lực của một bước trong quy trình mẫu.' } },
      {
        steps: [
          'Bấm **Quy Trình & Mẫu Giấy** [1] ở thanh điều hướng → tab **Sơ đồ quy trình mẫu (Workflow Studio)** [2].',
          'Chọn gói, hạng mục và **mẫu quy trình** [3] cần sửa.',
          'Bấm vào **bước (node)** [4] trên sơ đồ — bảng thuộc tính mở bên phải. Chưa có bước phù hợp thì bấm **Thêm node** để tạo bước mới rồi đặt tên.',
          'Ở tab Node, dòng **Năng lực bước** cho biết năng lực hiện tại; bấm **Đổi năng lực →** [5] hoặc bấm thẳng tab **Năng lực** [6].',
        ],
      },
      { image: { src: '/help/nang-luc-chon.png', caption: 'Chọn một trong 7 năng lực; tên năng lực hiện ngay trên thẻ bước.' } },
      {
        steps: [
          'Bấm chọn một thẻ năng lực [1] — thẻ đang chọn có viền cam. Tên năng lực hiện luôn trên thẻ bước ở sơ đồ [2] để nhìn cả quy trình là biết bước nào làm gì.',
          'Hệ thống **tự gợi ý phòng ban nhận việc** theo năng lực (đổi được ở tab **Phân công**).',
          'Bấm **Lưu mẫu**. Hợp đồng **kích hoạt sau đó** sẽ chạy theo năng lực mới.',
        ],
      },
      { tip: 'Sửa riêng cho một hợp đồng: **Hợp Đồng** → chọn hợp đồng → **Quy trình** → bấm bước → tab **Năng lực** (cùng lưới 7 thẻ).' },

      { p: '**7 năng lực và những gì hệ thống tự làm**' },
      {
        table: {
          head: ['Năng lực', 'Ví dụ trong mẫu chuẩn', 'Bể việc', 'Hệ thống tự động'],
          rows: [
            ['**Tác nghiệp tiêu chuẩn**', 'Tiếp nhận, Lưu trữ, việc văn phòng', 'Gợi ý phòng Sale/CSKH · 1 người làm chính', 'Không tạo gì thêm: nhân viên làm checklist, nộp minh chứng, Giám đốc duyệt'],
            ['**Khảo sát & Đo thực địa**', 'Đo hiện trường, cắm mốc', 'Phòng Đo vẽ · **Thợ chính + Thợ phụ**', '• Khi bước tới lượt: **tự tạo Sổ Đo Đạc** (1 dòng trong **Hồ Sơ Đo Vẽ** cho cả hạng mục).\n• Hiện nút **Bắt đầu đo hiện trường**: ghi giờ xuất phát đo và **đóng suất thợ phụ** (ai chưa nhận phụ thì không nhận được nữa).'],
            ['**Biên tập bản vẽ CAD**', 'Vẽ CAD, chuẩn hoá tài liệu kỹ thuật', 'Phòng Đo vẽ · 1 người', 'Không tạo hồ sơ riêng — giống Tác nghiệp tiêu chuẩn, chỉ khác:\n• Luôn vào Bể việc **phòng Đo vẽ**.\n• File nộp xếp vào ngăn **Chuẩn hoá kỹ thuật** của tủ hồ sơ; Timeline xếp vào nhóm Đo vẽ.'],
            ['**Soạn thảo hồ sơ pháp lý**', 'Soạn bộ hồ sơ, rà quy hoạch', 'Phòng Pháp lý · 1 người', '• Khi bước tới lượt: **tự mở Hồ sơ pháp lý** (sổ Một cửa) cho hạng mục, hiện trong **Hồ Sơ Pháp Lý**.'],
            ['**Nộp hồ sơ & nhập biên nhận**', 'Nộp hồ sơ chỉ cần giữ biên nhận', 'Phòng Pháp lý · Người nộp', '• Tạo **ô biên nhận** để lưu số biên nhận + ảnh bằng chứng đã nộp.\n• **Không theo dõi** kết quả cơ quan: đủ checklist là xong bước.\n• Cho phép **Tạm dừng** (chờ cơ quan).'],
            ['**Theo dõi hồ sơ Một cửa**', 'Nộp một cửa & chờ kết quả', 'Phòng Pháp lý · Người nộp', '• Gắn vào Hồ sơ pháp lý đã mở ở bước Soạn thảo; hiện **bảng theo dõi cơ quan** (số biên nhận, cơ quan, tình trạng, ngày hẹn trả, tra cứu Cổng DVC).\n• **Bước chỉ hoàn tất khi** có số biên nhận **và** cơ quan trả “Hoàn thành” **và** hồ sơ đã đóng.\n• Cho phép **Tạm dừng** và xin **quay ngược bước**.'],
            ['**Bàn giao & Quyết toán**', 'Bàn giao kết quả cho khách', 'Gợi ý phòng Sale/CSKH · 1 người', '• Bật **cổng kiểm soát công nợ**: bước **khoá** tới khi khách **trả đủ 100%** hoặc **Giám đốc duyệt nợ**.\n• Nhân viên nhập tiền khách trả (kèm ảnh bill) hoặc **Xin duyệt nợ** ngay trong bước.'],
          ],
        },
      },
      { warn: '**Theo dõi hồ sơ Một cửa** chỉ tạo hồ sơ theo dõi cho hạng mục thuộc gói **Pháp Lý** hoặc **Xin Phép Xây Dựng**, và cần có một bước **Soạn thảo hồ sơ pháp lý** đứng trước để mở Hồ sơ pháp lý. Thiếu bước đó thì bước theo dõi không có hồ sơ để gắn. Hạng mục gói Đo Vẽ cần nộp hồ sơ thì dùng **Nộp hồ sơ & nhập biên nhận**.' },
      {
        list: [
          'Mỗi hạng mục chỉ có **một** Sổ Đo Đạc và **một** Hồ sơ pháp lý — lỡ gắn năng lực ở nhiều bước cũng không sinh hồ sơ trùng.',
          'Khi Giám đốc duyệt **quay ngược bước**, dữ liệu của năng lực cũng được đặt lại: thợ đo bấm đo ca mới được, hồ sơ pháp lý mở lại, biên nhận “Hoàn thành” quay về đang theo dõi, cổng bàn giao kiểm tra lại (xem mục “Quay ngược bước”).',
          'Phòng ban: bước năng lực **Đo thực địa / CAD** luôn vào Bể việc phòng Đo vẽ; bước năng lực **Soạn thảo pháp lý / Nộp hồ sơ / Theo dõi Một cửa** luôn vào Bể việc phòng Pháp lý, bất kể chọn phòng nào ở tab Phân công. Hai năng lực còn lại theo đúng phòng bạn chọn.',
        ],
      },
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
          '**Model Chatbot** để trống là dùng mặc định. Khi Google ngừng một model, bấm **Tải danh sách model**, chọn model mới trong ô rồi **Lưu nhóm này**. Nếu Google có gợi ý model thay thế, trợ lý tự chuyển sang model đó.',
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
      { p: '**Trợ lý AI trả lời “vượt quá khả năng”?** Câu hỏi không có trong tài liệu AI đã học. Ở màn Wiki, dưới tên mỗi tài liệu có dòng **AI đã học (N đoạn)** hoặc **AI chưa học được: lý do** — tài liệu lỗi thì sửa theo lý do (vd. PDF scan cần bản có lớp chữ) rồi bấm **Học lại**.' },
      { p: '**Quên mật khẩu?** Bấm **Quên mật khẩu?** ở màn đăng nhập để nhận mã OTP qua email (xem mục “Tài khoản & mật khẩu”).' },
      { p: '**Số liệu chưa cập nhật?** Bấm nút **Làm mới** trên thanh trên cùng.' },
      { p: '**Thông báo lỗi khó hiểu?** Chụp màn hình kèm thời điểm, gửi cho quản trị hệ thống.' },
    ],
  },
]
