import React from 'react';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import Modal from './Modal';

const variantMeta = {
  danger: { color: '#dc2626', background: 'rgba(239, 68, 68, 0.12)', Icon: ShieldAlert },
  warning: { color: '#d97706', background: 'rgba(245, 158, 11, 0.12)', Icon: AlertTriangle },
  primary: { color: '#2563eb', background: 'rgba(37, 99, 235, 0.1)', Icon: CheckCircle2 },
  neutral: { color: '#475569', background: 'rgba(100, 116, 139, 0.12)', Icon: Info },
};

export default function ConfirmationModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy bỏ',
  variant = 'primary',
  isLoading = false,
}) {
  const meta = variantMeta[variant] || variantMeta.primary;
  const Icon = meta.Icon;
  const handleClose = () => {
    if (!isLoading) onClose?.();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="sm"
      closeOnOverlay={!isLoading}
      title={(
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: meta.background,
            color: meta.color,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Icon size={19} />
          </span>
          {title}
        </span>
      )}
    >
      <div style={{ padding: '8px 4px' }}>
        <div style={{ marginBottom: 20, fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          {description}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={isLoading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${variant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={isLoading}
            style={variant === 'warning' ? { background: '#d97706', borderColor: '#d97706', color: '#fff' } : undefined}
          >
            {isLoading ? 'Đang xử lý...' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
