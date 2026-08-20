import React, { useEffect, useState } from 'react';
import './login.css';
import loginLogo from '../assets/TieuDe.png';
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

const TEN_DA_NHO = 'bachkhoa_login_username';

export default function Login({ onLogin }) {
  // Không điền sẵn tài khoản nào. Chỉ khôi phục tên mà chính người dùng đã chọn
  // ghi nhớ ở lần đăng nhập trước.
  const [username, setUsername] = useState(() => localStorage.getItem(TEN_DA_NHO) || '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => Boolean(localStorage.getItem(TEN_DA_NHO)));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Không thể đăng nhập');
      if (remember) localStorage.setItem(TEN_DA_NHO, username.trim());
      else localStorage.removeItem(TEN_DA_NHO);
      onLogin(payload.token, payload.user);
    } catch (loginError) {
      setError(loginError.message === 'Failed to fetch'
        ? 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'
        : loginError.message);
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
            <div className="rail-hd">
              <span className="num">01</span>
              <div><h2>Đăng nhập</h2><p>Khung xác thực hệ thống</p></div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="u">Tài khoản</label>
                <input id="u" type="text" value={username} autoComplete="username" required
                  disabled={loading} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="p">Mật khẩu</label>
                <input id="p" type="password" placeholder="••••••••" autoComplete="current-password"
                  required disabled={loading} value={password}
                  onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="row">
                <label className="check">
                  <input type="checkbox" checked={remember} disabled={loading}
                    onChange={(e) => setRemember(e.target.checked)} />
                  <i className="box" />Ghi nhớ
                </label>
                <a href="#">Quên mật khẩu?</a>
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
