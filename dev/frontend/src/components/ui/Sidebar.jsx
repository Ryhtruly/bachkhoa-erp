import React from 'react';
import { LayoutDashboard, Filter, FolderKanban, FileText, Wallet, Coins, BarChart2, BookOpen, Cpu } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab }) {
  const menuItems = [
    { id: 'dashboard', label: 'Tổng Quan', icon: LayoutDashboard },
    { id: 'crm', label: 'CRM Bán Hàng', icon: Filter },
    { id: 'hoso', label: 'Hồ Sơ Đo Vẽ', icon: FolderKanban },
    { id: 'automations', label: 'Tự Động Hóa & AI', icon: Cpu },
    { id: 'hopdong', label: 'Hợp Đồng & Công Nợ', icon: FileText },
    { id: 'thuchi', label: 'Thu Chi Sổ Quỹ', icon: Wallet },
    { id: 'luong', label: 'Lương Khoán 3P', icon: Coins },
    { id: 'kpi', label: 'KPI Nhân Sự', icon: BarChart2 },
    { id: 'wiki', label: 'Đào Tạo & ISO', icon: BookOpen },
  ];

  return (
    <aside className="sidebar">
      <div className="brand" style={{ padding: '22px 16px 28px 16px', gap: '8px' }}>
        <div className="brand-logo" style={{ width: '65px', height: '65px', background: 'transparent', boxShadow: 'none', flexShrink: 0 }}>
          <img src="/src/assets/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <div className="brand-text" style={{ display: 'flex', alignItems: 'center' }}>
          <img src="/src/assets/TieuDe.png" alt="Title" style={{ height: '62px', maxWidth: '150px', objectFit: 'contain' }} />
        </div>
      </div>
      <nav className="nav">
        <div className="nav-label">Điều hướng</div>
        {menuItems.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <div className="avatar">LD</div>
        <div className="info">
          <h4>Lê Văn Dựng</h4>
          <p>Giám đốc điều hành</p>
        </div>
        <div className="status-led"></div>
      </div>
    </aside>
  );
}
