import { useCallback, useEffect, useState } from 'react'
import { ShieldAlert, ShieldCheck } from 'lucide-react'

import { apiFetch } from '../../lib/api'
import { loiHienThi } from '../../lib/schemaV2'

/**
 * Danh sách giấy tờ được bỏ qua, đặt ngay trong panel duyệt nghiệm thu K01.
 */
export default function WaivedDocuments({ serviceLineId, onLoaded }) {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')

  const loadStatus = useCallback(async () => {
    if (!serviceLineId) return
    try {
      const res = await apiFetch(
        `/api/document-register/service-lines/${encodeURIComponent(serviceLineId)}/k01-status`,
      )
      setStatus(res?.data || null)
      setError('')
      onLoaded?.(res?.data || null)
    } catch (err) {
      setError(loiHienThi(err, 'Không đọc được tình trạng giấy tờ đầu vào.'))
    }
  }, [serviceLineId, onLoaded])

  useEffect(() => { loadStatus() }, [loadStatus])

  if (error) return <p className="wf-mien__loi" role="alert">{error}</p>
  if (!status) return null

  const pendingWaivers = status.waiver_pending || []
  const waivedList = status.waived || []
  if (!pendingWaivers.length && !waivedList.length) return null

  return (
    <div className="wf-mien">
      {pendingWaivers.length > 0 && (
        <div className="wf-mien__khoi wf-mien__khoi--cho">
          <div className="wf-mien__dau">
            <ShieldAlert size={14} />
            Nhân viên xin bỏ {pendingWaivers.length} loại giấy — bạn quyết ở đây
          </div>
          <ul className="wf-mien__ds">
            {pendingWaivers.map(name => <li key={name}>{name}</li>)}
          </ul>
          <p className="wf-mien__giai-thich">
            Duyệt đạt là đồng ý bỏ những giấy này. Trả lại là bắt lấy bằng được —
            lý do bạn ghi sẽ là câu nhân viên mang đi gọi khách.
          </p>
        </div>
      )}

      {waivedList.length > 0 && (
        <div className="wf-mien__khoi wf-mien__khoi--xong">
          <div className="wf-mien__dau">
            <ShieldCheck size={14} /> Đã miễn trước đó · {waivedList.length} loại
          </div>
          <ul className="wf-mien__ds">
            {waivedList.map(name => <li key={name}>{name}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

export { WaivedDocuments as GiayDuocMien }
