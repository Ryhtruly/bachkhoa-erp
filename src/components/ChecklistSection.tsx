import React from 'react';
import {
  Check,
  X,
  FileText,
  ExternalLink,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Upload,
} from 'lucide-react';
import { ChecklistItem } from '../types/process';

interface ChecklistSectionProps {
  headerTitle: string;
  linkedCount: number;
  items: ChecklistItem[];
  submissionWarning?: string;
  submitButtonText: string;
  isUpdating: boolean;
  onAddChecklistClick: () => void;
  onResolveItemClick: (item: ChecklistItem) => void;
  onFileClick: (item: ChecklistItem, mode?: 'preview' | 'upload') => void;
  onSubmitInspection: () => void;
}

export const ChecklistSection: React.FC<ChecklistSectionProps> = ({
  headerTitle,
  linkedCount,
  items,
  submissionWarning,
  submitButtonText,
  isUpdating,
  onAddChecklistClick,
  onResolveItemClick,
  onFileClick,
  onSubmitInspection,
}) => {
  const hasRejections = items.some((item) => item.status === 'rejected');

  const renderStatusIcon = (item: ChecklistItem) => {
    switch (item.status) {
      case 'valid':
        return (
          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <Check className="w-4 h-4 stroke-[2.5]" />
          </div>
        );
      case 'rejected':
        return (
          <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center shrink-0">
            <X className="w-4 h-4 stroke-[2.5]" />
          </div>
        );
      case 'pending_signature':
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 stroke-[2]" />
          </div>
        );
    }
  };

  const renderStatusBadge = (item: ChecklistItem) => {
    switch (item.status) {
      case 'valid':
        return (
          <span className="bg-emerald-100 text-emerald-700 text-xs px-2.5 py-0.5 rounded-full font-medium">
            {item.statusLabel}
          </span>
        );
      case 'rejected':
        return (
          <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            {item.statusLabel}
          </span>
        );
      case 'pending_signature':
      default:
        return (
          <span className="bg-blue-50 text-blue-700 text-xs px-2.5 py-0.5 rounded-full font-medium">
            {item.statusLabel}
          </span>
        );
    }
  };

  return (
    <div id="section-checklist" className="flex flex-col h-full">
      {/* Top Header Bar */}
      <div
        id="checklist-top-bar"
        className="border border-amber-200/90 bg-amber-50/35 rounded-2xl p-3 px-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="bg-amber-600 text-white text-[11px] font-bold px-2 py-0.5 rounded shrink-0 shadow-2xs">
            Ô NGHIỆP VỤ
          </span>
          <h2 className="text-sm font-bold text-slate-800 truncate">
            {headerTitle}
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="bg-white border border-slate-200 text-slate-600 text-xs px-2.5 py-1 rounded-lg font-medium shadow-2xs">
            {items.length} giấy tờ liên kết
          </span>
          <button
            id="btn-add-checklist-type"
            onClick={onAddChecklistClick}
            className="border border-blue-500 bg-white hover:bg-blue-50 text-blue-600 text-xs font-semibold px-3 py-1 rounded-lg shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Thêm loại giấy
          </button>
        </div>
      </div>

      {/* Column Titles */}
      <div className="flex items-center justify-between px-1 mt-4 mb-2">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          DANH MỤC CHECKLIST ĐẦU RA
        </span>
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          TRẠNG THÁI KIỂM ĐỊNH
        </span>
      </div>

      {/* Checklist Cards List - Scrollable for multiple document categories */}
      <div className="space-y-3 flex-1 max-h-[460px] md:max-h-[520px] overflow-y-auto pr-1.5 custom-scrollbar">
        {items.map((item) => {
          const isRejected = item.status === 'rejected';

          return (
            <div
              key={item.id}
              id={`checklist-item-${item.id}`}
              className={`rounded-2xl p-4 shadow-2xs transition-all ${
                isRejected
                  ? 'border border-rose-200/90 bg-white hover:border-rose-300'
                  : 'border border-slate-200/90 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3.5 min-w-0">
                  {renderStatusIcon(item)}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-800 text-sm">
                        {item.title}
                      </h3>
                      {renderStatusBadge(item)}
                    </div>

                    <div className="text-xs text-slate-400 mt-1 leading-normal">
                      <span>{item.uploaderInfo}</span>
                      {item.note && (
                        <span> • <span className="text-slate-500">{item.note}</span></span>
                      )}
                      {item.updateDate && !item.uploaderInfo.includes(item.updateDate) && (
                        <span> • Cập nhật: {item.updateDate}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                  <button
                    id={`btn-file-${item.id}`}
                    onClick={() => onFileClick(item, 'preview')}
                    className="text-xs font-medium text-slate-600 hover:text-blue-600 flex items-center gap-1.5 transition-colors cursor-pointer group bg-slate-50 hover:bg-blue-50/70 border border-slate-200/90 hover:border-blue-300 px-2.5 py-1 rounded-xl shadow-2xs"
                    title="Xem chi tiết & Tải tệp lên"
                  >
                    <span className="group-hover:underline font-mono truncate max-w-[130px] sm:max-w-[170px]">
                      {item.fileName}
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onFileClick(item, 'upload')}
                    className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-colors cursor-pointer"
                    title="Tải lên / Thay tệp mới (Docs, PDF, Hình ảnh...)"
                  >
                    <Upload className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Rejection callout box if item is rejected */}
              {isRejected && item.rejectionReason && (
                <div className="border border-rose-200/90 bg-rose-50/50 rounded-xl p-3 mt-3.5 text-xs text-slate-700 leading-relaxed">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-bold text-rose-600">Lý do từ chối: </span>
                      <span>{item.rejectionReason}</span>
                    </div>
                    <button
                      onClick={() => onResolveItemClick(item)}
                      className="shrink-0 bg-white border border-rose-300 hover:bg-rose-100 text-rose-700 font-medium px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer shadow-2xs"
                    >
                      Khắc phục lỗi
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {items.length === 0 && (
          <div className="text-center py-10 text-xs text-slate-400 border border-dashed border-slate-200 rounded-2xl">
            Chưa có danh mục checklist nào
          </div>
        )}
      </div>

      {/* Bottom Action Footer */}
      <div
        id="checklist-actions-footer"
        className="flex flex-wrap items-center justify-between gap-4 pt-6 mt-4 border-t border-slate-100"
      >
        <div className="flex items-center gap-2 text-xs text-slate-600 font-medium min-w-0">
          {hasRejections ? (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 inline-block animate-pulse" />
              <span className="truncate">
                {submissionWarning || 'Cần hoàn thiện 1 mục bị từ chối trước khi nộp nghiệm thu.'}
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-emerald-700 truncate">
                Tất cả các mục kiểm định đã hợp lệ. Sẵn sàng nộp nghiệm thu.
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            id="btn-update-supplement"
            onClick={() => {
              const rejected = items.find((i) => i.status === 'rejected');
              if (rejected) {
                onResolveItemClick(rejected);
              } else if (items.length > 0) {
                onResolveItemClick(items[0]);
              }
            }}
            className="border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs md:text-sm px-4 py-2.5 rounded-xl transition-colors shadow-2xs cursor-pointer"
          >
            Cập nhật bổ sung
          </button>

          <button
            id="btn-submit-inspection"
            onClick={onSubmitInspection}
            disabled={isUpdating}
            className={`font-semibold text-xs md:text-sm px-5 py-2.5 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ${
              hasRejections
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white ring-2 ring-blue-400/30'
            }`}
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            {submitButtonText}
          </button>
        </div>
      </div>
    </div>
  );
};
