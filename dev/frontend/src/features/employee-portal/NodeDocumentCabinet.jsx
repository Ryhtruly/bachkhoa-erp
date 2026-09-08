import ChecklistCabinetTree from '../document-cabinet/ChecklistCabinetTree'
import useChecklistCabinet from '../document-cabinet/useChecklistCabinet'

/** Tủ hồ sơ read-only của đúng một Hạng mục hợp đồng. */
export default function NodeDocumentCabinet({
  contractId,
  serviceLineId,
  currentNodeCode,
  onOpenDocument,
}) {
  const { groups, loading, error } = useChecklistCabinet({ contractId, serviceLineId })

  if (loading) return <p className="eiw-cab__msg">Đang mở tủ hồ sơ…</p>
  if (error) return <p className="eiw-cab__msg is-error">{error}</p>
  return (
    <ChecklistCabinetTree
      groups={groups || []}
      currentNodeCode={currentNodeCode}
      onOpenFile={onOpenDocument}
    />
  )
}
