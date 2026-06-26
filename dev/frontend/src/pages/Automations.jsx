import React, { useState, useEffect } from 'react';
import { Settings, MessageSquare, ShieldAlert, Camera, Server, RefreshCw, CheckCircle, Database } from 'lucide-react';

export default function Automations() {
  // Integrations state
  const [integrations, setIntegrations] = useState({
    zalo: true,
    telegram: true,
    hanet: true,
  });

  // Workflows state
  const [workflows, setWorkflows] = useState({
    autoCreateContract: true,
    autoRemindDebt: true,
    autoExportDocx: true,
  });

  const [logs, setLogs] = useState([
    { time: '14:05:22', msg: 'Zalo: Đã gửi báo giá tự động cho khách hàng Nguyễn Văn A', type: 'info' },
    { time: '12:30:10', msg: 'System: Tự động sinh Hợp Đồng (BK-HD-2309) & Hồ sơ Đo vẽ từ CRM', type: 'success' },
    { time: '08:00:05', msg: 'Hanet: Cảnh báo nhân sự Lê Văn Dựng check-in trễ 15 phút', type: 'warning' },
    { time: '08:00:01', msg: 'System: Quét công nợ, gửi 3 tin nhắn nhắc nợ qua Zalo OA', type: 'info' },
  ]);

  const toggleIntegration = (key) => setIntegrations({ ...integrations, [key]: !integrations[key] });
  const toggleWorkflow = (key) => setWorkflows({ ...workflows, [key]: !workflows[key] });

  return (
    <section className="tab-pane active" id="tab-automations">
      
      {/* 1. Integrations */}
      <h3 style={{ fontSize: '1.2rem', marginBottom: '16px', color: 'var(--text-primary)' }}>Nền tảng Tích hợp (Integrations)</h3>
      <div className="crm-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '32px' }}>
        {/* Zalo OA */}
        <div className="card glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '10px', borderRadius: '8px', color: '#3b82f6' }}>
                <MessageSquare size={24} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem' }}>Zalo OA</h4>
                <span style={{ fontSize: '0.8rem', color: integrations.zalo ? '#10b981' : 'var(--text-tertiary)' }}>{integrations.zalo ? 'Đã kết nối' : 'Đã ngắt'}</span>
              </div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={integrations.zalo} onChange={() => toggleIntegration('zalo')} />
              <span className="slider round"></span>
            </label>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, marginBottom: '12px' }}>Gửi tin nhắn báo giá tự động, nhắc nợ, chăm sóc khách hàng.</p>
          {integrations.zalo && (
            <div style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px' }}>Zalo OA Access Token</label>
              <input type="password" value="**************-zalo-token" readOnly style={{ width: '100%', padding: '6px 8px', fontSize: '0.8rem', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '4px', color: '#64748b' }} />
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button className="btn btn-secondary btn-xs" style={{ flex: 1 }}>Cập nhật</button>
                <button className="btn btn-secondary btn-xs" style={{ flex: 1 }}>Test gửi tin</button>
              </div>
            </div>
          )}
        </div>

        {/* Telegram */}
        <div className="card glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '10px', borderRadius: '8px', color: '#8b5cf6' }}>
                <ShieldAlert size={24} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem' }}>Telegram Bot</h4>
                <span style={{ fontSize: '0.8rem', color: integrations.telegram ? '#10b981' : 'var(--text-tertiary)' }}>{integrations.telegram ? 'Đã kết nối' : 'Đã ngắt'}</span>
              </div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={integrations.telegram} onChange={() => toggleIntegration('telegram')} />
              <span className="slider round"></span>
            </label>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, marginBottom: '12px' }}>Báo cáo doanh thu, cảnh báo đi trễ, thông báo khi có Deal chốt.</p>
          {integrations.telegram && (
            <div style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px' }}>Telegram Bot Token</label>
              <input type="password" value="123456789:AAH...telegram" readOnly style={{ width: '100%', padding: '6px 8px', fontSize: '0.8rem', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '4px', color: '#64748b', marginBottom: '8px' }} />
              <label style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px' }}>Chat ID Nhóm Nội Bộ</label>
              <input type="text" value="-100987654321" readOnly style={{ width: '100%', padding: '6px 8px', fontSize: '0.8rem', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '4px', color: '#64748b' }} />
            </div>
          )}
        </div>

        {/* Hanet AI */}
        <div className="card glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '8px', color: '#ef4444' }}>
                <Camera size={24} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem' }}>Hanet Camera</h4>
                <span style={{ fontSize: '0.8rem', color: integrations.hanet ? '#10b981' : 'var(--text-tertiary)' }}>{integrations.hanet ? 'Đã kết nối' : 'Đã ngắt'}</span>
              </div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={integrations.hanet} onChange={() => toggleIntegration('hanet')} />
              <span className="slider round"></span>
            </label>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, marginBottom: '12px' }}>Nhận diện khuôn mặt, chấm công tự động, chống vân tay giả.</p>
          {integrations.hanet && (
            <div style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px' }}>Hanet Client ID</label>
              <input type="text" value="hanet-bk-2026-client" readOnly style={{ width: '100%', padding: '6px 8px', fontSize: '0.8rem', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '4px', color: '#64748b', marginBottom: '8px' }} />
              <label style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px' }}>Webhook URL nhận chấm công</label>
              <input type="text" value="https://api.nhadatbachkhoa.com/webhook/hanet" readOnly style={{ width: '100%', padding: '6px 8px', fontSize: '0.8rem', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '4px', color: '#64748b' }} />
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
        {/* 2. Workflows */}
        <div>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '16px', color: 'var(--text-primary)' }}>Luồng Tự Động (Workflows)</h3>
          <div className="card glass-card" style={{ padding: '0' }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              
              <li style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ fontSize: '0.95rem', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Server size={16} color="var(--orange-500)"/> Tạo Hồ Sơ & Hợp đồng (Khi Chốt Deal)
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>Tự động sinh mã hợp đồng và đẩy hồ sơ sang phòng Kỹ thuật khi kéo thả thẻ CRM.</p>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={workflows.autoCreateContract} onChange={() => toggleWorkflow('autoCreateContract')} />
                  <span className="slider round"></span>
                </label>
              </li>

              <li style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ fontSize: '0.95rem', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Database size={16} color="var(--orange-500)"/> Xuất file Hợp đồng Word/PDF tự động
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>Điền thông tin khách hàng vào template Hợp đồng và cho phép tải xuống file (.docx).</p>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={workflows.autoExportDocx} onChange={() => toggleWorkflow('autoExportDocx')} />
                  <span className="slider round"></span>
                </label>
              </li>

              <li style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ fontSize: '0.95rem', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RefreshCw size={16} color="var(--orange-500)"/> Tự động Quét Nhắc Nợ mỗi sáng
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>Quét công nợ khách hàng lúc 8:00 AM mỗi ngày, gửi tin nhắn nhắc nợ qua Zalo.</p>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={workflows.autoRemindDebt} onChange={() => toggleWorkflow('autoRemindDebt')} />
                  <span className="slider round"></span>
                </label>
              </li>

            </ul>
          </div>
        </div>

        {/* 3. Execution Logs */}
        <div>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '16px', color: 'var(--text-primary)' }}>Nhật Ký Hệ Thống (Terminal Logs)</h3>
          <div className="card" style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '16px', height: '100%', minHeight: '300px', overflowY: 'auto', fontFamily: 'monospace' }}>
            {logs.map((log, idx) => (
              <div key={idx} style={{ marginBottom: '8px', fontSize: '0.85rem' }}>
                <span style={{ color: '#64748b', marginRight: '8px' }}>[{log.time}]</span>
                <span style={{ 
                  color: log.type === 'success' ? '#10b981' : 
                         log.type === 'warning' ? '#f59e0b' : '#38bdf8' 
                }}>
                  {log.msg}
                </span>
              </div>
            ))}
            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontSize: '0.85rem' }}>
              <span style={{ animation: 'blink 1s step-end infinite' }}>_</span> Hệ thống đang chờ sự kiện mới...
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
