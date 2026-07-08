import React, { useState } from 'react';
import { SubTabs } from '../components/ui';
import {
  Receipt, Banknote, Building2,
  FileText, RotateCcw, BarChart2,
  PlusCircle, Settings
} from 'lucide-react';

// Nhập các màn hình (screens) đã được bóc tách
import MonthlyDashboardScreen from '../components/finance/screens/MonthlyDashboardScreen';
import CashflowScreen from '../components/finance/screens/CashflowScreen';
import PrintVoucherScreen from '../components/finance/screens/PrintVoucherScreen';
import AdvanceRequestScreen from '../components/finance/screens/AdvanceRequestScreen';
import AdvanceClearScreen from '../components/finance/screens/AdvanceClearScreen';
import SettingsScreen from '../components/finance/screens/SettingsScreen';
import ContractsScreen from '../components/finance/screens/ContractsScreen';
import ReceivablesScreen from '../components/finance/screens/ReceivablesScreen';
import PayablesScreen from '../components/finance/screens/PayablesScreen';
import AnalyticsScreen from '../components/finance/screens/AnalyticsScreen';

const THUCHI_TABS = [
  { id: 'monthly-dashboard', label: 'Báo Cáo', icon: <BarChart2 size={16} /> },
  { id: 'cashflow-all', label: 'Nhật Ký', icon: <Receipt size={16} /> },
  { id: 'cashflow-cash', label: 'Quỹ Tiền Mặt', icon: <Banknote size={16} /> },
  { id: 'cashflow-bank', label: 'Quỹ Ngân Hàng', icon: <Building2 size={16} /> },
  { id: 'cashflow-print', label: 'Chứng Từ', icon: <FileText size={16} /> },
  { id: 'advance-request', label: 'Tạm Ứng', icon: <PlusCircle size={16} /> },
  { id: 'advance-clear', label: 'Quyết Toán', icon: <RotateCcw size={16} /> },
  { id: 'cashflow-settings', label: 'Thiết Lập', icon: <Settings size={16} /> }
];

export default function Finance() {
  const [activeMenu, setActiveMenu] = useState('monthly-dashboard');
  const [globalMonth, setGlobalMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const renderContent = () => {
    switch (activeMenu) {
      case 'monthly-dashboard': return <MonthlyDashboardScreen month={globalMonth} setMonth={setGlobalMonth} />;
      case 'cashflow-all': return <CashflowScreen key="all" mode="all" month={globalMonth} setMonth={setGlobalMonth} />;
      case 'cashflow-cash': return <CashflowScreen key="cash" mode="cash" month={globalMonth} setMonth={setGlobalMonth} />;
      case 'cashflow-bank': return <CashflowScreen key="bank" mode="bank" month={globalMonth} setMonth={setGlobalMonth} />;
      case 'cashflow-print': return <PrintVoucherScreen month={globalMonth} setMonth={setGlobalMonth} />;
      case 'advance-request': return <AdvanceRequestScreen month={globalMonth} setMonth={setGlobalMonth} />;
      case 'advance-clear': return <AdvanceClearScreen month={globalMonth} setMonth={setGlobalMonth} />;
      case 'cashflow-settings': return <SettingsScreen />;

      // Các màn hình dưới đây đã được bóc tách và sẵn sàng để sử dụng 
      // nếu bạn muốn chuyển đổi UI sang dạng Sidebar (Phương án A)
      case 'contracts': return <ContractsScreen />;
      case 'receivables': return <ReceivablesScreen />;
      case 'payables': return <PayablesScreen />;
      case 'analytics-dashboard': return <AnalyticsScreen mode="dashboard" />;
      case 'analytics-profit': return <AnalyticsScreen mode="profit" />;

      default: return <MonthlyDashboardScreen />;
    }
  };

  return (
    <section className="tab-pane active" id="tab-thuchi" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      <SubTabs
        active={activeMenu}
        onChange={setActiveMenu}
        tabs={THUCHI_TABS}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px 24px' }}>
        {renderContent()}
      </div>
    </section>
  );
}