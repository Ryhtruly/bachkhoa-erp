import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import Modal from './Modal';

/**
 * SensitiveActionModal — Modal xác nhận 2 bước bắt buộc nhập lý do
 * dành cho các thao tác nhạy cảm liên quan đến Tiền bạc, Phê duyệt, Chốt sổ, Xóa nợ.
 *
 * Props:
 *   isOpen / open: boolean
 *   onClose: () => void
 *   onConfirm: (reason: string) => Promise<void> | void
 *   title: string
 *   description?: string | React.ReactNode
 *   actionLabel?: string
 *   actionVariant?: 'danger' | 'primary' | 'warning' | 'purple'
 *   requireReason?: boolean
 *   placeholderReason?: string
 */
export function SensitiveActionModal({
  isOpen,
  open,
  onClose,
  onConfirm,
  title = 'Xác nhận thao tác phê duyệt',
  description,
  actionLabel = 'Xác nhận',
  actionVariant = 'primary',
  requireReason = true,
  placeholderReason = 'Nhập lý do thực thi thao tác này (*)...',
  isLoading = false,
  overlayClassName,
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const isVisible = open !== undefined ? open : isOpen;
  if (!isVisible) return null;

  const handleClose = () => {
    setReason('');
    setError('');
    onClose?.();
  };

  const handleConfirm = async () => {
    if (requireReason && !reason.trim()) {
      setError('Vui lòng nhập lý do thực thi.');
      return;
    }
    setError('');
    await onConfirm?.(reason.trim());
    setReason('');
  };

  return (
    <Modal open={isVisible} onClose={handleClose} title="" size="sm" overlayClassName={overlayClassName}>
      <div className="sensitive-modal-content" style={{ padding: '8px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: actionVariant === 'danger' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: actionVariant === 'danger' ? '#dc2626' : '#d97706'
          }}>
            <ShieldAlert size={24} />
          </div>
          <div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {title}
            </h3>
            <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {description}
            </div>
          </div>
        </div>

        <div style={{
          background: 'var(--bg-tertiary, rgba(245, 158, 11, 0.06))',
          border: '1px dashed var(--border-warning, #f59e0b44)',
          borderRadius: '8px',
          padding: '10px 14px',
          fontSize: '0.82rem',
          color: 'var(--text-secondary)',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <AlertTriangle size={16} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <span>Thao tác có tính chất pháp lý & tài chính. Hệ thống sẽ ghi nhận vết kiểm toán định danh vĩnh viễn.</span>
        </div>

        {requireReason && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Lý do thực hiện <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              className="form-control"
              rows={3}
              style={{
                width: '100%',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '0.88rem',
                borderColor: error ? '#ef4444' : undefined
              }}
              placeholder={placeholderReason}
              value={reason}
              onChange={e => { setReason(e.target.value); if (error) setError(''); }}
              autoFocus
            />
            {error && (
              <p style={{ color: '#ef4444', fontSize: '0.8rem', margin: '4px 0 0 0' }}>{error}</p>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClose}
            disabled={isLoading}
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            className={`btn ${actionVariant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={handleConfirm}
            disabled={isLoading}
            style={actionVariant === 'purple' ? { background: '#9333ea', borderColor: '#9333ea', color: '#fff' } : undefined}
          >
            {isLoading ? 'Đang xử lý...' : actionLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
