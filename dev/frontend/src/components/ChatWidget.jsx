import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Bot, User, Trash2 } from 'lucide-react';

const CHAT_BUTTON_SIZE = 56;
const CHAT_WINDOW_SIZE = { width: 360, height: 500 };
const CHAT_EDGE_GAP = 16;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getViewportSize = () => ({
  width: typeof window === 'undefined' ? 1280 : window.innerWidth,
  height: typeof window === 'undefined' ? 800 : window.innerHeight
});

const getDefaultButtonPosition = () => {
  const viewport = getViewportSize();
  return {
    x: viewport.width - CHAT_BUTTON_SIZE - 24,
    y: viewport.height - CHAT_BUTTON_SIZE - 24
  };
};

const clampPosition = (position, size) => {
  const viewport = getViewportSize();
  return {
    x: clamp(position.x, CHAT_EDGE_GAP, Math.max(CHAT_EDGE_GAP, viewport.width - size.width - CHAT_EDGE_GAP)),
    y: clamp(position.y, CHAT_EDGE_GAP, Math.max(CHAT_EDGE_GAP, viewport.height - size.height - CHAT_EDGE_GAP))
  };
};

const readStoredPosition = () => {
  if (typeof window === 'undefined') return getDefaultButtonPosition();
  const fallback = getDefaultButtonPosition();
  try {
    const saved = window.localStorage.getItem('chatbot_floating_position');
    if (!saved) return fallback;
    const parsed = JSON.parse(saved);
    if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) {
      return clampPosition(parsed, { width: CHAT_BUTTON_SIZE, height: CHAT_BUTTON_SIZE });
    }
  } catch (error) {
    console.error('Failed to parse chat position');
  }
  return fallback;
};

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [buttonPosition, setButtonPosition] = useState(readStoredPosition);
  const [windowPosition, setWindowPosition] = useState(() => {
    const buttonPos = readStoredPosition();
    return clampPosition({
      x: buttonPos.x - CHAT_WINDOW_SIZE.width + CHAT_BUTTON_SIZE,
      y: buttonPos.y - CHAT_WINDOW_SIZE.height + CHAT_BUTTON_SIZE
    }, CHAT_WINDOW_SIZE);
  });
  const messagesEndRef = useRef(null);
  const dragRef = useRef(null);
  const suppressOpenRef = useRef(false);

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

  const persistButtonPosition = (nextPosition) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('chatbot_floating_position', JSON.stringify(nextPosition));
  };

  const startButtonDrag = (event) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      type: 'button',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const startWindowDrag = (event) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.closest('[data-chat-window]')?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      type: 'window',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleDragMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3) {
      drag.moved = true;
    }
    const next = {
      x: event.clientX - drag.offsetX,
      y: event.clientY - drag.offsetY
    };
    if (drag.type === 'button') {
      setButtonPosition(clampPosition(next, { width: CHAT_BUTTON_SIZE, height: CHAT_BUTTON_SIZE }));
      return;
    }
    setWindowPosition(clampPosition(next, CHAT_WINDOW_SIZE));
  };

  const finishDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.type === 'button') {
      setButtonPosition(current => {
        const clamped = clampPosition(current, { width: CHAT_BUTTON_SIZE, height: CHAT_BUTTON_SIZE });
        persistButtonPosition(clamped);
        return clamped;
      });
      if (drag.moved) {
        suppressOpenRef.current = true;
        window.setTimeout(() => {
          suppressOpenRef.current = false;
        }, 0);
      }
    }
    dragRef.current = null;
  };

  const openChat = () => {
    if (suppressOpenRef.current) return;
    setWindowPosition(clampPosition({
      x: buttonPosition.x - CHAT_WINDOW_SIZE.width + CHAT_BUTTON_SIZE,
      y: buttonPosition.y - CHAT_WINDOW_SIZE.height + CHAT_BUTTON_SIZE
    }, CHAT_WINDOW_SIZE));
    setIsOpen(true);
  };

  return (
    <>
      {/* Floating Button */}
      <button 
        onPointerDown={startButtonDrag}
        onPointerMove={handleDragMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onClick={openChat}
        className="btn btn-primary"
        aria-label="Mở trợ lý nội bộ"
        style={{
          position: 'fixed',
          left: `${buttonPosition.x}px`,
          top: `${buttonPosition.y}px`,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          display: isOpen ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 9999,
          padding: 0,
          cursor: 'grab',
          touchAction: 'none',
          userSelect: 'none'
        }}
      >
        <MessageCircle size={28} />
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div data-chat-window style={{
          position: 'fixed',
          left: `${windowPosition.x}px`,
          top: `${windowPosition.y}px`,
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
          <div
            onPointerDown={startWindowDrag}
            onPointerMove={handleDragMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            style={{
            padding: '16px',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'grab',
            touchAction: 'none',
            userSelect: 'none'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bot color="var(--blue-500)" size={20} />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Trợ lý Nội bộ</h3>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={clearHistory}
                onPointerDown={event => event.stopPropagation()}
                title="Xóa lịch sử trò chuyện"
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '4px' }}
              >
                <Trash2 size={16} />
              </button>
              <button 
                onClick={() => setIsOpen(false)}
                onPointerDown={event => event.stopPropagation()}
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
                  <div style={{
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  backgroundColor: msg.role === 'user' ? '#2563eb' : 'rgba(255,255,255,0.05)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                  fontSize: '0.9rem',
                  lineHeight: 1.4,
                  whiteSpace: 'pre-wrap',
                  border: msg.role === 'user' ? 'none' : '1px solid var(--border-subtle)'
                }}>
                  {msg.content}
                </div>
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
