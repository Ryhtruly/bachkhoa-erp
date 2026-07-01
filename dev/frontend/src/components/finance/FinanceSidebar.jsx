import React, { useState } from 'react';
import {
  Wallet, ChevronRight, Receipt, Banknote, Building2,
  FileText, ArrowDownLeft, ArrowUpRight,
  Clock, RotateCcw, BarChart2, TrendingUp,
  PlusCircle, DollarSign
} from 'lucide-react';

// ── Menu Config ───────────────────────────────────────────────────────────────
export const MENU = [
  {
    id: 'cashflow', label: 'Quản Lý Dòng Tiền', icon: Wallet,
    children: [
      { id: 'cashflow-all', label: 'Nhật Ký Thu Chi', icon: Receipt },
      { id: 'cashflow-cash', label: 'Quỹ Tiền Mặt', icon: Banknote },
      { id: 'cashflow-bank', label: 'Tài Khoản Ngân Hàng', icon: Building2 },
      { id: 'cashflow-print', label: 'Chứng từ Thu / Chi', icon: FileText },
    ]
  },
  {
    id: 'invoices', label: 'Chứng Từ & Công Nợ', icon: FileText,
    children: [
      { id: 'contracts', label: 'Hợp Đồng & Hóa Đơn', icon: FileText },
      { id: 'receivables', label: 'Công Nợ Phải Thu', icon: ArrowUpRight },
      { id: 'payables', label: 'Công Nợ Phải Trả', icon: ArrowDownLeft }
    ]
  },
  {
    id: 'advance', label: 'Chi Phí Tạm Ứng', icon: Clock,
    children: [
      { id: 'advance-request', label: 'Đề Xuất Tạm Ứng', icon: PlusCircle },
      { id: 'advance-clear', label: 'Quyết Toán Hoàn Ứng', icon: RotateCcw }
    ]
  },
  {
    id: 'analytics', label: 'Báo Cáo & Lợi Nhuận', icon: BarChart2,
    children: [
      { id: 'analytics-dashboard', label: 'Biểu Đồ Xu Hướng', icon: TrendingUp },
      { id: 'analytics-profit', label: 'Lợi Nhuận Dự Án', icon: DollarSign }
    ]
  }
];

export default function FinanceSidebar({ active, onSelect }) {
  const [open, setOpen] = useState({ cashflow: true, invoices: true, advance: false, payroll: false, analytics: false });

  const toggle = (id) => setOpen(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <aside className="finance-subnav">
      {MENU.map(group => {
        const GroupIcon = group.icon;
        const isOpen = open[group.id];
        return (
          <div key={group.id} className="finance-subnav-section">
            <div
              className={`finance-subnav-group ${isOpen ? 'open' : ''}`}
              onClick={() => toggle(group.id)}
            >
              <GroupIcon size={14} />
              <span>{group.label}</span>
              <ChevronRight size={13} className="finance-subnav-chevron" />
            </div>
            <div className={`finance-subnav-children ${isOpen ? 'open' : ''}`}>
              {group.children.map(item => {
                const ItemIcon = item.icon;
                return (
                  <div
                    key={item.id}
                    className={`finance-subnav-item ${active === item.id ? 'active' : ''}`}
                    onClick={() => onSelect(item.id)}
                  >
                    <ItemIcon size={13} />
                    {item.label}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </aside>
  );
}
