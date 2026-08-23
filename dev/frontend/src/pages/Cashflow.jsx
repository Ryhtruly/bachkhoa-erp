import React, { useEffect, useState } from 'react';
import FinanceNav from '../components/finance/FinanceNav';

// Nhập các màn hình (screens) đã được bóc tách
import MonthlyDashboardScreen from '../components/finance/screens/MonthlyDashboardScreen';
import CashflowScreen from '../components/finance/screens/CashflowScreen';
import PrintVoucherScreen from '../components/finance/screens/PrintVoucherScreen';
import AdvanceRequestScreen from '../components/finance/screens/AdvanceRequestScreen';
import AdvanceClearScreen from '../components/finance/screens/AdvanceClearScreen';
import SettingsScreen from '../components/finance/screens/SettingsScreen';
import ReceivablesScreen from '../components/finance/screens/ReceivablesScreen';
import DebtCollection from './DebtCollection';
import PieceRatePayrollScreen from '../components/finance/screens/PieceRatePayrollScreen';
import PieceRatePricingScreen from '../components/finance/screens/PieceRatePricingScreen';
import PayrollOfficeScreen from '../components/finance/screens/PayrollOfficeScreen';

export default function Cashflow({ landing, user, isDirector }) {
  const [activeMenu, setActiveMenu] = useState(landing || 'monthly-dashboard');
  const [globalMonth, setGlobalMonth] = useState(() => new Date().toISOString().slice(0, 7));
  // Phiếu cần mở khi bấm thông báo "chờ duyệt" ở chuông.
  const [focusVoucher, setFocusVoucher] = useState(null);

  useEffect(() => {
    const openVoucher = (e) => {
      const voucherId = e?.detail?.voucher_id || e?.detail?.id;
      const nonce = e?.detail?.nonce || Date.now();
      if (!voucherId) return;
      setActiveMenu('cashflow-all');
      setFocusVoucher({ id: voucherId, nonce });
    };
    window.addEventListener('bachkhoa:open-cashflow-voucher', openVoucher);
    return () => window.removeEventListener('bachkhoa:open-cashflow-voucher', openVoucher);
  }, []);

  const renderContent = () => {
    switch (activeMenu) {
      case 'monthly-dashboard': return <MonthlyDashboardScreen month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      case 'cashflow-all': return <CashflowScreen key="all" mode="all" month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} focusVoucher={focusVoucher} />;
      case 'cashflow-cash': return <CashflowScreen key="cash" mode="cash" month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      case 'cashflow-bank': return <CashflowScreen key="bank" mode="bank" month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      case 'cashflow-print': return <PrintVoucherScreen month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      case 'debt-collection': return <DebtCollection user={user} isDirector={isDirector} />;
      case 'receivables': return <ReceivablesScreen user={user} isDirector={isDirector} />;
      case 'advance-request': return <AdvanceRequestScreen month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      case 'advance-clear': return <AdvanceClearScreen month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      case 'payroll-worker': return <PieceRatePayrollScreen user={user} isDirector={isDirector} />;
      case 'bang-gia': return <PieceRatePricingScreen user={user} isDirector={isDirector} />;
      case 'payroll-office': return <PayrollOfficeScreen user={user} isDirector={isDirector} />;
      case 'cashflow-settings': return isDirector ? <SettingsScreen user={user} isDirector={isDirector} /> : <MonthlyDashboardScreen month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
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