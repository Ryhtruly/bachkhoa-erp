import React, { useEffect, useState } from 'react';

export default function SetPassword({ onDone }) {
  const token = new URLSearchParams(window.location.search).get('token') || '';

  const [checking, setChecking] = useState(true);
  const [invite, setInvite] = useState(null);
  const [checkError, setCheckError] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setCheckError('Liên kết không hợp lệ: thiếu mã xác thực.');
      setChecking(false);
      return;
    }
    fetch(`/api/auth/invite/${token}`, { credentials: 'include' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || 'Liên kết không hợp lệ.');
        setInvite(payload);
      })
      .catch((error) => setCheckError(error.message))
      .finally(() => setChecking(false));
  }, [token]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');
    if (password.length < 6) {
      setSubmitError('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError('Mật khẩu nhập lại không khớp.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/auth/invite/${token}/complete`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Không thể đặt mật khẩu.');
      setDone(true);
      setTimeout(() => onDone(payload.token), 1200);
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="ambient-bg" />
      <div className="login-card">
        <div className="login-brand">
          <img src="/logo.png" alt="Bách Khoa" className="login-logo" />
          <h1>Bách Khoa ERP</h1>
          <p>Đặt mật khẩu cho tài khoản của bạn</p>
        </div>

        {checking && <p className="login-error" style={{ color: 'var(--text-secondary)' }}>Đang kiểm tra liên kết...</p>}

        {!checking && checkError && (
          <p className="login-error">{checkError} Liên hệ giám đốc/quản trị để được gửi lại lời mời.</p>
        )}

        {!checking && !checkError && done && (
          <p className="login-error" style={{ color: 'var(--green-500)' }}>
            Đặt mật khẩu thành công! Đang đưa bạn vào hệ thống...
          </p>
        )}

        {!checking && !checkError && !done && invite && (
          <form onSubmit={handleSubmit} className="login-form">
            <p style={{ margin: '0 0 8px', color: 'var(--text-secondary)' }}>
              Xin chào <strong>{invite.username}</strong>, hãy đặt mật khẩu để kích hoạt tài khoản.
            </p>
            <div className="input-wrap">
              <i>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </i>
              <input
                type="password"
                placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="input-wrap">
              <i>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </i>
              <input
                type="password"
                placeholder="Nhập lại mật khẩu"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={6}
              />
            </div>
            {submitError && <p className="login-error">{submitError}</p>}
            <button type="submit" className="btn btn-primary login-btn" disabled={submitting}>
              {submitting ? 'Đang lưu...' : 'Đặt mật khẩu & Đăng nhập'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
