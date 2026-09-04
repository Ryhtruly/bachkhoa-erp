import { Check, ChevronRight } from 'lucide-react'

/**
 * Dải bước K01 → K07, nối bằng mũi tên, đọc từ trái sang phải.
 *
 * Thay sơ đồ so le hai tầng cũ: xếp so le đọc được chuỗi dài hơn, nhưng người
 * dùng phải tự ghép thứ tự trong đầu — mà thứ tự chính là thông tin quan trọng
 * nhất của dải này.
 *
 * Bước của người khác vẫn hiện đầy đủ để nắm bối cảnh chuỗi, nhưng không bấm
 * vào được.
 */

const DONE = new Set(['accepted', 'completed'])
const RUNNING = new Set(['in_progress', 'ready', 'rework_required', 'submitted'])

export default function NodeChain({ nodes = [], activeNodeId, openableIds, onSelect }) {
  const openable = openableIds instanceof Set ? openableIds : new Set(openableIds || [])

  return (
    <div className="eiw-chain" role="list" aria-label="Các bước của hạng mục">
      {nodes.map((node, index) => {
        const done = DONE.has(node.status)
        const current = node.id === activeNodeId
        const tone = done ? 'done' : current ? 'current' : RUNNING.has(node.status) ? 'open' : 'idle'
        const canOpen = openable.has(node.id)

        return (
          <div className="eiw-chain__cell" role="listitem" key={node.id}>
            <button
              type="button"
              className={`eiw-step is-${tone}`}
              disabled={!canOpen}
              aria-current={current ? 'step' : undefined}
              onClick={() => canOpen && onSelect?.(node.id)}
              title={canOpen ? node.name : `${node.name} — bước của người khác`}
            >
              <span className="eiw-step__code">{node.node_code}</span>
              {done && <Check size={16} className="eiw-step__tick" aria-hidden="true" />}
            </button>
            {index < nodes.length - 1 && (
              <span className="eiw-chain__arrow" aria-hidden="true">
                <ChevronRight size={16} />
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
