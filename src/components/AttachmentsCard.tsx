import React from 'react';
import { FileText, Archive, FileCode, File } from 'lucide-react';
import { AttachmentFile } from '../types/process';

interface AttachmentsCardProps {
  attachments: AttachmentFile[];
  onUploadClick: () => void;
  onFileClick: (file: { name: string; size?: string; type?: string }) => void;
}

export const AttachmentsCard: React.FC<AttachmentsCardProps> = ({
  attachments,
  onUploadClick,
  onFileClick,
}) => {
  const getFileIcon = (fileName: string, type?: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || type || '';
    if (ext === 'pdf') {
      return <FileText className="w-4 h-4 text-blue-500 shrink-0 stroke-[1.8]" />;
    }
    if (['zip', 'rar', '7z', 'tar'].includes(ext)) {
      return <Archive className="w-4 h-4 text-emerald-500 shrink-0 stroke-[1.8]" />;
    }
    if (['dwg', 'dxf', 'dgn'].includes(ext)) {
      return <FileCode className="w-4 h-4 text-amber-500 shrink-0 stroke-[1.8]" />;
    }
    return <File className="w-4 h-4 text-slate-400 shrink-0 stroke-[1.8]" />;
  };

  return (
    <div
      id="card-attachments"
      className="border border-slate-200/90 bg-white rounded-2xl p-5 shadow-2xs transition-all"
    >
      <div className="flex items-center justify-between gap-2 mb-3.5">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          TỦ HỒ SƠ ĐÍNH KÈM
        </h3>
        <button
          id="btn-upload-attachment"
          onClick={onUploadClick}
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline transition-colors flex items-center gap-1 cursor-pointer"
        >
          + Tải file lên
        </button>
      </div>

      <div className="space-y-2">
        {attachments.map((file) => (
          <div
            key={file.id}
            id={`attachment-item-${file.id}`}
            onClick={() => onFileClick({ name: file.name, size: file.size, type: file.type })}
            className="group bg-slate-50/70 hover:bg-blue-50/30 border border-slate-100 hover:border-blue-200 rounded-xl p-3 flex items-center justify-between transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              {getFileIcon(file.name, file.type)}
              <span className="text-xs font-medium text-slate-700 group-hover:text-blue-700 truncate">
                {file.name}
              </span>
            </div>
            <span className="text-xs text-slate-400 font-mono shrink-0">
              {file.size}
            </span>
          </div>
        ))}

        {attachments.length === 0 && (
          <div className="text-center py-4 text-xs text-slate-400">
            Chưa có tài liệu đính kèm
          </div>
        )}
      </div>
    </div>
  );
};
