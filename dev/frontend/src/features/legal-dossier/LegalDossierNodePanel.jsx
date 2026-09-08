import { useCallback, useEffect, useState } from 'react'
import { FileClock } from 'lucide-react'
import LegalDossierActions from './LegalDossierActions'
import { apiFetch } from '../../lib/api'
import './legalDossier.css'

/**
 * Khung đặc biệt cho node NỘP CƠ QUAN (K06) khi xem trong sơ đồ quy trình.
 *
 * Node này khác mọi node khác vì nó không đi một chiều: nộp → chờ cơ quan hàng
 * tuần → có thể bị trả → nộp lại nhiều lần → mới đóng được. Vẽ nó như node
 * thường thì nhân viên không có chỗ nào để bấm Tạm dừng hay Đóng hồ sơ.
 *
 * Không có hồ sơ gắn với node này thì không hiện gì — node chưa bắt đầu, hoặc
 * hạng mục không thuộc gói pháp lý.
 */
export default function LegalDossierNodePanel({ taskNodeId, addToast, onChanged, readOnly = false }) {
  const [dossier, setDossier] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!taskNodeId) { setDossier(null); setLoading(false); return }
    setLoading(true)
    try {
      // apiFetch gắn Bearer token; không có hồ sơ (404) hoặc lỗi → throw → panel tự ẩn.
      const res = await apiFetch(`/api/legal-dossiers/by-task-node/${taskNodeId}`)
      setDossier(res?.data || null)
    } catch {
      setDossier(null)
    } finally {
      setLoading(false)
    }
  }, [taskNodeId])

  useEffect(() => { load() }, [load])

  if (loading || !dossier) return null

  return (
    <div className="legal-node-panel">
      <span className="legal-node-panel__title">
        <FileClock size={15} /> Vòng đời hồ sơ nộp cơ quan
      </span>
      <LegalDossierActions
        dossier={dossier}
        addToast={addToast}
        readOnly={readOnly}
        onDone={() => { load(); onChanged?.() }}
      />
    </div>
  )
}
