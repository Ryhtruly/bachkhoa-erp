import React, { useState } from 'react';
import { X, Plus, FileCheck } from 'lucide-react';
import { ChecklistItem } from '../types/process';

interface AddChecklistModalProps {
  isOpen: boolean;
  nodeId: string;
  onClose: () => void;
  onAdd: (
    nodeId: string,
    itemData: Omit<ChecklistItem, 'id' | 'updateDate'>
  ) => Promise<boolean>;
}

export const AddChecklistModal: React.FC<AddChecklistModalProps> = ({
  isOpen,
  nodeId,
  onClose,
  onAdd,
}) => {
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<ChecklistItem['status']>('valid');
  const [uploader, setUploader] = useState('Kỹ sư khảo sát');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('2.1 MB');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !fileName.trim()) return;

    setIsSubmitting(true);
    const statusLabel =
      status === 'valid'
        ? 'Hợp lệ'
        : status === 'rejected'
        ? 'Nguyên nhân từ chối'
        : 'Chờ chữ ký giáp ranh';

    const statusVariant =
      status === 'valid' ? 'green' : status === 'rejected' ? 'red' : 'blue';

    const ext = fileName.split('.').pop()?.toLowerCase() || 'pdf';

    const success = await onAdd(nodeId, {
      title: title.trim(),
      status,
      statusLabel,
      statusVariant,
      hasWarningIcon: status === 'rejected',
      uploaderInfo: `Tải lên bởi: ${uploader}`,
      fileName: fileName.trim(),
      fileSize,
      fileType: ext,
    });

    setIsSubmitting(false);
    if (success) {
      setTitle('');
      setFileName('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-blue-600" />
            Thêm loại giấy tờ đầu ra vào Checklist
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block mb-1">
              Tên danh mục hồ sơ đầu ra
            </label>
            <input
              type="text"
              placeholder="VD: Trích lục bản đồ địa chính cơ sở"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block mb-1">
              Tên tệp đính kèm
            </label>
            <input
              type="text"
              placeholder="VD: TrichLuc_BanDo_v2.pdf"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              required
              className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block mb-1">
                Trạng thái kiểm định
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ChecklistItem['status'])}
                className="w-full text-xs border border-slate-300 rounded-xl px-2.5 py-2 focus:outline-none focus:border-blue-500 bg-white"
              >
                <option value="valid">Hợp lệ</option>
                <option value="pending_signature">Chờ chữ ký</option>
                <option value="rejected">Từ chối / Cần chỉnh sửa</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block mb-1">
                Người tải lên
              </label>
              <input
                type="text"
                value={uploader}
                onChange={(e) => setUploader(e.target.value)}
                required
                className="w-full text-xs border border-slate-300 rounded-xl px-2.5 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || !fileName.trim()}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Đang thêm...' : 'Lưu vào checklist'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
