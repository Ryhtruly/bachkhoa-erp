import React, { useEffect, useState } from 'react';
import './login.css';
import loginLogo from '../assets/title-banner.png';
import { applyTheme, getInitialTheme } from '../lib/theme';

export default function SetPassword({ onDone }) {
  const [token] = useState(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const fromSearch = searchParams.get('token');
    if (fromSearch) return fromSearch;

    if (window.location.hash.includes('token=')) {
      const hashQuery = window.location.hash.split('?')[1];
      if (hashQuery) {
        return new URLSearchParams(hashQuery).get('token') || '';
      }
    }
    return '';
  });

  const [theme, setTheme] = useState(getInitialTheme);
  const [checking, setChecking] = useState(true);
  const [invite, setInvite] = useState(null);
  const [checkError, setCheckError] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!token) {
      setCheckError('Liên kết không hợp lệ: thiếu mã xác thực kích hoạt tài khoản.');
      setChecking(false);
      return;
    }
    fetch(`/api/auth/invite/${token}`, { credentials: 'include' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.detail || 'Liên kết kích hoạt không hợp lệ hoặc đã hết hạn.');
        }
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
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || 'Không thể đặt mật khẩu. Vui lòng thử lại.');
      }
      setDone(true);
      setTimeout(() => {
        if (typeof onDone === 'function') {
          onDone(payload.token);
        } else {
          window.location.href = '/';
        }
      }, 1200);
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const isLengthOk = password.length >= 6;
  const isMatchOk = Boolean(confirmPassword) && password === confirmPassword;

  return (
    <div className="bk-login">
      <div className="grid-bg" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />

      <div className="frame">
        {/* Header bar */}
        <header className="top">
          <div className="brand">
            <img src={loginLogo} alt="Bách Khoa ERP" />
          </div>
          <div className="top-tools">
            <button
              type="button"
              className="theme-toggle"
              aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
              title={theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'}
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            >
              <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
            </button>
            <div className="meta">
              <div>
                <dt>HỆ THỐNG</dt>
                <dd>ERP 2.0</dd>
              </div>
              <div>
                <dt>TRẠNG THÁI</dt>
                <dd className="live">
                  <b aria-hidden="true" />
                  KÍCH HOẠT
                </dd>
              </div>
            </div>
          </div>
        </header>

        {/* Main Body */}
        <main className="body">
          {/* Left Hero */}
          <section className="stage" aria-label="Thông tin kích hoạt">
            <div className="ruler" aria-hidden="true">
              <span>PW-01 // XÁC THỰC</span>
              <span>PW-02 // BẢO MẬT</span>
              <span>PW-03 // PHÂN QUYỀN</span>
              <span>PW-04 // SẴN SÀNG</span>
            </div>

            <div className="hero">
              <div className="eyebrow">
                <i aria-hidden="true" />
                <span>KÍCH HOẠT TÀI KHOẢN NHÂN SỰ</span>
              </div>
              <h1>
                THIẾT LẬP MẬT KHẨU<br />
                <em>BÁCH KHOA ERP</em>
              </h1>
              <p className="lede">
                Chào mừng bạn gia nhập hệ thống làm việc Bách Khoa ERP. Vui lòng thiết lập mật khẩu bảo mật để hoàn tất kích hoạt tài khoản của bạn.
              </p>
            </div>

            {/* Visual plot banner */}
            <div className="plot" aria-hidden="true">
              <svg viewBox="0 0 760 320" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="20" y="20" width="720" height="280" rx="8" stroke="#6E655C" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
                <path d="M 60 160 L 220 160 L 280 90 L 480 90 L 540 160 L 700 160" stroke="#E86832" strokeWidth="2" fill="none" />
                <circle cx="280" cy="90" r="4" fill="#E86832" className="vtx" />
                <circle cx="480" cy="90" r="4" fill="#E86832" className="vtx" />
                <circle cx="220" cy="160" r="4" fill="#E86832" className="vtx" />
                <circle cx="540" cy="160" r="4" fill="#E86832" className="vtx" />
                <text x="320" y="80" fill="#E86832" fontSize="11" fontFamily="'IBM Plex Mono', monospace" letterSpacing="2">BẢO MẬT TÀI KHOẢN</text>
                <text x="240" y="220" fill="#A79C91" fontSize="12" fontFamily="'IBM Plex Mono', monospace">● Mật khẩu mã hoá SHA-256 an toàn chuẩn doanh nghiệp</text>
                <text x="240" y="245" fill="#A79C91" fontSize="12" fontFamily="'IBM Plex Mono', monospace">● Tự động đăng nhập ngay sau khi kích hoạt thành công</text>
              </svg>
            </div>

            <div className="strip" aria-hidden="true">
              <div>
                <dt>ĐỘ DÀI TỐI THIỂU</dt>
                <dd>06 KÝ TỰ</dd>
              </div>
              <div>
                <dt>MÃ HÓA</dt>
                <dd>SHA-256 SALT</dd>
              </div>
              <div>
                <dt>THỜI HẠN LINK</dt>
                <dd>48 GIỜ</dd>
              </div>
              <div>
                <dt>PHÂN HỆ</dt>
                <dd>HỆ THỐNG</dd>
              </div>
            </div>

            <div className="keys" aria-hidden="true">
              <span><i className="sw on" /> BẢO MẬT CAO</span>
              <span><i className="sw dash" /> XÁC THỰC EMAIL</span>
              <span><i className="sw on" /> SẴN SÀNG ĐĂNG NHẬP</span>
            </div>
          </section>

          {/* Right Action Rail */}
          <aside className="rail" aria-label="Khung nhập mật khẩu">
            <div className="rail-hd">
              <span className="num">[01]</span>
              <div>
                <h2>ĐẶT MẬT KHẨU MỚI</h2>
                <p>XÁC NHẬN THÔNG TIN TÀI KHOẢN</p>
              </div>
            </div>

            {/* State: Checking token */}
            {checking && (
              <div style={{ padding: 30 }}>
                <p style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--fg-2)' }}>
                  Đang kiểm tra tính hợp lệ của liên kết kích hoạt...
                </p>
              </div>
            )}

            {/* State: Invalid / Expired Token */}
            {!checking && checkError && (
              <div style={{ padding: 30 }}>
                <div className="alarm" role="alert">
                  <span aria-hidden="true">⚠️</span>
                  <span>{checkError}</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.6, marginBottom: 20 }}>
                  Liên kết này có thể đã được sử dụng hoặc đã quá thời hạn 48 giờ. Vui lòng liên hệ ban quản trị để được cấp lại liên kết kích hoạt mới.
                </p>
                <button
                  type="button"
                  className="go"
                  onClick={() => { window.location.href = '/'; }}
                >
                  QUAY LẠI TRANG ĐĂNG NHẬP
                </button>
              </div>
            )}

            {/* State: Success */}
            {!checking && !checkError && done && (
              <div style={{ padding: 30 }}>
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: 6,
                    background: 'rgba(52, 135, 90, 0.12)',
                    border: '1px solid var(--ok)',
                    color: 'var(--ok)',
                    fontFamily: 'var(--mono)',
                    fontSize: 13,
                    lineHeight: 1.6,
                    marginBottom: 20,
                  }}
                >
                  ✅ Đặt mật khẩu thành công! Đang tự động chuyển bạn vào hệ thống Bách Khoa ERP...
                </div>
              </div>
            )}

            {/* State: Ready to set password */}
            {!checking && !checkError && !done && invite && (
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 20 }}>
                  <span style={{ fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--mono)', display: 'block', marginBottom: 4 }}>
                    TÀI KHOẢN KÍCH HOẠT:
                  </span>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--acc)', fontFamily: 'var(--mono)' }}>
                    {invite.username}
                  </div>
                  {invite.employee_name && (
                    <div style={{ fontSize: 13, color: 'var(--fg-2)', marginTop: 2 }}>
                      Nhân sự: <strong>{invite.employee_name}</strong>
                    </div>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="input-password">MẬT KHẨU MỚI</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="input-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Nhập mật khẩu mới..."
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      style={{ paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--fg-3)',
                        fontSize: 16,
                      }}
                      title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showPassword ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: isLengthOk ? 'var(--ok)' : 'var(--fg-3)' }}>
                      {isLengthOk ? '✓ Tối thiểu 6 ký tự' : '○ Tối thiểu 6 ký tự'}
                    </span>
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="input-confirm-password">XÁC NHẬN MẬT KHẨU</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="input-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Nhập lại mật khẩu mới..."
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      style={{ paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--fg-3)',
                        fontSize: 16,
                      }}
                      title={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                  {confirmPassword && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: isMatchOk ? 'var(--ok)' : 'var(--acc)' }}>
                        {isMatchOk ? '✓ Mật khẩu khớp nhau' : '✕ Mật khẩu chưa khớp'}
                      </span>
                    </div>
                  )}
                </div>

                {submitError && (
                  <div className="alarm" role="alert">
                    <span aria-hidden="true">⚠️</span>
                    <span>{submitError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="go"
                  disabled={submitting || !isLengthOk || !isMatchOk}
                >
                  {submitting ? 'ĐANG LƯU MẬT KHẨU...' : 'LƯU MẬT KHẨU & ĐĂNG NHẬP'}
                </button>
              </form>
            )}

            <div style={{ padding: '16px 30px', borderTop: '1px solid var(--line)', textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => { window.location.href = '/'; }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  color: 'var(--fg-3)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                ĐÃ CÓ TÀI KHOẢN? ĐĂNG NHẬP TẠI ĐÂY
              </button>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
