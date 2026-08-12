import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import NotificationBell from './NotificationBell';
import HeaderUserMenu from './HeaderUserMenu';

export default function TopHeader({ onLogout, user, onNotificationNavigate }) {
  const [theme, setTheme] = useState('light');
  const [scrolled, setScrolled] = useState(false);
  // Chỉ 1 dropdown mở tại 1 thời điểm — mở cái mới tự đóng cái đang mở.
  const [openDropdown, setOpenDropdown] = useState(null); // 'notifications' | 'user' | null

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 4);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <header className={`top-header${scrolled ? ' top-header--scrolled' : ''}`}>
      <div className="top-header__brand">
        <img src="/src/assets/logo.png" alt="Logo" className="top-header__brand-logo" />
        <img src="/src/assets/TieuDe.png" alt="Bách Khoa" className="top-header__brand-title" />
      </div>
      <div className="header-actions">
        <button className="btn btn-secondary btn-icon btn-sm" onClick={() => window.location.reload()} title="Làm mới">
          <RefreshCw size={16} />
        </button>
        <div className="header-actions__cluster">
          <button className="btn btn-secondary btn-icon btn-sm" onClick={toggleTheme} title="Đổi giao diện">
            {theme === 'light' ? <span style={{ fontSize: '16px' }}>🌙</span> : <span style={{ fontSize: '16px' }}>☀️</span>}
          </button>
          <NotificationBell
            open={openDropdown === 'notifications'}
            onOpenChange={(next) => setOpenDropdown(next ? 'notifications' : null)}
            onNavigate={onNotificationNavigate}
          />
        </div>
        <div className="header-actions__divider" />
        <HeaderUserMenu
          user={user}
          onLogout={onLogout}
          open={openDropdown === 'user'}
          onOpenChange={(next) => setOpenDropdown(next ? 'user' : null)}
        />
      </div>
    </header>
  );
}
