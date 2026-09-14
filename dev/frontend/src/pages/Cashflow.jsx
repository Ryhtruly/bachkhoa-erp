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
  const [focusDebtContract, setFocusDebtContract] = useState('');

  useEffect(() => {
    if (!isDirector && ['monthly-dashboard', 'debt-collection', 'receivables', 'cashflow-settings'].includes(activeMenu)) {
      setActiveMenu('cashflow-all');
    }
  }, [activeMenu, isDirector]);

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

  useEffect(() => {
    const openDebtCollection = (event) => {
      const detail = event.detail || {};
      if (detail.tab !== 'cashflow' || detail.subTab !== 'debt-collection') return;
      setFocusDebtContract(detail.search || '');
      setActiveMenu('debt-collection');
    };
    window.addEventListener('app:navigate', openDebtCollection);
    return () => window.removeEventListener('app:navigate', openDebtCollection);
  }, []);

  const renderContent = () => {
    switch (activeMenu) {
      case 'monthly-dashboard': return isDirector
        ? <MonthlyDashboardScreen month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />
        : <CashflowScreen key="all-fallback-monthly" mode="all" month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      case 'cashflow-all': return <CashflowScreen key="all" mode="all" month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} focusVoucher={focusVoucher} />;
      case 'cashflow-cash': return <CashflowScreen key="cash" mode="cash" month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      case 'cashflow-bank': return <CashflowScreen key="bank" mode="bank" month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      case 'cashflow-print': return <PrintVoucherScreen month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      case 'debt-collection': return isDirector
        ? <DebtCollection user={user} isDirector={isDirector} initialSearch={focusDebtContract} />
        : <CashflowScreen key="all-fallback" mode="all" month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      case 'receivables': return isDirector
        ? <ReceivablesScreen user={user} isDirector={isDirector} />
        : <CashflowScreen key="all-fallback-receivables" mode="all" month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      case 'advance-request': return <AdvanceRequestScreen month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      case 'advance-clear': return <AdvanceClearScreen month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      case 'payroll-worker': return <PieceRatePayrollScreen user={user} isDirector={isDirector} />;
      case 'bang-gia': return <PieceRatePricingScreen user={user} isDirector={isDirector} />;
      case 'payroll-office': return <PayrollOfficeScreen user={user} isDirector={isDirector} />;
      case 'cashflow-settings': return isDirector ? <SettingsScreen user={user} isDirector={isDirector} /> : <CashflowScreen key="all-fallback-settings" mode="all" month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
      default: return isDirector
        ? <MonthlyDashboardScreen month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />
        : <CashflowScreen key="all-fallback-default" mode="all" month={globalMonth} setMonth={setGlobalMonth} user={user} isDirector={isDirector} />;
    }
  };

  return (
    <section className="tab-pane active" id="tab-thuchi" style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - var(--header-h) - var(--shell-gap) * 2 - 4px)', gap: '8px' }}>
      <FinanceNav
        activeTab={activeMenu}
        onSelectTab={setActiveMenu}
        user={user}
        isDirector={isDirector}
      />
      <div className="cashflow-screen-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0 2px 0 2px' }}>
        {renderContent()}
      </div>
    </section>
  );
}
