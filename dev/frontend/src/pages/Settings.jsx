import React, { useState, useEffect } from 'react';
import { Save, CheckCircle, XCircle, Loader, FileText, MessageSquare, Brain, Camera, ChevronDown, ChevronRight, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

const API_BASE = '/api';

const FIELD_GROUPS = [
  {
    id: 'file_export',
    label: 'Nhóm Xuất File (Báo giá, Hợp đồng)',
    icon: FileText,
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.1)',
    tasks: 'STT1: Báo giá PDF · STT2: Báo giá ISO + Google Sheet · STT3: Hợp đồng từ MST · STT4: Hợp đồng Word/PDF',
    fields: [
      { key: 'google_sheets_service_account', label: 'Google Sheets Service Account JSON', type: 'textarea', placeholder: '{ "type": "service_account", "project_id": "...", ... }', hint: 'Tạo tại: console.cloud.google.com → IAM → Service Accounts → Tạo key JSON', testKey: 'google_sheets' },
      { key: 'google_docs_template_id', label: 'Google Docs Template ID (Hợp đồng)', type: 'text', placeholder: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms', hint: 'Lấy từ URL Google Docs: /d/{ID}/edit' },
      { key: 'vietqr_api_key', label: 'VietQR / Tra MST API Key', type: 'password', placeholder: 'vietqr_live_...', hint: 'Đăng ký miễn phí tại: vietqr.io — Dùng để tra thông tin doanh nghiệp từ mã số thuế', testKey: 'vietqr' },
    ]
  },
  {
    id: 'notification',
    label: 'Nhóm Thông báo & Chăm sóc (Zalo, Telegram)',
    icon: MessageSquare,
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.1)',
    tasks: 'STT6: CSKH tự động · STT7: Báo cáo CEO · STT16: Bot Zalo tiếp nhận khách',
    fields: [
      { key: 'zalo_app_id', label: 'Zalo OA App ID', type: 'text', placeholder: '123456789', hint: 'Lấy tại: developers.zalo.me → Official Account' },
      { key: 'zalo_app_secret', label: 'Zalo OA App Secret', type: 'password', placeholder: 'abc123xyz...', hint: 'Trong phần Thông tin ứng dụng của Zalo Developer' },
      { key: 'zalo_oa_token', label: 'Zalo OA Access Token', type: 'password', placeholder: 'zalo_access_token_...', hint: 'Access Token (hết hạn 3 tháng, cần refresh định kỳ)', testKey: 'zalo' },
      { key: 'telegram_bot_token', label: 'Telegram Bot Token', type: 'password', placeholder: '123456789:AAH-abcdefgh...', hint: 'Tạo bot tại: t.me/BotFather → /newbot', testKey: 'telegram' },
      { key: 'telegram_chat_id', label: 'Telegram Chat ID (Nhóm nội bộ)', type: 'text', placeholder: '-100123456789', hint: 'Lấy từ t.me/getidsbot sau khi thêm bot vào nhóm' },
    ]
  },
  {
    id: 'ai',
    label: 'Nhóm AI & Call Center',
    icon: Brain,
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.1)',
    tasks: 'STT8: Tổng đài AI Call Center · STT14: Tra quy hoạch AI',
    fields: [
      { key: 'gemini_api_key', label: 'Google Gemini API Key', type: 'password', placeholder: 'AIzaSy...', hint: 'Tạo tại: aistudio.google.com → Get API Key. Dùng cho phân tích quy hoạch PDF.', testKey: 'gemini' },
      { key: 'stringee_api_key_sid', label: 'Stringee API Key SID (Call Center)', type: 'text', placeholder: 'SK.0.xxx...', hint: 'Tạo tại: developer.stringee.com → API Keys. Stringee hỗ trợ số VN, tích hợp AI.' },
      { key: 'stringee_api_key_secret', label: 'Stringee API Key Secret', type: 'password', placeholder: 'xxx...', hint: 'Lấy cùng lúc với SID', testKey: 'stringee' },
      { key: 'chatbot_kb_sheet_id', label: 'ID Google Sheet (Knowledge Base)', type: 'text', placeholder: '1BxiM...', hint: 'Sheet chứa cơ sở tri thức cho Chatbot nội bộ. Cần nhập JSON Service Account ở Nhóm Xuất File.' },
      { key: 'chatbot_llm_provider', label: 'Nhà cung cấp Chatbot AI', type: 'text', placeholder: 'gemini hoặc deepseek', hint: 'Gõ "gemini" hoặc "deepseek"' },
      { key: 'chatbot_llm_api_key', label: 'API Key Chatbot (Tùy chọn)', type: 'password', placeholder: 'sk-...', hint: 'Nếu để trống sẽ dùng chung API Key Gemini ở trên.' },
    ]
  },
  {
    id: 'attendance',
    label: 'Chấm công Tự động (Camera Hanet)',
    icon: Camera,
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.1)',
    tasks: 'STT19: Nhận diện khuôn mặt → Ghi chấm công → Tính lương',
    fields: [
      { key: 'hanet_client_id', label: 'Hanet Client ID', type: 'text', placeholder: 'hanet_client_...', hint: 'Lấy tại: dashboard.hanet.ai → Settings → API' },
      { key: 'hanet_client_secret', label: 'Hanet Client Secret', type: 'password', placeholder: 'hanet_secret_...', hint: 'Trong phần App Credentials của Hanet Dashboard', testKey: 'hanet' },
      {
        key: 'hanet_webhook_url',
        label: 'Webhook URL (Dán vào Hanet Dashboard)',
        type: 'readonly',
        value: `${window.location.origin.replace(':5173', ':8080')}/webhook/hanet`,
        hint: 'Copy URL này và dán vào Hanet Dashboard → Settings → Webhook để nhận sự kiện chấm công'
      },
    ]
  }
];

