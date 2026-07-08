import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Bot, User, Trash2 } from 'lucide-react';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('chatbot_history');
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse chat history');
      }
    } else {
      // Initial greeting
      setMessages([
        { role: 'assistant', content: 'Xin chào! Tôi là trợ lý AI nội bộ. Bạn có câu hỏi gì về quy trình, thông tin công ty cần hỗ trợ không?' }
      ]);
    }
  }, []);

  // Save to localStorage when messages change
  useEffect(() => {
    localStorage.setItem('chatbot_history', JSON.stringify(messages));
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const clearHistory = () => {
    const initial = [{ role: 'assistant', content: 'Xin chào! Tôi là trợ lý AI nội bộ. Bạn có câu hỏi gì về quy trình, thông tin công ty cần hỗ trợ không?' }];
    setMessages(initial);
    localStorage.setItem('chatbot_history', JSON.stringify(initial));
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    
    // Add user message to state
    const newMessages = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // Prepare history for API (map to expected format)
      // Usually the backend expects role and content
      const apiHistory = newMessages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: apiHistory })
      });

      const data = await res.json();
      
      if (res.ok && data.status === 'success') {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Xin lỗi, đã xảy ra lỗi hệ thống hoặc chưa cấu hình API Key.' }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Lỗi kết nối tới máy chủ. Vui lòng kiểm tra mạng.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button 
        onClick={() => setIsOpen(true)}
        className="btn btn-primary"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          display: isOpen ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 9999,
          padding: 0
        }}
      >
        <MessageCircle size={28} />
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '360px',
          height: '500px',
          backgroundColor: 'var(--bg-card)',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 9999,
          border: '1px solid var(--border-subtle)',
          overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            padding: '16px',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bot color="var(--blue-500)" size={20} />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Trợ lý Nội bộ</h3>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={clearHistory}
                title="Xóa lịch sử trò chuyện"
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '4px' }}
              >
                <Trash2 size={16} />
              </button>
              <button 
                onClick={() => setIsOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div style={{
            flex: 1,
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                alignItems: 'flex-start',
                gap: '8px'
              }}>
                {msg.role === 'assistant' && (
                  <div style={{ background: 'var(--bg-card-hover)', padding: '6px', borderRadius: '50%', flexShrink: 0 }}>
                    <Bot size={16} color="var(--blue-400)" />
                  </div>
                )}
                <div style={{
                  maxWidth: '75%',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  backgroundColor: msg.role === 'user' ? 'var(--blue-600)' : 'rgba(255,255,255,0.05)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                  fontSize: '0.9rem',
                  lineHeight: 1.4,
                  whiteSpace: 'pre-wrap',
                  border: msg.role === 'user' ? 'none' : '1px solid var(--border-subtle)'
                }}>
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '6px', borderRadius: '50%', flexShrink: 0 }}>
                    <User size={16} color="var(--blue-400)" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--text-tertiary)' }}>
                <Bot size={16} />
                <span style={{ fontSize: '0.85rem' }}>Đang phản hồi...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSend} style={{
            padding: '12px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            gap: '8px',
            backgroundColor: 'var(--bg-card-hover)'
          }}>
            <input 
              type="text" 
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Nhập câu hỏi của bạn..."
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '20px',
                border: '1px solid var(--border-subtle)',
                background: 'rgba(255,255,255,0.03)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
            <button 
              type="submit" 
              disabled={isLoading || !input.trim()}
              className="btn btn-primary"
              style={{ borderRadius: '50%', width: '40px', height: '40px', padding: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
