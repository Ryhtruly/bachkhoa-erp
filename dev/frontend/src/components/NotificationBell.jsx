import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCircle2, Clock3, RotateCcw, XCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useDropdownPosition } from '../lib/useDropdownPosition';

const TYPE_ICON = {
  node_review: <Clock3 size={14} />,
  checklist_review: <CheckCircle2 size={14} />,
  node_start: <RotateCcw size={14} />,
  checklist_resubmit: <XCircle size={14} />,
};

export default function NotificationBell({ open, onOpenChange, onNavigate }) {
  const [items, setItems] = useState([]);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const style = useDropdownPosition(open, triggerRef, panelRef, 320);

  useEffect(() => {
    let cancelled = false;
    const poll = () => apiFetch('/api/notifications/summary')
      .then((payload) => { if (!cancelled) setItems(payload.items || []); })
      .catch(() => {});
    poll();
    const pollId = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(pollId); };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const handleOutsideClick = (event) => {
      if (
        !triggerRef.current?.contains(event.target)
        && !panelRef.current?.contains(event.target)
      ) onOpenChange?.(false);
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [open, onOpenChange]);

  const handleItemClick = (item) => {
    onOpenChange?.(false);
    onNavigate?.(item);
  };

  return (
    <div className="notification-bell">
      <button
        ref={triggerRef}
        type="button"
        className="notification-bell__trigger"
        onClick={() => onOpenChange?.(!open)}
        aria-label="Thông báo việc cần xử lý"
      >
        <Bell size={18} />
        {items.length > 0 && (
          <span className="notification-bell__badge">{items.length > 9 ? '9+' : items.length}</span>
        )}
      </button>

      {open && createPortal(
        <div className="notification-bell__panel" ref={panelRef} style={style || { visibility: 'hidden' }}>
          <div className="notification-bell__panel-title">Cần xử lý ({items.length})</div>
          {items.length === 0 ? (
            <p className="notification-bell__empty">Không có việc cần xử lý</p>
          ) : (
            <ul className="notification-bell__list">
              {items.map((item, index) => (
                <li key={`${item.type}-${item.contract_id}-${item.node_key}-${index}`}>
                  <button type="button" onClick={() => handleItemClick(item)}>
                    <span className={`notification-bell__type notification-bell__type--${item.type}`}>
                      {TYPE_ICON[item.type]}
                    </span>
                    <span className="notification-bell__label">{item.label}</span>
                    <span className="notification-bell__contract">{item.contract_id}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
