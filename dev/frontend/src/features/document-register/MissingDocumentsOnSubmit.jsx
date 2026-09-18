import { AlertTriangle } from 'lucide-react'

/**
 * Danh sách tài liệu còn thiếu ở LẦN NỘP này, hiện trong thẻ duyệt nghiệm thu.
 */
export default function MissingDocumentsOnSubmit({ items = [], danhSach }) {
  const documentList = items.length ? items : (danhSach || [])
  if (!documentList.length) return null

  const total = documentList.reduce(
    (acc, group) => acc + (group.missing || group.thieu || []).reduce((subAcc, item) => subAcc + (item.remaining || item.con_thieu || 0), 0),
    0,
  )

  return (
    <div className="ttl">
      <div className="ttl__dau">
        <AlertTriangle size={14} />
        Nhân viên nộp khi còn thiếu <strong>{total}</strong> bản tài liệu
      </div>
      {documentList.map(group => (
        <div className="ttl__nhom" key={group.checklist_result_id || group.checklist_name}>
          <div className="ttl__ten">{group.checklist_name}</div>
          <ul className="ttl__ds">
            {(group.missing || group.thieu || []).map(item => (
              <li key={`${group.checklist_name}:${item.name}`}>
                {item.name}{' '}
                <span className="ttl__so">
                  cần {item.required_count ?? item.can} · đã có {item.provided_count ?? item.da_co} · thiếu {item.remaining ?? item.con_thieu}
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

export { MissingDocumentsOnSubmit as ThieuTaiLieuKhiNop }
