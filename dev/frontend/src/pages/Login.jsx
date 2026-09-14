import React, { useEffect, useState } from 'react';
import './login.css';
import loginLogo from '../assets/title-banner.png';
import { applyTheme, getInitialTheme } from '../lib/theme';

/**
 * Trang đăng nhập.
 *
 * Dựng lại đúng bản thiết kế: bố cục, khoảng cách, màu, font và animation giữ
 * nguyên. Ba thứ được nối vào hệ thống thật:
 *
 *   1. Form gọi POST /api/auth/login và trả token lên App.
 *   2. Nút đổi chữ và khoá lại trong lúc chờ máy chủ.
 *   3. Lỗi hiện ngay trong khay bên phải, sát trên nút — chỗ mắt đang nhìn khi
 *      vừa bấm, không phải một góc khác của màn hình.
 *
 * Trang render ngoài layout shell chung (xem App.jsx), nên không có sidebar,
 * header hay bất cứ khung nào của app bọc quanh.
 */

const REMEMBERED_USERNAME_STORAGE_KEY = 'bachkhoa_login_username';

export default function Login({ onLogin }) {
  // Không điền sẵn tài khoản nào. Chỉ khôi phục tên mà chính người dùng đã chọn
  // ghi nhớ ở lần đăng nhập trước.
  const [username, setUsername] = useState(() => localStorage.getItem(REMEMBERED_USERNAME_STORAGE_KEY) || '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => Boolean(localStorage.getItem(REMEMBERED_USERNAME_STORAGE_KEY)));
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);

  // 'login' | 'forgot_identify' | 'forgot_otp' | 'forgot_new_pass'
  const [mode, setMode] = useState('login');
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setInterval(() => {
        setCountdown((c) => c - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setSuccessMessage('');
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          remember_me: remember,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Không thể đăng nhập');
      if (remember) localStorage.setItem(REMEMBERED_USERNAME_STORAGE_KEY, username.trim());
      else localStorage.removeItem(REMEMBERED_USERNAME_STORAGE_KEY);
      onLogin(payload.token, payload.user);
    } catch (loginError) {
      setError(loginError.message === 'Failed to fetch'
        ? 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'
        : loginError.message);
      setLoading(false);
    }
  };

  const handleForgotRequestSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    if (!forgotIdentifier.trim()) {
      setError('Vui lòng nhập tên đăng nhập hoặc email.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/forgot-password/request-otp', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: forgotIdentifier.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Không thể gửi mã OTP.');

      setMaskedEmail(payload.email_masked || '');
      setCountdown(60);
      setOtp('');
      setMode('forgot_otp');
    } catch (err) {
      setError(err.message === 'Failed to fetch' ? 'Không thể kết nối máy chủ.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (loading || countdown > 0) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/forgot-password/request-otp', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: forgotIdentifier.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Không thể gửi lại mã OTP.');

      setCountdown(60);
      setSuccessMessage('Đã gửi lại mã OTP thành công.');
    } catch (err) {
      setError(err.message || 'Không thể gửi lại mã OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtpSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length < 6) {
      setError('Vui lòng nhập đủ 6 chữ số OTP.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/forgot-password/verify-otp', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: forgotIdentifier.trim(), otp: cleanOtp }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Mã OTP không hợp lệ.');

      setMode('forgot_new_pass');
    } catch (err) {
      setError(err.message || 'Mã OTP không hợp lệ.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    if (newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/forgot-password/reset-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: forgotIdentifier.trim(),
          otp: otp.trim(),
          new_password: newPassword,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Không thể đặt lại mật khẩu.');

      setSuccessMessage('Đổi mật khẩu thành công! Đang đưa bạn vào hệ thống...');
      setTimeout(() => {
        onLogin(payload.token, payload.user);
      }, 1000);
    } catch (err) {
      setError(err.message || 'Không thể đặt lại mật khẩu.');
      setLoading(false);
    }
  };

  return (
    <div className="bk-login">
      <div className="grid-bg" />
      <div className="vignette" />

      <div className="frame">

        <header className="top">
          <div className="brand">
            <img
              src={loginLogo}
              alt="Bách Khoa - Đo đạc - Kiến trúc - Xây dựng"
            />
          </div>
          <div className="top-tools">
            <button
              className="theme-toggle"
              type="button"
              onClick={() => setTheme((currentTheme) => currentTheme === 'light' ? 'dark' : 'light')}
              aria-label={theme === 'light' ? 'Chuyển sang nền tối' : 'Chuyển sang nền sáng'}
              title={theme === 'light' ? 'Chuyển sang nền tối' : 'Chuyển sang nền sáng'}
            >
              <span aria-hidden="true">{theme === 'light' ? '🌙' : '☀️'}</span>
            </button>
            <dl className="meta">
              <div><dt>Hệ thống</dt><dd>Quản trị đo vẽ &amp; pháp lý</dd></div>
              <div><dt>Phiên bản</dt><dd>2.4</dd></div>
              <div><dt>Trạng thái</dt><dd className="live"><b />Đang hoạt động</dd></div>
            </dl>
          </div>
        </header>

        <main className="body">

          <section className="stage">
            <div className="ruler" aria-hidden="true">
              <span>592400</span><span>592440</span><span>592480</span><span>592520</span>
              <span>592560</span><span>592600</span><span>592640</span><span>592680</span>
              <span>592720</span><span>592760</span><span>592800</span><span>592840</span>
            </div>

            <div className="hero">
              <p className="eyebrow"><i />Sơ đồ ranh thửa · minh hoạ</p>
              <h1>Quản lý hồ sơ đo vẽ<br />và pháp lý <em>chính xác</em><br />đến từng mốc toạ độ.</h1>
              <p className="lede">
                Từ tiếp cận khách hàng, đo đạc thực địa, đến bàn giao và thu tiền — toàn bộ
                quy trình được ghi lại xuyên suốt trên một hệ thống.
              </p>
            </div>

            <div className="plot">
              <svg viewBox="0 0 660 300" preserveAspectRatio="xMidYMid meet" role="img"
                aria-label="Sơ đồ ranh thửa minh hoạ với sáu mốc toạ độ">
                <path d="M120 240 L60 120 L190 42 L330 78 L392 190 L262 262 Z" fill="#E8703A" opacity=".07" />
                <path d="M120 240 L60 120 L190 42 L330 78 L392 190 L262 262 Z" fill="none" stroke="#E8703A" strokeWidth="1.6" />
                <path className="trace" d="M120 240 L60 120 L190 42 L330 78 L392 190 L262 262 Z" fill="none" stroke="#F5A87E" strokeWidth="1.6" />
                <path d="M120 240 L262 262" stroke="#E8703A" strokeWidth="1" strokeDasharray="4 4" opacity=".6" />

                <g fill="#E8703A">
                  <circle className="vtx" cx="120" cy="240" r="4" />
                  <circle className="vtx" cx="60" cy="120" r="4" />
                  <circle className="vtx" cx="190" cy="42" r="4" />
                  <circle className="vtx" cx="330" cy="78" r="4" />
                  <circle className="vtx" cx="392" cy="190" r="4" />
                  <circle className="vtx" cx="262" cy="262" r="4" />
                </g>

                <g fontFamily="IBM Plex Mono, monospace" fontSize="7.2" fill="#A79C91">
                  <text x="112" y="76" transform="rotate(-63 112 76)">42.6m</text>
                  <text x="108" y="70">51.3m</text>
                  <text x="264" y="48">36.8m</text>
                  <text x="374" y="122" transform="rotate(61 374 122)">28.4m</text>
                  <text x="322" y="243">44.1m</text>
                  <text x="168" y="266">39.2m</text>
                  <text x="150" y="256" fill="#6E655C" fontSize="6.5">Hoàn công</text>
                </g>

                <g fontFamily="IBM Plex Mono, monospace" fontSize="6.9" fill="#6E655C">
                  <text x="470" y="182">X: 592481.6</text>
                  <text x="470" y="196">Y: 1189203.4</text>
                  <text x="470" y="210">Z: 2.14</text>
                </g>

                <g transform="translate(468 60)">
                  <circle cx="14" cy="14" r="14" fill="none" stroke="#6E655C" strokeWidth="1" />
                  <path d="M14 5 L18 20 L14 17 L10 20 Z" fill="#E8703A" />
                  <text x="14" y="-6" fontFamily="IBM Plex Mono, monospace" fontSize="6.9" fill="#A79C91" textAnchor="middle">N</text>
                </g>

                <g stroke="#6E655C" strokeWidth="1">
                  <path d="M60 288 h100 M60 284 v8 M110 286 v6 M160 284 v8" />
                </g>
                <g fontFamily="IBM Plex Mono, monospace" fontSize="6.5" fill="#6E655C">
                  <text x="57" y="300">0</text>
                  <text x="150" y="300">20m</text>
                </g>
              </svg>
            </div>

            <dl className="strip">
              <div><dt>Diện tích</dt><dd>1.284,7 m²</dd></div>
              <div><dt>Số mốc</dt><dd>06</dd></div>
              <div><dt>Hệ toạ độ</dt><dd>VN-2000</dd></div>
              <div><dt>Cập nhật</dt><dd>12/08/2026</dd></div>
            </dl>

            <div className="keys">
              <span><i className="sw" />Mốc đã đo</span>
              <span><i className="sw on" />Mốc mới nhất</span>
              <span><i className="sw dash" />Ranh hoàn công</span>
            </div>
          </section>

          <aside className="rail">
            {/* Header của khay */}
            <div className="rail-hd">
              <span className="num">{mode === 'login' ? '01' : '02'}</span>
              <div>
                <h2>
                  {mode === 'login' && 'Đăng nhập'}
                  {mode === 'forgot_identify' && 'Quên mật khẩu'}
                  {mode === 'forgot_otp' && 'Xác thực OTP'}
                  {mode === 'forgot_new_pass' && 'Đặt lại mật khẩu'}
                </h2>
                <p>
                  {mode === 'login' && 'Khung xác thực hệ thống'}
                  {mode === 'forgot_identify' && 'Bước 1: Xác thực tài khoản'}
                  {mode === 'forgot_otp' && 'Bước 2: Nhập mã 6 số'}
                  {mode === 'forgot_new_pass' && 'Bước 3: Mật khẩu mới'}
                </p>
              </div>
            </div>

            {/* Form Đăng nhập */}
            {mode === 'login' && (
              <form onSubmit={handleLoginSubmit}>
                <div className="field">
                  <label htmlFor="u">Tài khoản</label>
                  <input
                    id="u"
                    type="text"
                    value={username}
                    autoComplete="username"
                    required
                    disabled={loading}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="p">Mật khẩu</label>
                  <input
                    id="p"
                    type="password"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    disabled={loading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="row">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={remember}
                      disabled={loading}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    <i className="box" />Ghi nhớ
                  </label>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => {
                      setForgotIdentifier(username || '');
                      switchMode('forgot_identify');
                    }}
                  >
                    Quên mật khẩu?
                  </button>
                </div>

                {error && (
                  <p className="alarm" role="alert">
                    <b>Lỗi</b>
                    <span>{error}</span>
                  </p>
                )}

                <button className="go" type="submit" disabled={loading}>
                  {loading ? 'Đang xác thực…' : 'Truy cập hệ thống →'}
                </button>
              </form>
            )}

            {/* Bước 1: Quên mật khẩu - Nhập Identifier */}
            {mode === 'forgot_identify' && (
              <form onSubmit={handleForgotRequestSubmit}>
                <div className="info-box">
                  Nhập tên đăng nhập hoặc địa chỉ email để nhận mã OTP khôi phục mật khẩu.
                </div>

                <div className="field">
                  <label htmlFor="forgot-id">Tài khoản hoặc Email</label>
                  <input
                    id="forgot-id"
                    type="text"
                    placeholder="Ví dụ: admin hoặc user@gmail.com"
                    value={forgotIdentifier}
                    required
                    disabled={loading}
                    onChange={(e) => setForgotIdentifier(e.target.value)}
                    autoFocus
                  />
                </div>

                {error && (
                  <p className="alarm" role="alert">
                    <b>Lỗi</b>
                    <span>{error}</span>
                  </p>
                )}

                <button className="go" type="submit" disabled={loading}>
                  {loading ? 'Đang gửi mã…' : 'Gửi mã OTP qua Email →'}
                </button>

                <div className="actions-secondary">
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => switchMode('login')}
                    disabled={loading}
                  >
                    ← Quay lại đăng nhập
                  </button>
                </div>
              </form>
            )}

            {/* Bước 2: Quên mật khẩu - Nhập mã OTP */}
            {mode === 'forgot_otp' && (
              <form onSubmit={handleVerifyOtpSubmit}>
                <div className="info-box">
                  Mã OTP 6 số đã được gửi đến <strong>{maskedEmail || forgotIdentifier}</strong> (hiệu lực trong 10 phút).
                </div>

                <div className="field">
                  <label htmlFor="otp-input">Mã OTP (6 chữ số)</label>
                  <input
                    id="otp-input"
                    type="text"
                    className="otp-input"
                    placeholder="••••••"
                    maxLength={6}
                    value={otp}
                    required
                    disabled={loading}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    autoFocus
                  />
                </div>

                {error && (
                  <p className="alarm" role="alert">
                    <b>Lỗi</b>
                    <span>{error}</span>
                  </p>
                )}

                {successMessage && (
                  <p className="success-box" role="status">
                    <b>Thành công</b>
                    <span>{successMessage}</span>
                  </p>
                )}

                <button className="go" type="submit" disabled={loading || otp.length < 6}>
                  {loading ? 'Đang xác thực…' : 'Tiếp tục đặt mật khẩu →'}
                </button>

                <div className="actions-secondary">
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => switchMode('forgot_identify')}
                    disabled={loading}
                  >
                    ← Đổi email
                  </button>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={handleResendOtp}
                    disabled={loading || countdown > 0}
                  >
                    {countdown > 0 ? `Gửi lại sau (${countdown}s)` : 'Gửi lại mã OTP'}
                  </button>
                </div>
              </form>
            )}

            {/* Bước 3: Quên mật khẩu - Nhập Mật khẩu mới */}
            {mode === 'forgot_new_pass' && (
              <form onSubmit={handleResetPasswordSubmit}>
                <div className="info-box">
                  Mã OTP hợp lệ. Vui lòng nhập mật khẩu mới (tối thiểu 6 ký tự).
                </div>

                <div className="field">
                  <label htmlFor="new-p">Mật khẩu mới</label>
                  <input
                    id="new-p"
                    type="password"
                    placeholder="Tối thiểu 6 ký tự"
                    value={newPassword}
                    required
                    disabled={loading}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="field">
                  <label htmlFor="confirm-p">Xác nhận mật khẩu mới</label>
                  <input
                    id="confirm-p"
                    type="password"
                    placeholder="Nhập lại mật khẩu mới"
                    value={confirmPassword}
                    required
                    disabled={loading}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>

                {error && (
                  <p className="alarm" role="alert">
                    <b>Lỗi</b>
                    <span>{error}</span>
                  </p>
                )}

                {successMessage && (
                  <p className="success-box" role="status">
                    <b>Thành công</b>
                    <span>{successMessage}</span>
                  </p>
                )}

                <button className="go" type="submit" disabled={loading}>
                  {loading ? 'Đang lưu…' : 'Cập nhật & Đăng nhập →'}
                </button>

                <div className="actions-secondary">
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => switchMode('login')}
                    disabled={loading}
                  >
                    ← Hủy & Về đăng nhập
                  </button>
                </div>
              </form>
            )}

            <div className="rail-ft"><span>BK-ERP-2026</span><span>Bảo mật SSL</span></div>
          </aside>

        </main>

        <footer className="bot">
          <span>© 2026 Bách Khoa ERP — Hệ thống quản trị đo vẽ &amp; pháp lý</span>
          <span>Hệ toạ độ VN-2000 · Múi 3°</span>
        </footer>

      </div>
    </div>
  );
}


