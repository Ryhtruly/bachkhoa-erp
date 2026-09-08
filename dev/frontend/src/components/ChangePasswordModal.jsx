import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { Modal } from './ui';
import { apiFetch } from '../lib/api';
import { useToast } from '../contexts/ToastContext';

export default function ChangePasswordModal({ open, onClose }) {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
  };

  const handleClose = () => {
    resetForm();
    onClose?.();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!currentPassword) {
      setError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Mật khẩu mới không được trùng với mật khẩu hiện tại.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setLoading(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      toast?.addToast('Đổi mật khẩu thành công!', 'success');
      handleClose();
    } catch (err) {
      setError(err.message || 'Không thể đổi mật khẩu. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <KeyRound size={20} color="var(--primary-600, #E86832)" />
          <span>Đổi mật khẩu tài khoản</span>
        </div>
      }
      size="md"
    >
      <form onSubmit={handleSubmit} className="change-password-form" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #64748b)' }}>
          Để bảo vệ tài khoản, mật khẩu mới cần có độ dài tối thiểu 6 ký tự và khác mật khẩu hiện tại.
        </p>

        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: 6,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: 'var(--danger-600, #dc2626)',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Lock size={15} />
            <span>{error}</span>
          </div>
        )}

        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
            Mật khẩu hiện tại <span style={{ color: 'var(--danger-500, #ef4444)' }}>*</span>
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showCurrent ? 'text' : 'password'}
              className="form-control"
              placeholder="Nhập mật khẩu đang sử dụng"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              disabled={loading}
              style={{ width: '100%', paddingRight: 40 }}
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-tertiary, #94a3b8)',
                display: 'flex',
                alignItems: 'center',
                padding: 4,
              }}
              tabIndex={-1}
              aria-label={showCurrent ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
            Mật khẩu mới <span style={{ color: 'var(--danger-500, #ef4444)' }}>*</span>
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showNew ? 'text' : 'password'}
              className="form-control"
              placeholder="Tối thiểu 6 ký tự"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              disabled={loading}
              style={{ width: '100%', paddingRight: 40 }}
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-tertiary, #94a3b8)',
                display: 'flex',
                alignItems: 'center',
                padding: 4,
              }}
              tabIndex={-1}
              aria-label={showNew ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
            Xác nhận mật khẩu mới <span style={{ color: 'var(--danger-500, #ef4444)' }}>*</span>
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showConfirm ? 'text' : 'password'}
              className="form-control"
              placeholder="Nhập lại mật khẩu mới"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
              style={{ width: '100%', paddingRight: 40 }}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-tertiary, #94a3b8)',
                display: 'flex',
                alignItems: 'center',
                padding: 4,
              }}
              tabIndex={-1}
              aria-label={showConfirm ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-default)' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClose}
            disabled={loading}
          >
            Hủy bỏ
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ minWidth: 140, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            {loading ? (
              <span>Đang lưu...</span>
            ) : (
              <>
                <ShieldCheck size={16} />
                <span>Đổi mật khẩu</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