function TestButton({ groupId, fieldKey, settings, onResult }) {
  const [status, setStatus] = useState('idle'); // idle | loading | ok | fail

  const handleTest = async () => {
    setStatus('loading');
    try {
      const res = await fetch(`${API_BASE}/settings/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: fieldKey, settings })
      });
      const data = await res.json();
      setStatus(data.ok ? 'ok' : 'fail');
      onResult(data.ok, data.message || '');
    } catch {
      setStatus('fail');
      onResult(false, 'Lỗi kết nối tới server');
    }
    setTimeout(() => setStatus('idle'), 4000);
  };

  return (
    <button
      onClick={handleTest}
      disabled={status === 'loading'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '5px 12px', fontSize: '0.78rem', borderRadius: '6px',
        border: '1px solid var(--border-subtle)',
        background: status === 'ok' ? 'rgba(16,185,129,0.15)' : status === 'fail' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)',
        color: status === 'ok' ? '#10b981' : status === 'fail' ? '#ef4444' : 'var(--text-secondary)',
        cursor: status === 'loading' ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
      }}
    >
      {status === 'loading' && <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />}
      {status === 'ok' && <CheckCircle size={12} />}
      {status === 'fail' && <XCircle size={12} />}
      {status === 'idle' && <CheckCircle size={12} />}
      {status === 'loading' ? 'Đang kiểm tra...' : status === 'ok' ? 'Kết nối OK' : status === 'fail' ? 'Thất bại' : 'Test kết nối'}
    </button>
  );
}

function FieldInput({ field, value, onChange }) {
  const [show, setShow] = useState(false);

  if (field.type === 'readonly') {
    return (
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          readOnly
          value={field.value}
          style={{
            flex: 1, padding: '8px 12px', fontSize: '0.85rem', borderRadius: '6px',
            border: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.03)',
            color: 'var(--text-secondary)', fontFamily: 'monospace',
          }}
        />
        <button
          onClick={() => { navigator.clipboard.writeText(field.value); }}
          style={{ padding: '8px 12px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', cursor: 'pointer' }}
        >
          Copy
        </button>
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <textarea
        value={value || ''}
        onChange={e => onChange(field.key, e.target.value)}
        placeholder={field.placeholder}
        rows={4}
        style={{
          width: '100%', padding: '8px 12px', fontSize: '0.82rem', borderRadius: '6px',
          border: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.03)',
          color: 'var(--text-primary)', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box',
        }}
      />
    );
  }

  const isPassword = field.type === 'password';
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={isPassword && !show ? 'password' : 'text'}
        value={value || ''}
        onChange={e => onChange(field.key, e.target.value)}
        placeholder={field.placeholder}
        style={{
          width: '100%', padding: '8px 36px 8px 12px', fontSize: '0.85rem', borderRadius: '6px',
          border: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.03)',
          color: 'var(--text-primary)', boxSizing: 'border-box',
        }}
      />
      {isPassword && (
        <button
          onClick={() => setShow(!show)}
          style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 0 }}
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
    </div>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const { showToast } = useToast();

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/settings`);
      const data = await res.json();
      if (data.status === 'success' && data.data) setSettings(data.data);
    } catch { /* silent */ }
  };

  const handleChange = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  const handleSave = async (groupFields) => {
    setSaving(true);
    try {
      const keys = groupFields.filter(f => f.type !== 'readonly').map(f => f.key);
      const payload = keys.map(key => ({ key, value: settings[key] || '', description: `Config: ${key}` }));
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.status === 'success') showToast('Đã lưu cấu hình!', 'success');
      else showToast('Lỗi khi lưu.', 'error');
    } catch { showToast('Lỗi kết nối server.', 'error'); }
    finally { setSaving(false); }
  };

  const toggleGroup = (id) => setCollapsed(c => ({ ...c, [id]: !c[id] }));

  return (
    <section className="tab-pane active" id="tab-settings">
      <div style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Cấu Hình Tích Hợp</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '4px' }}>
          Nhập API Key / Token cho từng nhóm tự động hóa. Dữ liệu được mã hóa và lưu vào database.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {FIELD_GROUPS.map(group => {
          const Icon = group.icon;
          const isOpen = !collapsed[group.id];
          return (
            <div key={group.id} className="card glass-card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Group Header */}
              <div
                onClick={() => toggleGroup(group.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px', padding: '18px 24px',
                  cursor: 'pointer', borderBottom: isOpen ? '1px solid var(--border-subtle)' : 'none',
                  userSelect: 'none',
                }}
              >
                <div style={{ background: group.bg, padding: '10px', borderRadius: '10px', color: group.color, flexShrink: 0 }}>
                  <Icon size={20} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.97rem', color: 'var(--text-primary)' }}>{group.label}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>{group.tasks}</div>
                </div>
                {isOpen ? <ChevronDown size={18} color="var(--text-tertiary)" /> : <ChevronRight size={18} color="var(--text-tertiary)" />}
              </div>

              {/* Fields */}
              {isOpen && (
                <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {group.fields.map(field => (
                    <div key={field.key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{field.label}</label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          {field.testKey && (
                            <TestButton
                              groupId={group.id}
                              fieldKey={field.testKey}
                              settings={settings}
                              onResult={(ok, msg) => ok ? showToast(`✅ ${msg || 'Kết nối thành công!'}`, 'success') : showToast(`❌ ${msg || 'Kết nối thất bại'}`, 'error')}
                            />
                          )}
                        </div>
                      </div>
                      <FieldInput field={field} value={settings[field.key]} onChange={handleChange} />
                      {field.hint && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '5px', display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                          <ExternalLink size={11} style={{ flexShrink: 0, marginTop: '2px' }} />
                          {field.hint}
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                    <button
                      onClick={() => handleSave(group.fields)}
                      disabled={saving}
                      className="btn btn-primary"
                      style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <Save size={15} />
                      {saving ? 'Đang lưu...' : 'Lưu nhóm này'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </section>
  );
}
