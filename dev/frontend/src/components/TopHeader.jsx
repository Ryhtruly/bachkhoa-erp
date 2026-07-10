import React, { useState, useEffect } from 'react';
import { RefreshCw, LogOut } from 'lucide-react';

export default function TopHeader({ onLogout }) {
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const days = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
      setTimeStr(`${days[d.getDay()]}, ${d.getDate()} Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000 * 60);
    return () => clearInterval(interval);
  }, []);

  const [theme, setTheme] = useState('light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <header className="top-header">
      <div>
        <h1>Hệ Thống Tự Động Hóa Nghiệp Vụ</h1>
        <div className="sub">{timeStr}</div>
      </div>
      <div className="header-actions">
        <button className="btn btn-secondary btn-icon btn-sm" onClick={toggleTheme} title="Đổi giao diện">
          {theme === 'light' ? <span style={{fontSize: '16px'}}>🌙</span> : <span style={{fontSize: '16px'}}>☀️</span>}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>
          <RefreshCw size={16} /> Làm mới
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onLogout} title="Đăng xuất">
          <LogOut size={16} /> Thoát
        </button>
        <div className="flex-center" style={{ gap: '6px', fontSize: '0.75rem', color: 'var(--text-tertiary)', padding: '0 8px' }}>
          <span className="status-led" style={{ width: '6px', height: '6px' }}></span>
          Excel Master
        </div>
      </div>
    </header>
  );
}
