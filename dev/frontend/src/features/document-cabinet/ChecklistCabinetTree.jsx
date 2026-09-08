import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, FileCheck2, FolderOpen, Search, X } from 'lucide-react'

import './checklistCabinetTree.css'

const groupKey = group => group.task_node_id || group.node_code
const typeKey = type => type.document_type_id || type.id || `${type.checklist_result_id}:${type.template_id}`

export default function ChecklistCabinetTree({ groups = [], currentNodeCode, onOpenFile }) {
  const firstOpenNode = useMemo(
    () => groups.find(group => group.node_code === currentNodeCode) || null,
    [currentNodeCode, groups],
  )
  const [openNodes, setOpenNodes] = useState(() => new Set(firstOpenNode ? [groupKey(firstOpenNode)] : []))
  const [openTypes, setOpenTypes] = useState(new Set())
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!firstOpenNode) return
    setOpenNodes(current => new Set([...current, groupKey(firstOpenNode)]))
  }, [firstOpenNode])

  const toggle = (setter, key) => setter(current => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const normalizedQuery = query.trim().toLowerCase()

  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return groups
    return groups.map(group => {
      const nodeMatch = (group.node_code || '').toLowerCase().includes(normalizedQuery)
        || (group.node_name || '').toLowerCase().includes(normalizedQuery)
      const matchingDocs = (group.documents || []).filter(doc => {
        if (nodeMatch) return true
        const docNameMatch = (doc.name || '').toLowerCase().includes(normalizedQuery)
        const sourceMatch = (doc.source_label || '').toLowerCase().includes(normalizedQuery)
        const fileMatch = (doc.files || []).some(f => (f.file_name || f.name || '').toLowerCase().includes(normalizedQuery))
        return docNameMatch || sourceMatch || fileMatch
      })
      if (nodeMatch || matchingDocs.length > 0) {
        return {
          ...group,
          documents: matchingDocs,
        }
      }
      return null
    }).filter(Boolean)
  }, [groups, normalizedQuery])

  // Tự động mở các Node & loại giấy khi người dùng tìm kiếm
  useEffect(() => {
    if (!normalizedQuery) return
    const matchedNodeKeys = new Set(filteredGroups.map(groupKey))
    const matchedTypeKeys = new Set()
    filteredGroups.forEach(g => {
      (g.documents || []).forEach(d => {
        if (Number(d.file_count ?? d.files?.length) > 0) {
          matchedTypeKeys.add(typeKey(d))
        }
      })
    })
    setOpenNodes(matchedNodeKeys)
    setOpenTypes(matchedTypeKeys)
  }, [normalizedQuery, filteredGroups])

  const expandAll = () => {
    setOpenNodes(new Set(groups.map(groupKey)))
    const allTypes = new Set()
    groups.forEach(g => {
      (g.documents || []).forEach(d => {
        if (Number(d.file_count ?? d.files?.length) > 0) {
          allTypes.add(typeKey(d))
        }
      })
    })
    setOpenTypes(allTypes)
  }

  const collapseAll = () => {
    setOpenNodes(new Set())
    setOpenTypes(new Set())
  }

  if (!groups.length) {
    return <p className="cab-tree__empty">Hạng mục này chưa có loại giấy nào được phân vào checklist.</p>
  }

  const total = groups.reduce((sum, group) => sum + Number(group.total || group.documents?.length || 0), 0)
  const done = groups.reduce((sum, group) => sum + Number(group.done || 0), 0)

  return <section className="cab-tree" aria-label="Tủ hồ sơ theo Node">
    <div className="cab-tree__header-bar">
      <p className="cab-tree__summary"><FolderOpen size={16} /> {done}/{total} loại giấy đã có file đạt</p>
      <div className="cab-tree__actions">
        <button
          type="button"
          className="cab-tree__action-btn"
          onClick={expandAll}
          title="Mở tất cả các bước và loại giấy"
        >
          Mở tất cả
        </button>
        <span className="cab-tree__action-dot">·</span>
        <button
          type="button"
          className="cab-tree__action-btn"
          onClick={collapseAll}
          title="Thu gọn tất cả các bước"
        >
          Thu gọn
        </button>
      </div>
    </div>

    <div className="cab-tree__search-box">
      <Search size={14} className="cab-tree__search-icon" aria-hidden="true" />
      <input
        type="search"
        className="cab-tree__search-input"
        placeholder="Tìm nhanh loại giấy hoặc file..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        aria-label="Tìm kiếm trong tủ hồ sơ"
      />
      {query && (
        <button
          type="button"
          className="cab-tree__search-clear"
          onClick={() => setQuery('')}
          aria-label="Xóa tìm kiếm"
        >
          <X size={13} />
        </button>
      )}
    </div>

    {filteredGroups.length === 0 ? (
      <p className="cab-tree__empty">Không tìm thấy loại giấy hoặc file nào khớp với &ldquo;{query}&rdquo;.</p>
    ) : (
      filteredGroups.map(group => {
        const nodeId = groupKey(group)
        const nodeOpen = openNodes.has(nodeId)
        return <article className={`cab-tree__node${group.node_code === currentNodeCode ? ' is-current' : ''}`} key={nodeId}>
          <button
            type="button"
            className="cab-tree__node-button"
            aria-expanded={nodeOpen}
            onClick={() => toggle(setOpenNodes, nodeId)}
          >
            <b>{group.node_code || 'Chưa gán Node'}</b>
            <span>{group.node_name || 'Loại giấy chưa gán Node'}</span>
            <em>{Number(group.done || 0)}/{Number(group.total || group.documents?.length || 0)}</em>
            <ChevronDown size={15} className={nodeOpen ? 'is-open' : ''} />
          </button>

          {nodeOpen && <ul className="cab-tree__types">
            {(group.documents || []).map(type => {
              const id = typeKey(type)
              const files = type.files || []
              const count = Number(type.file_count ?? files.length)
              const typeOpen = count > 0 && openTypes.has(id)
              return <li className={`cab-tree__type${count > 0 ? ' has-files' : ''}`} key={id}>
                <button
                  type="button"
                  className="cab-tree__type-button"
                  aria-expanded={count > 0 ? typeOpen : undefined}
                  onClick={() => count > 0 && toggle(setOpenTypes, id)}
                >
                  <span className="cab-tree__type-name">{type.name}</span>
                  {type.source_label && (
                    <small className={`is-${String(type.source || '').toLowerCase()}`}>
                      {type.source_label}
                    </small>
                  )}
                  <span className="cab-tree__badge" aria-label={`${count} file đã duyệt`}>{count}</span>
                  {count > 0 && <ChevronDown size={14} className={typeOpen ? 'is-open' : ''} />}
                </button>
                {typeOpen && <ul className="cab-tree__files">
                  {files.map(file => <li key={file.id || file.document_id}>
                    <button type="button" onClick={() => onOpenFile?.(file)}>
                      <FileCheck2 size={14} /> <span>{file.file_name || file.name || 'Tài liệu'}</span>
                    </button>
                  </li>)}
                </ul>}
              </li>
            })}
          </ul>}
        </article>
      })
    )}
  </section>
}
