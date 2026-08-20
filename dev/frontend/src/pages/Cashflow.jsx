import React, { useEffect, useState } from 'react';
import FinanceNav from '../components/finance/FinanceNav';

// Nhập các màn hình (screens) đã được bóc tách
import MonthlyDashboardScreen from '../components/finance/screens/MonthlyDashboardScreen';
import CashflowScreen from '../components/finance/screens/CashflowScreen';
import PrintVoucherScreen from '../components/finance/screens/PrintVoucherScreen';
import AdvanceRequestScreen from '../components/finance/screens/AdvanceRequestScreen';
import AdvanceClearScreen from '../components/finance/screens/AdvanceClearScreen';
import SettingsScreen from '../components/finance/screens/SettingsScreen';
import ContractsScreen from '../components/finance/screens/ContractsScreen';
import ReceivablesScreen from '../components/finance/screens/ReceivablesScreen';
import DebtCollection from './DebtCollection';
import PayablesScreen from '../components/finance/screens/PayablesScreen';
import AnalyticsScreen from '../components/finance/screens/AnalyticsScreen';
import LuongKhoan3PScreen from '../components/finance/screens/LuongKhoan3PScreen';
import BangGiaKhoanScreen from '../components/finance/screens/BangGiaKhoanScreen';
import PayrollOfficeScreen from '../components/finance/screens/PayrollOfficeScreen';

export default function Cashflow({ landing, user, isDirector }) {
  const [activeMenu, setActiveMenu] = useState(landing || 'monthly-dashboard');
  const [globalMonth, setGlobalMonth] = useState(() => new Date().toISOString().slice(0, 7));
  // Phiếu cần mở khi bấm thông báo "chờ duyệt" ở chuông.
  const [focusVoucher, setFocusVoucher] = useState(null);

  useEffect(() => {
    const moPhieu = (event) => {
      const { voucherId, nonce } = event.detail || {};
      if (!voucherId) return;
      setActiveMenu('cashflow-all');
      setFocusVoucher({ id: voucherId, nonce });
    };
    window.addEventListener('bachkhoa:open-cashflow-voucher', moPhieu);
    return () => window.removeEventListener('bachkhoa:open-cashflow-voucher', moPhieu);
  }, []);

  const renderContent = () => {
    switch (activeMenu) {
      case 'monthly-dashboard': return <MonthlyDashboardScreen month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      case 'cashflow-all': return <CashflowScreen key="all" mode="all" month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} focusVoucher={focusVoucher} />;
      case 'cashflow-cash': return <CashflowScreen key="cash" mode="cash" month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      case 'cashflow-bank': return <CashflowScreen key="bank" mode="bank" month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      case 'cashflow-print': return <PrintVoucherScreen month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      case 'debt-collection': return <DebtCollection user={user} isDirector={isDirector} />;
      case 'advance-request': return <AdvanceRequestScreen month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      case 'advance-clear': return <AdvanceClearScreen month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      case 'cashflow-settings': return <SettingsScreen user={user} isDirector={isDirector} />;
      case 'payroll-worker': return <LuongKhoan3PScreen user={user} isDirector={isDirector} />;
      case 'bang-gia': return <BangGiaKhoanScreen user={user} isDirector={isDirector} />;
      case 'payroll-office': return <PayrollOfficeScreen user={user} isDirector={isDirector} />;

      case 'contracts': return <ContractsScreen user={user} isDirector={isDirector} />;
      case 'receivables': return <ReceivablesScreen user={user} isDirector={isDirector} />;
      case 'payables': return <PayablesScreen user={user} isDirector={isDirector} />;
      case 'analytics-dashboard': return <AnalyticsScreen mode="dashboard" user={user} isDirector={isDirector} />;
      case 'analytics-profit': return <AnalyticsScreen mode="profit" user={user} isDirector={isDirector} />;

      default: return <MonthlyDashboardScreen month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
    }
  };

  return (
    <section className="tab-pane active" id="tab-thuchi" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '14px' }}>
      <FinanceNav
        activeTab={activeMenu}
        onSelectTab={setActiveMenu}
        user={user}
        isDirector={isDirector}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px 24px 4px' }}>
        {renderContent()}
      </div>
    </section>
  );
}