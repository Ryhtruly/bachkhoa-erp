import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
import Dashboard from './pages/Dashboard';
import CRM from './pages/CRM';
import Hoso from './pages/Hoso';
import Settings from './pages/Settings';
import Hopdong from './pages/Hopdong';
import Thuchi from './pages/Thuchi';
import Luong from './pages/Luong';
import KPI from './pages/KPI';
import Wiki from './pages/Wiki';
import Login from './pages/Login';
import ChatWidget from './components/ChatWidget';
import { ToastProvider } from './contexts/ToastContext';
import './index.css';

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');

  const handleLogin = () => setLoggedIn(true);
  const handleLogout = () => setLoggedIn(false);

  const TABS = [
    { key: 'dashboard', Component: Dashboard },
    { key: 'crm', Component: CRM },
    { key: 'hoso', Component: Hoso },
    { key: 'settings', Component: Settings },
    { key: 'hopdong', Component: Hopdong },
    { key: 'thuchi', Component: Thuchi },
    { key: 'luong', Component: Luong },
    { key: 'kpi', Component: KPI },
    { key: 'wiki', Component: Wiki },
  ];

  if (!loggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <ToastProvider>
      <div className="app">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className="main">
          <TopHeader onLogout={handleLogout} />
          {TABS.map(({ key, Component }) => (
            <div key={key} style={{ display: activeTab === key ? 'block' : 'none' }}>
              <Component />
            </div>
          ))}
        </main>
        <ChatWidget />
      </div>
    </ToastProvider>
  );
}

export default App;
