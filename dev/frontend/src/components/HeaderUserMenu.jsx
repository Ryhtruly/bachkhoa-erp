import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, LogOut, Settings, UserRound, Wallet } from 'lucide-react';
import { initialsOf, avatarColorFor, avatarUrlFor } from '../lib/avatar';
import { useDropdownPosition } from '../lib/useDropdownPosition';
import { Modal } from './ui';
import MyPayroll from '../features/employee-portal/MyPayroll';

export default function HeaderUserMenu({ user, onLogout, open, onOpenChange }) {
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [payslipOpen, setPayslipOpen] = useState(false);
  const style = useDropdownPosition(open, triggerRef, panelRef, 220);
  const name = user?.full_name || user?.username || 'Đang tải...';
  const avatarUrl = avatarUrlFor(user?.avatar_url);

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
        {avatarUrl && !avatarFailed ? (
          <img className="header-user-menu__avatar header-user-menu__avatar--img" src={avatarUrl} alt={name} onError={() => setAvatarFailed(true)} />
        ) : (
          <span className="header-user-menu__avatar" style={{ background: avatarColorFor(name) }} aria-label={`Ảnh đại diện dự phòng của ${name}`}>
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
          {user?.username !== 'admin' && (
            <button
              type="button"
              className="header-user-menu__item"
              onClick={() => {
                onOpenChange?.(false);
                setPayslipOpen(true);
              }}
            >
              <Wallet size={16} color="#10b981" /> Phiếu lương của tôi
            </button>
          )}
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

      {payslipOpen && (
        <Modal
          open={payslipOpen}
          onClose={() => setPayslipOpen(false)}
          title="Phiếu Lương Cá Nhân"
          size="md"
        >
          <MyPayroll />
        </Modal>
      )}
    </div>
  );
}
