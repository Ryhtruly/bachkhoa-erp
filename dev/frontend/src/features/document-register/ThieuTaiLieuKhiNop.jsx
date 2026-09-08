import { AlertTriangle } from 'lucide-react'

/**
 * Danh sách tài liệu còn thiếu ở LẦN NỘP này, hiện trong thẻ duyệt nghiệm thu.
 *
 * Đọc từ `submission_payload.missing` — ảnh chụp lúc nhân viên bấm nộp, không
 * phải tính lại lúc duyệt. Hai thời điểm cách nhau có thể vài ngày, tính lại là
 * Giám đốc quyết trên một tình trạng khác với tình trạng lúc người ta gửi.
 *
 * Không có khối này thì Giám đốc bấm "Duyệt đạt" mà không biết hồ sơ đi tiếp
 * trong tình trạng khuyết giấy — và cả cơ chế lưu vết trở thành vô nghĩa.
 */
export default function ThieuTaiLieuKhiNop({ danhSach = [] }) {
  if (!danhSach.length) return null

  const tong = danhSach.reduce(
    (t, muc) => t + muc.thieu.reduce((a, x) => a + (x.con_thieu || 0), 0),
    0,
  )

  return (
    <div className="ttl">
      <div className="ttl__dau">
        <AlertTriangle size={14} />
        Nhân viên nộp khi còn thiếu <strong>{tong}</strong> bản tài liệu
      </div>
      {danhSach.map(muc => (
        <div className="ttl__nhom" key={muc.checklist_result_id || muc.checklist_name}>
          <div className="ttl__ten">{muc.checklist_name}</div>
          <ul className="ttl__ds">
            {muc.thieu.map(x => (
              <li key={`${muc.checklist_name}:${x.name}`}>
                {x.name}{' '}
                <span className="ttl__so">
                  cần {x.can} · đã có {x.da_co} · thiếu {x.con_thieu}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="ttl__nhac">
        Duyệt đạt là chấp nhận hồ sơ đi tiếp thiếu những giấy này — phải ghi lý do.
      </p>
    </div>
  )
}
