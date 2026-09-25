import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Search, X } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import { normalizeVietnamese } from '../../lib/vietnamese';
import { HELP_GROUPS, HELP_SECTIONS } from './helpContent';
import './helpCenter.css';

// Chữ **đậm**, `mã` và [1] — số tròn khớp với số khoanh trên ảnh minh hoạ.
function renderInline(text) {
  return String(text)
    .split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d{1,2}\])/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
      if (/^\[\d{1,2}\]$/.test(part)) {
        return <span className="help-num" key={index} aria-label={`số ${part.slice(1, -1)}`}>{part.slice(1, -1)}</span>;
      }
      return part;
    });
}

function blockText(block) {
  if (block.p) return block.p;
  if (block.tip) return block.tip;
  if (block.warn) return block.warn;
  if (block.steps) return block.steps.join(' ');
  if (block.list) return block.list.join(' ');
  if (block.table) return [...block.table.head, ...block.table.rows.flat()].join(' ');
  if (block.image) return block.image.caption || '';
  return '';
}

const SEARCH_INDEX = new Map(
  HELP_SECTIONS.map((section) => [
    section.id,
    normalizeVietnamese(`${section.title} ${section.blocks.map(blockText).join(' ')}`.replace(/[*`]|\[\d{1,2}\]/g, '')),
  ]),
);

/** Mục người dùng được xem: đúng không gian làm việc + đủ quyền. */
export function isSectionVisible(section, { workspace, permissions = {}, isDirector = false }) {
  if (section.directorOnly && !isDirector) return false;
  if (section.permission && !isDirector && !permissions[section.permission]) return false;
  if (section.audience === 'employee' && workspace !== 'employee' && !isDirector) return false;
  if (section.audience === 'management' && workspace === 'employee') return false;
  return true;
}

function HelpBlock({ block }) {
  if (block.p) return <p>{renderInline(block.p)}</p>;
  if (block.tip) return <div className="help-callout help-callout--tip"><strong>Mẹo</strong><span>{renderInline(block.tip)}</span></div>;
  if (block.warn) return <div className="help-callout help-callout--warn"><strong>Lưu ý</strong><span>{renderInline(block.warn)}</span></div>;
  if (block.steps) {
    return <ol className="help-steps">{block.steps.map((item, index) => <li key={index}>{renderInline(item)}</li>)}</ol>;
  }
  if (block.list) {
    return <ul className="help-list">{block.list.map((item, index) => <li key={index}>{renderInline(item)}</li>)}</ul>;
  }
  if (block.image) {
    return (
      <figure className="help-figure">
        <a href={block.image.src} target="_blank" rel="noreferrer" title="Mở ảnh cỡ lớn">
          <img src={block.image.src} alt={block.image.alt || block.image.caption || ''} loading="lazy" />
        </a>
        {block.image.caption && <figcaption>{renderInline(block.image.caption)}</figcaption>}
      </figure>
    );
  }
  if (block.table) {
    return (
      <div className="help-table-wrap">
        <table className="help-table">
          <thead><tr>{block.table.head.map((cell, index) => <th key={index}>{cell}</th>)}</tr></thead>
          <tbody>
            {block.table.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, index) => (
                  <td key={index}>
                    {String(cell).split('\n').map((line, lineIndex) => (
                      <React.Fragment key={lineIndex}>{lineIndex > 0 && <br />}{renderInline(line)}</React.Fragment>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return null;
}

export default function HelpCenter({ open, onClose, activeTab, workspace, permissions, isDirector }) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const articleRef = useRef(null);

  const roleSections = useMemo(
    () => HELP_SECTIONS.filter((section) => isSectionVisible(section, { workspace, permissions, isDirector })),
    [workspace, permissions, isDirector],
  );
  const baseSections = showAll ? HELP_SECTIONS : roleSections;
  const hiddenCount = HELP_SECTIONS.length - roleSections.length;

  const filteredSections = useMemo(() => {
    const needle = normalizeVietnamese(query.trim());
    if (!needle) return baseSections;
    return baseSections.filter((section) => SEARCH_INDEX.get(section.id).includes(needle));
  }, [baseSections, query]);

  // Mở "?" ở tab nào thì nhảy tới hướng dẫn của tab đó. Chỉ chọn lúc vừa mở:
  // App vẽ lại liên tục (permissions là object mới) không được kéo người đang đọc đi chỗ khác.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const forTab = roleSections.find((section) => section.tabs?.includes(activeTab));
      setSelectedId((forTab || roleSections[0] || HELP_SECTIONS[0]).id);
      setQuery('');
    }
    wasOpenRef.current = open;
  }, [open, activeTab, roleSections]);

  const selected =
    filteredSections.find((section) => section.id === selectedId) || filteredSections[0] || null;

  useEffect(() => {
    articleRef.current?.scrollTo?.({ top: 0 });
  }, [selected?.id]);

  const grouped = HELP_GROUPS.map((group) => ({
    group,
    sections: filteredSections.filter((section) => section.group === group),
  })).filter((entry) => entry.sections.length > 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      className="help-center-modal"
      title={<span className="help-center__title"><BookOpen size={20} /> Hướng dẫn sử dụng</span>}
    >
      <div className="help-center">
        <nav className="help-center__toc" aria-label="Mục lục hướng dẫn">
          <label className="help-center__search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm trong hướng dẫn…"
              aria-label="Tìm trong hướng dẫn"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Xoá tìm kiếm">
                <X size={14} />
              </button>
            )}
          </label>

          {grouped.length === 0 && <p className="help-center__empty">Không tìm thấy mục nào khớp “{query}”.</p>}

          {grouped.map(({ group, sections }) => (
            <div className="help-center__group" key={group}>
              <div className="help-center__group-label">{group}</div>
              {sections.map((section) => (
                <button
                  type="button"
                  key={section.id}
                  className={`help-center__toc-item${selected?.id === section.id ? ' is-active' : ''}`}
                  aria-current={selected?.id === section.id ? 'true' : undefined}
                  onClick={() => setSelectedId(section.id)}
                >
                  {section.title}
                </button>
              ))}
            </div>
          ))}

          {hiddenCount > 0 && (
            <label className="help-center__show-all">
              <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
              Xem cả chức năng của vai trò khác ({hiddenCount})
            </label>
          )}
        </nav>

        <article className="help-center__article" ref={articleRef} aria-live="polite">
          {selected ? (
            <>
              <div className="help-center__eyebrow">{selected.group}</div>
              <h3 className="help-center__heading">{selected.title}</h3>
              {selected.blocks.map((block, index) => <HelpBlock block={block} key={index} />)}
            </>
          ) : (
            <p className="help-center__empty">Chọn một mục ở mục lục bên trái.</p>
          )}
        </article>
      </div>
    </Modal>
  );
}
