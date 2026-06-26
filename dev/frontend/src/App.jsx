import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
import Dashboard from './pages/Dashboard';
import CRM from './pages/CRM';
import Hoso from './pages/Hoso';
import Automations from './pages/Automations';
import Hopdong from './pages/Hopdong';
import Thuchi from './pages/Thuchi';
import Luong from './pages/Luong';
import KPI from './pages/KPI';
import Wiki from './pages/Wiki';
import { ToastProvider } from './contexts/ToastContext';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'crm':
        return <CRM />;
      case 'hoso':
        return <Hoso />;
      case 'automations':
        return <Automations />;
      case 'hopdong':
        return <Hopdong />;
      case 'thuchi':
        return <Thuchi />;
      case 'luong':
        return <Luong />;
      case 'kpi':
        return <KPI />;
      case 'wiki':
        return <Wiki />;
      // Other tabs will be added here
      default:
        return <div className="tab-pane active"><h2 style={{padding:'24px'}}>Tính năng đang được chuyển đổi...</h2></div>;
    }
  };

  return (
    <ToastProvider>
      <div className="app">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className="main">
          <TopHeader />
          {renderTab()}
        </main>
      </div>
    </ToastProvider>
  );
}

export default App;
