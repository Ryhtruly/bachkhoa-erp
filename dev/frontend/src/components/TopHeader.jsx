import React, { useState, useEffect } from 'react';
import { RefreshCw, LogOut } from 'lucide-react';

export default function TopHeader({ onLogout }) {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <header className="top-header top-header--compact">
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
