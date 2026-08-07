import React, { useState } from 'react';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Không thể đăng nhập');
      onLogin(payload.token);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="ambient-bg" />
      <div className="login-card">
        <div className="login-brand">
          <img src="/logo.png" alt="Bách Khoa" className="login-logo" />
          <h1>Bách Khoa ERP</h1>
          <p>Hệ thống quản trị doanh nghiệp</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-wrap">
            <i>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </i>
            <input
              type="text"
              placeholder="Tên đăng nhập"
              value={username}
              onChange={event => setUsername(event.target.value)}
              required
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
              placeholder="Mật khẩu"
              value={password}
              onChange={event => setPassword(event.target.value)}
              required
            />
          </div>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
            {loading ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}
