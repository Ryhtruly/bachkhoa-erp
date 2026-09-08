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
        <svg
          className="top-header__brand-logo-svg"
          width="32"
          height="32"
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="bkPillarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffbe0b" />
              <stop offset="35%" stopColor="#fb5607" />
              <stop offset="100%" stopColor="#eb4a23" />
            </linearGradient>
            <linearGradient id="bkMonogramGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff5400" />
              <stop offset="100%" stopColor="#c1121f" />
            </linearGradient>
          </defs>
          {/* Trụ tháp trái vát góc */}
          <path d="M20 32 L38 12 V86 H20 Z" fill="url(#bkPillarGrad)" />
          {/* Biểu tượng chữ b kiến trúc & góc lượn */}
          <path
            d="M44 26 L62 44 L84 66 C91 73 89 86 76 86 H44 V26 Z M58 60 L72 74 H58 V60 Z"
            fill="url(#bkMonogramGrad)"
          />
        </svg>
        <div className="top-header__brand-text">
          <div className="top-header__brand-name">
            <span>BÁCH KH</span>
            <svg className="top-header__brand-crosshair" viewBox="0 0 24 24" width="14" height="14">
              <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
              <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <line x1="12" y1="1" x2="12" y2="23" stroke="currentColor" strokeWidth="1.6" />
              <line x1="1" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <span>A</span>
          </div>
          <div className="top-header__brand-line" />
          <div className="top-header__brand-sub">ĐO ĐẠC - KIẾN TRÚC - XÂY DỰNG</div>
        </div>
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
