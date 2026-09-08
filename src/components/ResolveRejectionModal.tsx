import React, { useState } from 'react';
import { X, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ChecklistItem } from '../types/process';

interface ResolveRejectionModalProps {
  isOpen: boolean;
  item: ChecklistItem | null;
  nodeId: string;
  onClose: () => void;
  onResolve: (
    nodeId: string,
    itemId: string,
    payload: { newFileName: string; uploaderInfo?: string; resolutionNote?: string }
  ) => Promise<boolean>;
}

export const ResolveRejectionModal: React.FC<ResolveRejectionModalProps> = ({
  isOpen,
  item,
  nodeId,
  onClose,
  onResolve,
}) => {
  const [fileName, setFileName] = useState('TrichDo_DC_ChinhSua_VN2000.dwg');
  const [note, setNote] = useState(
    'Đã đo đối soát lại mốc đỉnh số 3 tại thực địa, sai số đạt chuẩn < 0.02m so với hệ VN-2000 gốc. Đã cập nhật bản vẽ có dấu giáp lai.'
  );
  const [uploader, setUploader] = useState('Kỹ sư đo: Nguyễn Văn Thành');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !item) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const success = await onResolve(nodeId, item.id, {
      newFileName: fileName,
      uploaderInfo: uploader,
      resolutionNote: note,
    });
    setIsSubmitting(false);
    if (success) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </span>
            <h3 className="font-bold text-slate-800 text-base">
              Cập nhật khắc phục & Bổ sung hồ sơ
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block mb-1">
              Hạng mục cần cập nhật
            </label>
            <div className="text-sm font-semibold text-slate-900 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              {item.title} ({item.fileName})
            </div>
          </div>

          {item.rejectionReason && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
              <span className="font-bold">Lý do từ chối hiện tại: </span>
              {item.rejectionReason}
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block mb-1">
              Tên tệp bản vẽ / tài liệu thay thế
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                required
                className="flex-1 text-xs border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block mb-1">
              Người thực hiện kiểm định / đo đạc lại
            </label>
            <input
              type="text"
              value={uploader}
              onChange={(e) => setUploader(e.target.value)}
              required
              className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block mb-1">
              Ghi chú giải trình & đối chiếu kết quả
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required
              className="w-full text-xs border border-slate-300 rounded-xl p-3 focus:outline-none focus:border-blue-500 leading-relaxed"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSubmitting ? 'Đang cập nhật...' : 'Xác nhận hợp lệ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
