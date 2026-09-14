import React, { useState } from 'react';
import { X, Database, Check, RefreshCw, Layers, Code, Server } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import { ProcessModule } from '../types/process';

interface ServiceInspectorModalProps {
  isOpen: boolean;
  moduleData: ProcessModule | null;
  onClose: () => void;
  onRefresh: () => void;
  onReset: () => void;
}

export const ServiceInspectorModal: React.FC<ServiceInspectorModalProps> = ({
  isOpen,
  moduleData,
  onClose,
  onRefresh,
  onReset,
}) => {
  const currentConfig = apiClient.getConfig();
  const [useLocalJson, setUseLocalJson] = useState(currentConfig.useLocalJson);
  const [baseUrl, setBaseUrl] = useState(currentConfig.baseUrl);
  const [delayMs, setDelayMs] = useState(currentConfig.simulatedDelayMs);
  const [activeTab, setActiveTab] = useState<'config' | 'raw_json'>('config');
  const [saveMessage, setSaveMessage] = useState('');

  if (!isOpen) return null;

  const handleApplyConfig = () => {
    apiClient.setConfig({
      useLocalJson,
      baseUrl: baseUrl.trim(),
      simulatedDelayMs: Number(delayMs),
    });
    setSaveMessage('Đã cập nhật cấu hình Data Service!');
    setTimeout(() => setSaveMessage(''), 2500);
    onRefresh();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">
                Kiến trúc Data Service Layer & Nguồn Dữ liệu
              </h3>
              <p className="text-xs text-slate-400">
                Tách biệt tầng giao diện và tầng kết nối mạng (Async/Await Service)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-2 border-b border-slate-100 pt-3 pb-2 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('config')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
              activeTab === 'config'
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            Cấu hình Nguồn & API
          </button>
          <button
            onClick={() => setActiveTab('raw_json')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
              activeTab === 'raw_json'
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            Dữ liệu JSON Hiện tại
          </button>
        </div>

        {/* Tab Body */}
        <div className="py-4 flex-1 overflow-y-auto">
          {activeTab === 'config' ? (
            <div className="space-y-5 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <Layers className="w-4 h-4 text-blue-600" />
                  Mô hình dịch vụ phân tầng (Data Service Layer)
                </div>
                <p className="text-slate-600 leading-relaxed text-[12px]">
                  Ứng dụng được thiết kế theo nguyên tắc loose coupling: Mọi thành phần UI gọi thông qua{' '}
                  <code className="bg-slate-200/80 px-1 py-0.5 rounded font-mono text-blue-800">
                    processService
                  </code>{' '}
                  sử dụng async/await. Hiện tại đang nạp dữ liệu từ tệp cục bộ{' '}
                  <code className="bg-slate-200/80 px-1 py-0.5 rounded font-mono text-blue-800">
                    /public/data/process-data.json
                  </code>
                  , và có thể chuyển đổi sang máy chủ Live REST API bất cứ lúc nào.
                </p>
              </div>

              {/* Mode Selection */}
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block mb-2">
                  Chế độ nạp dữ liệu (Data Provider)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setUseLocalJson(true)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      useLocalJson
                        ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="font-bold text-slate-800 flex items-center justify-between">
                      Tệp JSON Cục bộ
                      {useLocalJson && <Check className="w-4 h-4 text-blue-600" />}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 font-mono">
                      /data/process-data.json
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUseLocalJson(false)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      !useLocalJson
                        ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="font-bold text-slate-800 flex items-center justify-between">
                      Live REST API Endpoint
                      {!useLocalJson && <Check className="w-4 h-4 text-blue-600" />}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Gọi API từ xa qua HTTP
                    </div>
                  </button>
                </div>
              </div>

              {/* Base URL Input */}
              {!useLocalJson && (
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block mb-1">
                    Base URL của API Server
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.yourdomain.com/v1"
                    className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2.5 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              {/* Simulated Latency */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Độ trễ mạng giả lập (Simulated Delay)
                  </label>
                  <span className="font-mono text-blue-600 font-bold">{delayMs} ms</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1200}
                  step={50}
                  value={delayMs}
                  onChange={(e) => setDelayMs(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <span className="text-[11px] text-slate-400 block mt-1">
                  Giúp kiểm tra hiệu ứng cập nhật dữ liệu phản ứng (reactive transitions) và trạng thái tải.
                </span>
              </div>

              {saveMessage && (
                <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-medium flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  {saveMessage}
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onReset();
                    setSaveMessage('Đã khôi phục dữ liệu ban đầu từ file JSON!');
                    setTimeout(() => setSaveMessage(''), 2500);
                  }}
                  className="text-xs text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Khôi phục dữ liệu gốc
                </button>

                <button
                  type="button"
                  onClick={handleApplyConfig}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors"
                >
                  Áp dụng cấu hình
                </button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <pre className="p-4 bg-slate-900 text-slate-100 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-96 leading-relaxed">
                {JSON.stringify(moduleData, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
