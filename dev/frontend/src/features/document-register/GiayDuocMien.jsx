import { useCallback, useEffect, useState } from 'react'
import { ShieldAlert, ShieldCheck } from 'lucide-react'

import { apiFetch } from '../../lib/api'
import { loiHienThi } from '../../lib/schemaV2'

/**
 * Danh sách giấy tờ được bỏ qua, đặt ngay trong panel duyệt nghiệm thu K01.
 *
 * Không có khối này thì Giám đốc bấm "Duyệt đạt" mà không biết hồ sơ đang đi
 * tiếp trong tình trạng thiếu giấy — và phiếu xin miễn trở thành cửa sau bỏ
 * giấy im lặng. Cả luồng một cổng chỉ đứng vững khi người quyết NHÌN THẤY
 * mình đang cho qua cái gì.
 */
export default function GiayDuocMien({ serviceLineId, onLoaded }) {
  const [trangThai, setTrangThai] = useState(null)
  const [loi, setLoi] = useState('')

  const nap = useCallback(async () => {
    if (!serviceLineId) return
    try {
      const ket = await apiFetch(
        `/api/document-register/service-lines/${encodeURIComponent(serviceLineId)}/k01-status`,
      )
      setTrangThai(ket?.data || null)
      setLoi('')
      onLoaded?.(ket?.data || null)
    } catch (error) {
      setLoi(loiHienThi(error, 'Không đọc được tình trạng giấy tờ đầu vào.'))
    }
  }, [serviceLineId, onLoaded])

  useEffect(() => { nap() }, [nap])

  if (loi) return <p className="wf-mien__loi" role="alert">{loi}</p>
  if (!trangThai) return null

  const choQuyet = trangThai.waiver_pending || []
  const daMien = trangThai.waived || []
  if (!choQuyet.length && !daMien.length) return null

  return (
    <div className="wf-mien">
      {choQuyet.length > 0 && (
        <div className="wf-mien__khoi wf-mien__khoi--cho">
          <div className="wf-mien__dau">
            <ShieldAlert size={14} />
            Nhân viên xin bỏ {choQuyet.length} loại giấy — bạn quyết ở đây
          </div>
          <ul className="wf-mien__ds">
            {choQuyet.map(ten => <li key={ten}>{ten}</li>)}
          </ul>
          <p className="wf-mien__giai-thich">
            Duyệt đạt là đồng ý bỏ những giấy này. Trả lại là bắt lấy bằng được —
            lý do bạn ghi sẽ là câu nhân viên mang đi gọi khách.
          </p>
        </div>
      )}

      {daMien.length > 0 && (
        <div className="wf-mien__khoi wf-mien__khoi--xong">
          <div className="wf-mien__dau">
            <ShieldCheck size={14} /> Đã miễn trước đó · {daMien.length} loại
          </div>
          <ul className="wf-mien__ds">
            {daMien.map(ten => <li key={ten}>{ten}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
