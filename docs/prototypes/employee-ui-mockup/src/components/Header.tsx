import React from 'react';
import { RefreshCw, Database } from 'lucide-react';

interface HeaderProps {
  category: string;
  title: string;
  stage: string;
  isLoading: boolean;
  onRefresh: () => void;
  onOpenInspector: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  category,
  title,
  stage,
  isLoading,
  onRefresh,
  onOpenInspector,
}) => {
  return (
    <header id="app-header" className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-6">
      <div className="flex flex-wrap items-center gap-3">
        <span
          id="badge-category"
          className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold tracking-wider text-blue-600 bg-blue-50/80 border border-blue-200/90 uppercase"
        >
          {category}
        </span>
        <h1 id="title-main" className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-4 text-xs md:text-sm text-slate-500 self-start md:self-auto">
        <div id="stage-info">
          <span>Giai đoạn: </span>
          <span className="font-bold text-slate-800">{stage}</span>
        </div>

        <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
          <button
            id="btn-inspect-service"
            onClick={onOpenInspector}
            title="Kiểm tra Data Service Layer & API Endpoint"
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-colors flex items-center gap-1 text-xs"
          >
            <Database className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-mono text-[11px]">JSON/API</span>
          </button>
          <button
            id="btn-refresh-data"
            onClick={onRefresh}
            disabled={isLoading}
            title="Làm mới dữ liệu từ Data Service"
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
};
