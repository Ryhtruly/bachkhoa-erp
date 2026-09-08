import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Modal — Hộp thoại dùng chung (Portaled to document.body)
 *
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   title?: string | ReactNode
 *   size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
 *   footer?: ReactNode               — slot footer tùy chỉnh
 *   hideClose?: boolean              — ẩn nút X
 *   closeOnOverlay?: boolean         — đóng khi click ngoài (mặc định true)
 *   overlayClassName?: string        — class bổ sung cho lớp nền
 *   className?: string               — class bổ sung cho modal
 *   id?: string                      — để aria-labelledby
 *   children: ReactNode
 */
export default function Modal({
  open,
  onClose,
  title,
  size = 'md',
  footer,
  hideClose = false,
  closeOnOverlay = true,
  overlayClassName = '',
  className = '',
  id,
  children,
}) {
  const generatedId = React.useId();
  const modalId = id || generatedId;
  const closeButtonRef = React.useRef(null);
  const restoreFocusRef = React.useRef(null);

  // Đóng bằng Escape
  React.useEffect(() => {
    if (!open) return;
    const handler = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Khóa scroll body khi modal mở và trả lại focus
  React.useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
      restoreFocusRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  const sizeMap = { sm: 400, md: 560, lg: 720, xl: 1140, '2xl': 1240, full: '94vw' };

  const content = (
    <div
      className={`modal-overlay open${overlayClassName ? ` ${overlayClassName}` : ''}`}
      onClick={closeOnOverlay ? (e) => e.target === e.currentTarget && onClose?.() : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${modalId}-title`}
      tabIndex={-1}
    >
      <div
        className={`modal${className ? ` ${className}` : ''}`}
        style={{ width: sizeMap[size] ?? sizeMap.md }}
        id={modalId}
      >
        {/* Header */}
        {(title || !hideClose) && (
          <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            {title && (
              <h2 id={`${modalId}-title`} style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                {title}
              </h2>
            )}
            {!hideClose && (
              <button
                ref={closeButtonRef}
                className="btn btn-icon btn-ghost btn-sm"
                onClick={onClose}
                aria-label="Đóng"
                id={`${modalId}-close-btn`}
                style={{ marginLeft: 'auto' }}
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="modal-body">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="modal-footer">{footer}</div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}

/**
 * FormRow — Hàng form tiêu chuẩn (label + input)
 */
export function FormRow({ label, required, hint, error, cols = 1, align = 'center', children }) {
  return (
    <div className={`form-row${cols === 2 ? ' form-row--wide' : ''}${error ? ' form-row--error' : ''}${align === 'left' ? ' form-row--left' : ''}`}>
      <label>
        {label}
        {required && <span className="form-required">*</span>}
      </label>
      {children}
      {hint && !error && <p className="form-hint">{hint}</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

/**
 * FormGrid — Grid 2 cột cho form
 */
export function FormGrid({ children, cols = 2 }) {
  return (
    <div
      className="form-grid"
      style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '16px 20px' }}
    >
      {children}
    </div>
  );
}
