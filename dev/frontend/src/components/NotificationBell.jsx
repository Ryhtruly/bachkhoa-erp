import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCircle2, Clock3, RotateCcw, Wallet, XCircle } from 'lucide-react';
import { apiFetch, getAccessToken } from '../lib/api';
import { useDropdownPosition } from '../lib/useDropdownPosition';

const TYPE_ICON = {
  node_review: <Clock3 size={14} />,
  checklist_review: <CheckCircle2 size={14} />,
  node_start: <RotateCcw size={14} />,
  checklist_resubmit: <XCircle size={14} />,
  cashflow_approval: <Wallet size={14} />,
};

export default function NotificationBell({ open, onOpenChange, onNavigate }) {
  const [items, setItems] = useState([]);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const style = useDropdownPosition(open, triggerRef, panelRef, 320);

  useEffect(() => {
    let cancelled = false;
    let abortController = null;
    let fallbackPollId = null;

    const poll = () => apiFetch('/api/notifications/summary')
      .then((payload) => { if (!cancelled) setItems(payload.items || []); })
      .catch(() => {});

    const startFallbackPolling = () => {
      if (fallbackPollId !== null) return;
      poll();
      fallbackPollId = window.setInterval(poll, 5000);
    };

    const stopFallbackPolling = () => {
      if (fallbackPollId === null) return;
      window.clearInterval(fallbackPollId);
      fallbackPollId = null;
    };

    const wait = (milliseconds) => new Promise((resolve) => {
      window.setTimeout(resolve, milliseconds);
    });

    poll();

    const subscribe = async () => {
      while (!cancelled) {
        const token = getAccessToken();
        if (!token) {
          startFallbackPolling();
          return;
        }

        abortController = new AbortController();
        try {
          const response = await fetch('/api/notifications/events', {
            headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
            cache: 'no-store',
            signal: abortController.signal,
          });
          if (response.status === 401 || response.status === 403) {
            startFallbackPolling();
            return;
          }
          if (!response.ok || !response.body) throw new Error('Không kết nối được Notification Realtime');

          stopFallbackPolling();
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (!cancelled) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split('\n\n');
            buffer = blocks.pop() || '';
            if (blocks.some((block) => block.includes('event: notifications-changed'))) {
              poll();
            }
          }
        } catch (streamError) {
          if (cancelled || streamError?.name === 'AbortError') return;
        }

        if (!cancelled) {
          startFallbackPolling();
          await wait(1500);
        }
      }
    };

    subscribe();
    return () => {
      cancelled = true;
      abortController?.abort();
      if (fallbackPollId !== null) window.clearInterval(fallbackPollId);
    };
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
                <li key={`${item.type}-${item.voucher_id || item.contract_id}-${item.node_key}-${index}`}>
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
