import React, { useMemo } from 'react';
import {
  BarChart2, Receipt, Banknote, Building2, FileText,
  HandCoins, PlusCircle, RotateCcw,
  Hammer, UsersRound, Settings, Wallet, Layers, Users
} from 'lucide-react';

const FINANCE_GROUPS = [
  {
    id: 'cashflow',
    label: 'Dòng tiền & sổ quỹ',
    icon: Wallet,
    color: '#eb4a23',
    bgColor: 'rgba(235, 74, 35, 0.08)',
    tabs: [
      { id: 'monthly-dashboard', label: 'Báo cáo tháng', icon: BarChart2, desc: 'Doanh số & chi phí tổng hợp' },
      { id: 'cashflow-all', label: 'Nhật ký thu chi', icon: Receipt, desc: 'Dòng tiền toàn hệ thống' },
      { id: 'cashflow-cash', label: 'Quỹ tiền mặt', icon: Banknote, desc: 'Sổ quỹ tiền mặt thực tế' },
      { id: 'cashflow-bank', label: 'Quỹ ngân hàng', icon: Building2, desc: 'Tài khoản ngân hàng' },
      { id: 'cashflow-print', label: 'Chứng từ in (Thu/Chi)', icon: FileText, desc: 'Phiếu thu/chi & TT 99/2025' },
    ]
  },
  {
    id: 'debt_advance',
    label: 'Công nợ & tạm ứng',
    icon: Layers,
    color: '#0284c7',
    bgColor: 'rgba(2, 132, 199, 0.08)',
    tabs: [
      { id: 'debt-collection', label: 'Thu công nợ', icon: HandCoins, desc: 'Quản lý thu tiền theo đợt' },
      { id: 'receivables', label: 'Công nợ phải thu', icon: Receipt, desc: 'Sổ theo dõi nợ khách hàng' },
      { id: 'advance-request', label: 'Đề xuất tạm ứng', icon: PlusCircle, desc: 'Gửi & theo dõi đề xuất tạm ứng' },
      { id: 'advance-clear', label: 'Quyết toán hoàn ứng', icon: RotateCcw, desc: 'Hoàn ứng & đối trừ chi phí' },
    ]
  },
  {
    id: 'payroll_settings',
    label: 'Lương 3P & danh mục',
    icon: Users,
    color: '#059669',
    bgColor: 'rgba(5, 150, 105, 0.08)',
    tabs: [
      { id: 'payroll-worker', label: 'Lương khoán nhiệm vụ', icon: Hammer, desc: 'Lương 3P kỹ thuật & đo đạc' },
      { id: 'bang-gia', label: 'Bảng giá khoán', icon: Banknote, desc: 'Đơn giá khoán công việc' },
      { id: 'payroll-office', label: 'Lương VP & hoa hồng', icon: UsersRound, desc: 'Bảng lương văn phòng' },
      { id: 'cashflow-settings', label: 'Thiết lập tài chính', icon: Settings, desc: 'Danh mục thu/chi & cấu hình', directorOnly: true },
    ]
  }
];

export default function FinanceNav({ activeTab, onSelectTab, isDirector }) {
  const visibleGroups = useMemo(() => {
    return FINANCE_GROUPS.map(group => {
      let filteredTabs = group.tabs;
      if (isDirector) {
        filteredTabs = filteredTabs.filter(tab => tab.id !== 'cashflow-print');
      } else {
        filteredTabs = filteredTabs.filter(tab => !tab.directorOnly);
      }
      return { ...group, tabs: filteredTabs };
    });
  }, [isDirector]);

  // Tìm nhóm cha chứa activeTab hiện tại
  const activeGroupId = useMemo(() => {
    for (const group of visibleGroups) {
      if (group.tabs.some(t => t.id === activeTab)) {
        return group.id;
      }
    }
    return visibleGroups[0].id;
  }, [activeTab, visibleGroups]);

  const activeGroup = useMemo(() => {
    return visibleGroups.find(g => g.id === activeGroupId) || visibleGroups[0];
  }, [activeGroupId, visibleGroups]);

  const handleSelectGroup = (groupId) => {
    const group = visibleGroups.find(g => g.id === groupId);
    if (group && group.tabs.length > 0) {
      // Nếu tab hiện tại không thuộc group mới, nhảy sang tab đầu tiên của group đó
      const isCurrentInGroup = group.tabs.some(t => t.id === activeTab);
      if (!isCurrentInGroup) {
        onSelectTab(group.tabs[0].id);
      }
    }
  };

  return (
    <div className="finance-grouped-nav-container" style={{
      background: 'var(--bg-card)',
      borderRadius: '14px',
      border: '1px solid var(--border-default)',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
      padding: '12px 16px',
      marginBottom: 0
    }}>
      {/* ── Hàng 1: 3 Nhóm Chính (Group Switcher) ── */}
      <div
        className="finance-grouped-nav__groups"
        role="region"
        aria-label="Nhóm phân hệ tài chính"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--border-subtle)',
          overflowX: 'auto',
          scrollbarWidth: 'none'
        }}
      >
        <span style={{
          fontSize: '0.76rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--text-tertiary)',
          whiteSpace: 'nowrap',
          marginRight: '4px'
        }}>
          Phân hệ:
        </span>

        {visibleGroups.map((group) => {
          const GroupIcon = group.icon;
          const isSelected = activeGroupId === group.id;
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => handleSelectGroup(group.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 14px',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontWeight: isSelected ? 700 : 600,
                color: isSelected ? group.color : 'var(--text-secondary)',
                backgroundColor: isSelected ? group.bgColor : 'var(--bg-surface)',
                border: isSelected ? `1.5px solid ${group.color}60` : '1px solid var(--border-default)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
                boxShadow: isSelected ? `0 2px 8px ${group.color}20` : 'none'
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = 'var(--bg-card-hover, rgba(148, 163, 184, 0.12))';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
            >
              <GroupIcon size={16} color={isSelected ? group.color : 'var(--text-tertiary)'} />
              <span>{group.label}</span>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: '99px',
                backgroundColor: isSelected ? group.color : 'var(--border-hover)',
                color: '#ffffff'
              }}>
                {group.tabs.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Hàng 2: Các Tab Con Của Nhóm Đang Chọn (Pill Subtabs) ── */}
      <div
        className="finance-grouped-nav__tabs"
        role="region"
        aria-label="Các màn hình tài chính"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          paddingTop: '12px',
          overflowX: 'auto',
          scrollbarWidth: 'thin'
        }}
      >
        {activeGroup.tabs.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '999px',
                fontSize: '0.85rem',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? '#ffffff' : 'var(--text-secondary)',
                backgroundColor: isActive ? 'var(--orange-500)' : 'transparent',
                border: isActive ? '1px solid var(--orange-600)' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                whiteSpace: 'nowrap',
                boxShadow: isActive ? '0 3px 10px rgba(235, 74, 35, 0.25)' : 'none'
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                  e.currentTarget.style.border = '1px solid var(--border-subtle)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                  e.currentTarget.style.border = '1px solid transparent';
                }
              }}
            >
              <TabIcon size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
