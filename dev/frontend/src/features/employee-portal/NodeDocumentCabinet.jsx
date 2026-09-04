import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, FolderOpen } from 'lucide-react'

import { apiFetch } from '../../lib/api'

/**
 * TỦ HỒ SƠ của một Hạng mục — xếp theo BƯỚC.
 *
 * ── Vì sao theo bước, không theo nguồn giấy ─────────────────────────────────
 * Tab Mẫu giấy tờ khai theo cây Gói → Hạng mục → Nguồn → Node → Loại giấy.
 * Docstring của chính màn đó đã ghi vì sao bỏ bảng phẳng: bày cả 31 mẫu cùng lúc
 * thì không trả lời được câu hỏi duy nhất người ta vào đây để hỏi — "hạng mục
 * này cần những tờ gì".
 *
 * Tủ hồ sơ trước đây lặp lại đúng cái sai ấy: bốn tab theo nguồn, tab "công ty
 * soạn" một mình 33 tờ, không nói tờ nào thuộc bước nào.
 *
 * ── Cấu trúc từ master data, trạng thái từ ô giấy ───────────────────────────
 * Máy chủ trộn sẵn: danh sách tờ là của master data, còn "đã có tệp chưa" đọc từ
 * ô giấy. Nhờ vậy ô giấy sinh thừa bởi luật cũ không lọt vào tủ.
 *
 * Nguồn giấy tụt xuống thành nhãn phụ trong từng tờ — nó là thông tin tra cứu,
 * không phải trục để xếp.
 */

const SOURCE_SHORT = {
  KHACH_HANG: 'khách',
  CONG_TY: 'công ty',
  CO_QUAN: 'nhà nước',
}

export default function NodeDocumentCabinet({
  contractId,
  serviceLineId,
  currentNodeCode,
  onOpenDocument,
}) {
  const [groups, setGroups] = useState(null)
  const [error, setError] = useState(null)
  const [openNode, setOpenNode] = useState(currentNodeCode || null)

  useEffect(() => {
    if (!contractId || !serviceLineId) return undefined
    let huy = false
    apiFetch(`/api/document-register/register?contract_id=${encodeURIComponent(contractId)}`
      + `&service_line_id=${encodeURIComponent(serviceLineId)}`)
      .then(res => { if (!huy) setGroups(res?.checklist_cabinet_by_node || []) })
      .catch(err => { if (!huy) setError(err?.message || 'Không mở được tủ hồ sơ') })
    return () => { huy = true }
  }, [contractId, serviceLineId])

  const tong = useMemo(() => (groups || []).reduce((sum, g) => ({
    total: sum.total + g.total,
    done: sum.done + g.done,
  }), { total: 0, done: 0 }), [groups])

  if (error) return <p className="eiw-cab__msg is-error">{error}</p>
  if (groups === null) return <p className="eiw-cab__msg">Đang mở tủ hồ sơ…</p>
  if (groups.length === 0) {
    return (
      <p className="eiw-cab__msg">
        Hạng mục này chưa có loại giấy nào được gắn vào checklist.
      </p>
    )
  }

  return (
    <div className="eiw-cab">
      <p className="eiw-cab__sum">
        <FolderOpen size={16} />
        {tong.done}/{tong.total} loại giấy đã có tệp
      </p>

      {groups.map(group => {
        const ma = group.node_code || 'CHUA_GAN'
        const mo = openNode === ma
        const laBuocNay = group.node_code && group.node_code === currentNodeCode

        return (
          <section className={`eiw-cab__node${laBuocNay ? ' is-current' : ''}`} key={ma}>
            <button
              type="button"
              className="eiw-cab__head"
              aria-expanded={mo}
              onClick={() => setOpenNode(mo ? null : ma)}
            >
              <b>{group.node_code || 'Chưa gán bước'}</b>
              <span>{group.node_name || 'Giấy chưa bước nào nhận'}</span>
              {laBuocNay && <em className="eiw-cab__here">bước này</em>}
              <span className="eiw-cab__count">{group.done}/{group.total}</span>
              <ChevronDown size={15} className={mo ? 'is-open' : ''} />
            </button>

            {mo && (
              <ul className="eiw-cab__list">
                {group.documents.map(doc => (
                  <li
                    className={`eiw-cab__doc${doc.file_count > 0 ? ' is-done' : ''}`}
                    key={doc.template_id}
                  >
                    <span className="eiw-cab__tick" aria-hidden="true">
                      {doc.file_count > 0 ? <Check size={13} /> : null}
                    </span>
                    <span className="eiw-cab__name">
                      {doc.name}
                      {doc.is_required && <b title="Bắt buộc">*</b>}
                    </span>
                    <span className="eiw-cab__src">{SOURCE_SHORT[doc.source] || doc.source}</span>
                    {doc.file_count > 0 && (
                      <button
                        type="button"
                        className="eiw-cab__open"
                        onClick={() => onOpenDocument?.(doc)}
                      >
                        {doc.file_count} tệp
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
