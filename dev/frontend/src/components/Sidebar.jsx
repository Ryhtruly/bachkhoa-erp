import React from 'react';
import { LayoutDashboard, Filter, FolderKanban, FileCheck, FileText, Wallet, BarChart2, BookOpen, Settings2, ChartNoAxesGantt, Users, Inbox, FileStack, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export default function Sidebar({
  activeTab,
  setActiveTab,
  mode = 'management',
  permissions = {},
  isDirector = false,
  collapsed = false,
  overlayOpen = false,
  onToggleCollapsed = () => {},
  onRequestClose = () => {},
}) {
  // `permission` = tài nguyên phải có quyền đọc thì tab mới hiện.
  // Đây chỉ là dọn giao diện cho gọn; chặn thật nằm ở từng endpoint phía server.
  const menuItems = [
    // Tổng Quan là bức tranh tài chính TOÀN CÔNG TY — việc của giám đốc.
    // Kế toán mở lên chỉ thấy doanh thu, cơ cấu chi phí, KPI: không dùng được gì.
    { id: 'dashboard', label: 'Tổng Quan', icon: LayoutDashboard, permission: 'finance', directorOnly: true },
    { id: 'crm', label: 'CRM Bán Hàng', icon: Filter, permission: 'crm' },
    { id: 'customers', label: 'Khách Hàng', icon: Users, permission: 'customer' },
    { id: 'tasks', label: 'Hồ Sơ Đo Vẽ', icon: FolderKanban, permission: 'survey_record' },
    { id: 'legal', label: 'Hồ Sơ Pháp Lý', icon: FileCheck, permission: 'legal_submission' },
    { id: 'contracts', label: 'Hợp Đồng', icon: FileText, permission: 'contract' },
    { id: 'timeline', label: 'Quản Lý Timeline', icon: ChartNoAxesGantt, directorOnly: true },
    // Mọi phiếu cần chữ ký Giám đốc gom về một chỗ — tách ra nhiều màn thì
    // phiếu nằm ở màn ít mở sẽ treo hàng tuần.
    { id: 'approvals', label: 'Hàng Chờ Duyệt', icon: Inbox, directorOnly: true },
    { id: 'doc-templates', label: 'Mẫu Giấy Tờ', icon: FileStack, directorOnly: true },
    { id: 'cashflow', label: 'Thu Chi Sổ Quỹ', icon: Wallet, permission: 'finance' },
    { id: 'kpi', label: 'KPI Nhân Sự', icon: BarChart2, permission: 'hr', directorOnly: true },
    { id: 'wiki', label: 'Nhân Sự & Đào Tạo', icon: BookOpen, permission: 'hr' },
  ];

  // Nhân viên chỉ thấy đúng phần việc của mình: lịch trình, hồ sơ của PHÒNG mình
  // (lọc theo quyền, nên đo vẽ không thấy pháp lý và ngược lại), và lương cá nhân.
  const employeeMenuItems = [
    { id: 'employee-dashboard', label: 'Lịch trình', icon: LayoutDashboard },
    { id: 'tasks', label: 'Hồ Sơ Đo Vẽ', icon: FolderKanban, permission: 'survey_record' },
    { id: 'legal', label: 'Hồ Sơ Pháp Lý', icon: FileCheck, permission: 'legal_submission' },
    { id: 'payroll', label: 'Lương', icon: Wallet },
  ];

  const visibleMenuItems = (mode === 'employee' ? employeeMenuItems : menuItems)
    .filter(item => (
      (!item.permission || permissions[item.permission])
      && (!item.directorOnly || isDirector)
    ));

  const handleSelect = (tabId) => {
    setActiveTab(tabId);
    onRequestClose();
  };

  return (
    <>
      {overlayOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Đóng thanh điều hướng"
          onClick={onRequestClose}
        />
      )}
      <aside
        id="primary-sidebar"
        className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}${overlayOpen ? ' sidebar--overlay-open' : ''}`}
        aria-label="Điều hướng chính"
      >
        <div className="sidebar__header">
          <span className="sidebar__header-label">Điều hướng</span>
          <button
            type="button"
            className="sidebar__collapse-toggle"
            aria-label={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
            aria-expanded={!collapsed}
            aria-controls="primary-sidebar"
            onClick={onToggleCollapsed}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <nav className="nav" aria-label="Các phân hệ">
          {visibleMenuItems.map(item => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                type="button"
                key={item.id}
                className={`nav-item ${active ? 'active' : ''}`}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                title={item.label}
                onClick={() => handleSelect(item.id)}
              >
                <Icon size={18} />
                <span className="nav-item__label">{item.label}</span>
              </button>
            );
          })}
          {mode === 'management' && (
            <>
              <div className="nav-label nav-label--system">Hệ thống</div>
              <button
                type="button"
                className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
                aria-label="Cấu Hình"
                aria-current={activeTab === 'settings' ? 'page' : undefined}
                title="Cấu Hình"
                onClick={() => handleSelect('settings')}
              >
                <Settings2 size={18} />
                <span className="nav-item__label">Cấu Hình</span>
              </button>
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
