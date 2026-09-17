import React, { useState, useEffect } from 'react';
import { Menu, RefreshCw, X } from 'lucide-react';
import NotificationBell from './NotificationBell';
import HeaderUserMenu from './HeaderUserMenu';
import { applyTheme, getInitialTheme } from '../lib/theme';

export default function TopHeader({
  onLogout,
  user,
  onNotificationNavigate,
  sidebarOverlayOpen = false,
  onSidebarOverlayToggle = () => {},
}) {
  const [theme, setTheme] = useState(getInitialTheme);
  const [scrolled, setScrolled] = useState(false);
  // Chỉ 1 dropdown mở tại 1 thời điểm — mở cái mới tự đóng cái đang mở.
  const [openDropdown, setOpenDropdown] = useState(null); // 'notifications' | 'user' | null

  useEffect(() => {
    applyTheme(theme);
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
        <button
          type="button"
          className="top-header__sidebar-toggle"
          aria-label={sidebarOverlayOpen ? 'Đóng thanh điều hướng' : 'Mở thanh điều hướng'}
          aria-controls="primary-sidebar"
          aria-expanded={sidebarOverlayOpen}
          onClick={onSidebarOverlayToggle}
        >
          {sidebarOverlayOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <img
          src="/logo-full.svg"
          className="top-header__brand-logo-full"
          alt="Bách Khoa - Đo đạc - Kiến trúc - Xây dựng"
        />
        <img
          src="/logo.svg"
          className="top-header__brand-logo-collapsed"
          alt="Bách Khoa"
        />
      </div>
      <div className="header-actions top-header__actions">
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
