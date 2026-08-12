import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, LogOut, Settings, UserRound } from 'lucide-react';
import { initialsOf, avatarColorFor } from '../lib/avatar';
import { useDropdownPosition } from '../lib/useDropdownPosition';

export default function HeaderUserMenu({ user, onLogout, open, onOpenChange }) {
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const style = useDropdownPosition(open, triggerRef, panelRef, 220);
  const name = user?.full_name || user?.username || 'Đang tải...';

  useEffect(() => {
    if (!open) return undefined;
    const handleOutsideClick = (event) => {
      if (
        !triggerRef.current?.contains(event.target)
        && !panelRef.current?.contains(event.target)
      ) onOpenChange?.(false);
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [open, onOpenChange]);

  return (
    <div className="header-user-menu">
      <button ref={triggerRef} type="button" className="header-user-menu__trigger" onClick={() => onOpenChange?.(!open)}>
        {/* Có ảnh thật thì dùng ảnh; chữ cái đầu chỉ là phương án dự phòng. */}
        {user?.avatar_url ? (
          <img className="header-user-menu__avatar header-user-menu__avatar--img" src={user.avatar_url} alt={name} />
        ) : (
          <span className="header-user-menu__avatar" style={{ background: avatarColorFor(name) }}>
            {initialsOf(name)}
          </span>
        )}
        <span className="header-user-menu__name">{name}</span>
        <ChevronDown size={15} className={`header-user-menu__chevron${open ? ' open' : ''}`} />
      </button>

      {open && createPortal(
        <div className="header-user-menu__panel" ref={panelRef} style={style || { visibility: 'hidden' }}>
          <div className="header-user-menu__identity">
            <strong>{name}</strong>
            <span>{user?.email || 'Chưa có email'}</span>
          </div>
          <button type="button" className="header-user-menu__item" disabled title="Chưa có chức năng">
            <UserRound size={16} /> Hồ sơ cá nhân
          </button>
          <button type="button" className="header-user-menu__item" disabled title="Chưa có chức năng">
            <Settings size={16} /> Cài đặt tài khoản
          </button>
          <button type="button" className="header-user-menu__item header-user-menu__item--danger" onClick={onLogout}>
            <LogOut size={16} /> Đăng xuất
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
