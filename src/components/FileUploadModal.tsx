import React, { useState } from 'react';
import { X, Upload, File } from 'lucide-react';
import { AttachmentFile } from '../types/process';

interface FileUploadModalProps {
  isOpen: boolean;
  nodeId: string;
  onClose: () => void;
  onUpload: (
    nodeId: string,
    file: Omit<AttachmentFile, 'id' | 'uploadDate'>
  ) => Promise<boolean>;
}

export const FileUploadModal: React.FC<FileUploadModalProps> = ({
  isOpen,
  nodeId,
  onClose,
  onUpload,
}) => {
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('3.2 MB');
  const [fileType, setFileType] = useState('pdf');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      setFileSize(`${mb} MB`);
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      setFileType(ext);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName.trim()) return;

    setIsSubmitting(true);
    const success = await onUpload(nodeId, {
      name: fileName.trim(),
      size: fileSize,
      type: fileType,
    });
    setIsSubmitting(false);
    if (success) {
      setFileName('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
            <Upload className="w-4 h-4 text-blue-600" />
            Tải lên tài liệu hồ sơ đính kèm
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-6 text-center transition-colors bg-slate-50/50">
            <input
              type="file"
              id="file-input-modal"
              onChange={handleFileChange}
              className="hidden"
            />
            <label
              htmlFor="file-input-modal"
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                <Upload className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-blue-600 hover:underline">
                Nhấn để chọn tệp hoặc kéo thả vào đây
              </span>
              <span className="text-[11px] text-slate-400">
                Hỗ trợ PDF, ZIP, DWG, DGN (Tối đa 50MB)
              </span>
            </label>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block mb-1">
              Tên file tài liệu
            </label>
            <input
              type="text"
              placeholder="VD: BienBan_DoTrac_DiaChinh_2026.pdf"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              required
              className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500 font-mono"
            />
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
              disabled={isSubmitting || !fileName.trim()}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Đang lưu...' : 'Thêm vào tủ hồ sơ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
