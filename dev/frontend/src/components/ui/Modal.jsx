import React from 'react';
import { X } from 'lucide-react';

/**
 * Modal — Hộp thoại dùng chung
 *
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   title?: string | ReactNode
 *   size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
 *   footer?: ReactNode               — slot footer tùy chỉnh
 *   hideClose?: boolean              — ẩn nút X
 *   closeOnOverlay?: boolean         — đóng khi click ngoài (mặc định true)
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
  id = 'modal',
  children,
}) {
  // Đóng bằng Escape
  React.useEffect(() => {
    if (!open) return;
    const handler = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Khóa scroll body khi modal mở
  React.useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const sizeMap = { sm: 400, md: 560, lg: 720, xl: 900, full: '92vw' };

  return (
    <div
      className={`modal-overlay${open ? ' open' : ''}`}
      onClick={closeOnOverlay ? (e) => e.target === e.currentTarget && onClose?.() : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      tabIndex={-1}
    >
      <div
        className="modal"
        style={{ width: sizeMap[size] ?? sizeMap.md }}
        id={id}
      >
        {/* Header */}
        {(title || !hideClose) && (
          <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            {title && (
              <h2 id={`${id}-title`} style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                {title}
              </h2>
            )}
            {!hideClose && (
              <button
                className="btn btn-icon btn-ghost btn-sm"
                onClick={onClose}
                aria-label="Đóng"
                id={`${id}-close-btn`}
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
}


/**
 * FormRow — Hàng form tiêu chuẩn (label + input)
 *
 * Props:
 *   label: string
 *   required?: boolean
 *   hint?: string
 *   error?: string
 *   cols?: 1 | 2         — chiếm 1 hay 2 cột (mặc định 1)
 *   children: ReactNode
 */
export function FormRow({ label, required, hint, error, cols = 1, children }) {
  return (
    <div className={`form-row${cols === 2 ? ' form-row--wide' : ''}${error ? ' form-row--error' : ''}`}>
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
