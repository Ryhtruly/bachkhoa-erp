import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  FileText,
  FileCode,
  CheckCircle,
  AlertTriangle,
  Upload,
  Image as ImageIcon,
  File,
  Eye,
  Check,
  Sparkles,
  Layers,
  FileType,
} from 'lucide-react';
import { ChecklistItem } from '../types/process';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  file?: { name: string; size?: string; type?: string; dataUrl?: string } | null;
  checklistItem?: ChecklistItem | null;
  nodeId?: string;
  initialTab?: 'preview' | 'upload';
  onClose: () => void;
  onUpdateChecklistFile?: (
    nodeId: string,
    itemId: string,
    fileInfo: {
      fileName: string;
      fileSize?: string;
      fileType?: string;
      fileDataUrl?: string;
      uploaderInfo?: string;
      note?: string;
      autoResolveIfRejected?: boolean;
    }
  ) => Promise<boolean>;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  file,
  checklistItem,
  nodeId = 'K01',
  initialTab = 'preview',
  onClose,
  onUpdateChecklistFile,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'upload'>('preview');

  // Upload Form State
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedFileSize, setUploadedFileSize] = useState('');
  const [uploadedFileType, setUploadedFileType] = useState('');
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
  const [uploader, setUploader] = useState('Kỹ sư khảo sát & đo đạc');
  const [fileNote, setFileNote] = useState('');
  const [autoResolve, setAutoResolve] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState('');

  // Synchronize initial tab when opening
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setUploadedFileName('');
      setUploadedFileSize('');
      setUploadedFileType('');
      setUploadedDataUrl(null);
      setFileNote('');
      setUploadSuccessMessage('');
      if (checklistItem) {
        setAutoResolve(checklistItem.status === 'rejected');
      }
    }
  }, [isOpen, initialTab, checklistItem]);

  if (!isOpen) return null;

  // Resolve current active file info (either from checklistItem or file prop)
  const currentFileName = checklistItem?.fileName || file?.name || 'TaiLieu_DiaChinh.pdf';
  const currentFileSize = checklistItem?.fileSize || file?.size || '3.2 MB';
  const currentDataUrl = checklistItem?.fileDataUrl || file?.dataUrl || null;
  const rawExt = currentFileName.split('.').pop()?.toLowerCase() || file?.type || 'pdf';

  const isCad = ['dwg', 'dxf', 'dgn'].includes(rawExt);
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(rawExt);
  const isDoc = ['doc', 'docx', 'txt', 'rtf'].includes(rawExt);
  const isPdf = rawExt === 'pdf';

  // Handle local file picking or drag-and-drop
  const processSelectedFile = (selectedFile: File) => {
    const ext = selectedFile.name.split('.').pop()?.toLowerCase() || 'pdf';
    const mb = (selectedFile.size / (1024 * 1024)).toFixed(2);
    const sizeStr = Number(mb) >= 0.1 ? `${mb} MB` : `${Math.round(selectedFile.size / 1024)} KB`;

    setUploadedFileName(selectedFile.name);
    setUploadedFileSize(sizeStr);
    setUploadedFileType(ext);

    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedDataUrl(e.target?.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setUploadedDataUrl(null);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processSelectedFile(f);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) processSelectedFile(f);
  };

  // Quick preset sample helper
  const handlePickPreset = (presetType: 'image' | 'doc' | 'pdf') => {
    if (presetType === 'image') {
      setUploadedFileName('Anh_HienTrang_MocGioi_ThucDia.jpg');
      setUploadedFileSize('4.8 MB');
      setUploadedFileType('jpg');
      setUploadedDataUrl('https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&auto=format&fit=crop&q=80');
      setFileNote('Ảnh chụp thực địa mốc ranh giới thửa đất có tọa độ GPS');
    } else if (presetType === 'doc') {
      setUploadedFileName('BaoCao_KetQua_DoDac_DiaChinh.docx');
      setUploadedFileSize('1.4 MB');
      setUploadedFileType('docx');
      setUploadedDataUrl(null);
      setFileNote('Báo cáo thẩm định kỹ thuật đo đạc theo mẫu số 05/ĐĐ');
    } else {
      setUploadedFileName('BanTrichDo_DiaChinh_HieuChinh_v2.pdf');
      setUploadedFileSize('3.6 MB');
      setUploadedFileType('pdf');
      setUploadedDataUrl(null);
      setFileNote('Bản trích đo đã căn chỉnh mốc 3 sai số dưới 0.05m');
    }
  };

  // Submit the uploaded file to update the checklist item
  const handleSaveUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadedFileName.trim() || !checklistItem || !onUpdateChecklistFile) return;

    setIsSubmitting(true);
    const success = await onUpdateChecklistFile(nodeId, checklistItem.id, {
      fileName: uploadedFileName.trim(),
      fileSize: uploadedFileSize || '2.5 MB',
      fileType: uploadedFileType || uploadedFileName.split('.').pop()?.toLowerCase() || 'pdf',
      fileDataUrl: uploadedDataUrl || undefined,
      uploaderInfo: `Tải lên bởi: ${uploader.trim()}`,
      note: fileNote.trim() || undefined,
      autoResolveIfRejected: autoResolve,
    });
    setIsSubmitting(false);

    if (success) {
      setUploadSuccessMessage('Đã cập nhật tệp thành công vào hồ sơ!');
      setTimeout(() => {
        setUploadSuccessMessage('');
        setActiveTab('preview');
      }, 1200);
    }
  };

  const renderFileIcon = (ext: string) => {
    if (['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext)) {
      return <ImageIcon className="w-5 h-5 text-emerald-600" />;
    }
    if (['doc', 'docx'].includes(ext)) {
      return <FileText className="w-5 h-5 text-blue-600" />;
    }
    if (['dwg', 'dxf', 'dgn'].includes(ext)) {
      return <FileCode className="w-5 h-5 text-cyan-600" />;
    }
    return <FileText className="w-5 h-5 text-rose-600" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
              {renderFileIcon(rawExt)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate font-mono">
                  {currentFileName}
                </h3>
                <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                  {rawExt}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                {checklistItem ? checklistItem.title : 'Tài liệu nghiệp vụ'} • {currentFileSize}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (currentDataUrl) {
                  const a = document.createElement('a');
                  a.href = currentDataUrl;
                  a.download = currentFileName;
                  a.click();
                } else {
                  alert(`Đang tải xuống tệp: ${currentFileName} (${currentFileSize})`);
                }
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tải về</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs (Preview vs Upload/Replace) */}
        <div className="flex items-center justify-between border-b border-slate-100 pt-2.5 pb-2 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'preview'
                  ? 'bg-blue-50 text-blue-700 font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Xem tệp hồ sơ
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'upload'
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'text-slate-600 hover:text-blue-600 bg-slate-50 hover:bg-blue-50/50'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Tải lên / Thay thế tệp
              <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.2 rounded-full hidden sm:inline">
                Docs, PDF, Ảnh
              </span>
            </button>
          </div>

          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Hỗ trợ Word, PDF, Ảnh, CAD
          </span>
        </div>

        {/* Modal Body */}
        <div className="py-4 flex-1 overflow-y-auto space-y-4 custom-scrollbar">
          {activeTab === 'preview' ? (
            /* TAB 1: PREVIEW */
            <div className="space-y-4">
              {/* If Image format */}
              {isImage ? (
                <div className="w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 relative group">
                  <div className="h-64 flex items-center justify-center bg-slate-950/60 p-2">
                    {currentDataUrl ? (
                      <img
                        src={currentDataUrl}
                        alt={currentFileName}
                        className="max-h-full max-w-full object-contain rounded-lg shadow"
                      />
                    ) : (
                      /* Realistic Cadastral Survey Photo Canvas */
                      <div className="relative w-full h-full rounded-xl overflow-hidden bg-slate-800 flex items-center justify-center">
                        <img
                          src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&auto=format&fit=crop&q=80"
                          alt="Ảnh chụp thực địa mốc thửa đất"
                          className="w-full h-full object-cover opacity-80"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/40" />

                        {/* Survey Marker Graphic Overlay */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none">
                          <div className="w-12 h-12 rounded-full border-2 border-dashed border-red-500 flex items-center justify-center animate-pulse">
                            <div className="w-3 h-3 rounded-full bg-red-600 shadow-lg shadow-red-500/50" />
                          </div>
                          <span className="mt-1 bg-red-600/90 text-white text-[10px] font-mono px-2 py-0.5 rounded font-bold">
                            MỐC ĐỊA CHÍNH M3
                          </span>
                        </div>

                        {/* Coordinates and Timestamp Stamp */}
                        <div className="absolute bottom-3 left-3 bg-black/75 backdrop-blur-xs text-white text-[11px] font-mono p-2 rounded-lg border border-white/15 space-y-0.5">
                          <div className="text-emerald-400 font-bold">● TỌA ĐỘ GPS THỰC ĐỊA:</div>
                          <div>Vĩ độ: 21°01&apos;44.2&quot;N - Kinh độ: 105°48&apos;09.1&quot;E</div>
                          <div className="text-slate-400 text-[10px]">Hệ tọa độ Quốc gia: VN-2000 (Múi 3°)</div>
                        </div>

                        <div className="absolute top-3 right-3 bg-emerald-500/90 text-white text-[10px] font-bold px-2 py-1 rounded shadow">
                          ẢNH CHỨNG THỰC HIỆN TRƯỜNG
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : isDoc ? (
                /* If Word / Doc format */
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-inner font-sans space-y-3">
                  <div className="text-center pb-3 border-b border-slate-200 space-y-1">
                    <p className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">
                      CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
                    </p>
                    <p className="text-[10px] text-slate-500 font-medium">
                      Độc lập - Tự do - Hạnh phúc
                    </p>
                    <div className="w-16 h-0.5 bg-slate-300 mx-auto mt-1" />
                    <h4 className="text-sm font-bold text-slate-800 pt-2 uppercase">
                      {checklistItem ? checklistItem.title : 'BÁO CÁO KẾT QUẢ ĐO ĐẠC ĐỊA CHÍNH'}
                    </h4>
                    <p className="text-[11px] text-slate-500 italic">
                      (Kèm theo hồ sơ kỹ thuật thửa đất số 24, tờ bản đồ địa chính số 12)
                    </p>
                  </div>

                  <div className="space-y-2 text-xs text-slate-700 leading-relaxed bg-white p-4 rounded-xl border border-slate-200">
                    <p>
                      <strong>1. Căn cứ pháp lý:</strong> Luật Đất đai năm 2024 và Quy chuẩn kỹ thuật quốc gia về đo đạc địa chính cơ sở.
                    </p>
                    <p>
                      <strong>2. Đơn vị đo đạc thực hiện:</strong> Tổ Khảo sát Đo trạc Địa chính Khu vực 1.
                    </p>
                    <p>
                      <strong>3. Kết quả đối soát:</strong> Tọa độ các đỉnh thửa đất đã được đo đạc bằng máy toàn đạc điện tử và GNSS-RTK độ chính xác cao.
                    </p>
                    <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100">
                      <span>Tệp văn bản: {currentFileName}</span>
                      <span className="font-semibold text-blue-600">Định dạng: Microsoft Word (.docx)</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* If PDF or CAD format */
                <div className="w-full h-64 bg-slate-900 rounded-2xl relative overflow-hidden flex items-center justify-center border border-slate-800 shadow-inner">
                  {/* Grid Pattern */}
                  <div
                    className="absolute inset-0 opacity-20"
                    style={{
                      backgroundImage:
                        'linear-gradient(#38bdf8 1px, transparent 1px), linear-gradient(90deg, #38bdf8 1px, transparent 1px)',
                      backgroundSize: '24px 24px',
                    }}
                  />

                  {/* Simulated Vector Cadastral Boundary */}
                  <svg className="w-48 h-48 relative z-10" viewBox="0 0 200 200">
                    <polygon
                      points="40,30 160,50 170,160 30,140"
                      fill="rgba(56, 189, 248, 0.15)"
                      stroke="#38bdf8"
                      strokeWidth="2.5"
                      strokeDasharray={isCad ? '4 2' : 'none'}
                    />
                    <circle cx="40" cy="30" r="5" fill="#10b981" />
                    <text x="45" y="25" fill="#38bdf8" fontSize="10" fontFamily="monospace">
                      Mốc 1 (X: 593120, Y: 1198420)
                    </text>
                    <circle cx="160" cy="50" r="5" fill="#10b981" />
                    <text x="110" y="45" fill="#38bdf8" fontSize="10" fontFamily="monospace">
                      Mốc 2 (VN-2000)
                    </text>
                    <circle
                      cx="170"
                      cy="160"
                      r="5"
                      fill={checklistItem?.status === 'rejected' ? '#f43f5e' : '#10b981'}
                    />
                    <text
                      x="90"
                      y="180"
                      fill={checklistItem?.status === 'rejected' ? '#fb7185' : '#38bdf8'}
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      Mốc 3 {checklistItem?.status === 'rejected' ? '(Sai số Δ: +0.06m)' : '(Đạt chuẩn)'}
                    </text>
                    <circle cx="30" cy="140" r="5" fill="#10b981" />
                    <text x="10" y="160" fill="#38bdf8" fontSize="10" fontFamily="monospace">
                      Mốc 4
                    </text>
                  </svg>

                  <div className="absolute bottom-3 left-3 bg-slate-800/90 text-cyan-300 text-[10px] font-mono px-2 py-1 rounded border border-slate-700 backdrop-blur-xs">
                    Hệ tọa độ Quốc gia: VN-2000 (Kinh tuyến trục 105°00&apos;, múi chiếu 3°)
                  </div>
                </div>
              )}

              {/* Document metadata table */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block font-medium">Hồ sơ địa chính số:</span>
                  <span className="font-semibold text-slate-800">ĐĐ-2026/TĐ-018</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Tình trạng kiểm định:</span>
                  <span className="font-semibold text-slate-800">
                    {checklistItem ? checklistItem.statusLabel : 'Đã đối soát thực địa'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Người cập nhật:</span>
                  <span className="font-semibold text-slate-800">
                    {checklistItem ? checklistItem.uploaderInfo : 'Kỹ sư đo đạc'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Chữ ký số điện tử:</span>
                  <span className="font-semibold text-emerald-600 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Đã chứng thực SHA-256
                  </span>
                </div>
              </div>

              {/* Call-to-action button to switch to upload tab */}
              <div className="bg-blue-50/60 border border-blue-200/80 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-blue-900 font-medium">
                  <Upload className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Cần thay đổi hoặc đính kèm tài liệu mới cho mục này?</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('upload')}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors shrink-0 cursor-pointer shadow-2xs"
                >
                  Tải file lên ngay
                </button>
              </div>
            </div>
          ) : (
            /* TAB 2: UPLOAD & REPLACE FILE */
            <form onSubmit={handleSaveUpload} className="space-y-4">
              {/* Drag & Drop Box */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all bg-slate-50/70 relative ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/70 scale-[0.99]'
                    : 'border-slate-300 hover:border-blue-400'
                }`}
              >
                <input
                  type="file"
                  id="checklist-file-input"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.svg,.dwg,.dxf,.zip"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <label
                  htmlFor="checklist-file-input"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-blue-600 hover:underline">
                      Nhấn vào đây để duyệt file từ máy
                    </span>
                    <span className="text-xs text-slate-500"> hoặc kéo thả vào ô này</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                    <span className="bg-red-50 text-red-700 border border-red-200/60 text-[10px] font-semibold px-2 py-0.5 rounded-md">
                      PDF (.pdf)
                    </span>
                    <span className="bg-blue-50 text-blue-700 border border-blue-200/60 text-[10px] font-semibold px-2 py-0.5 rounded-md">
                      Word (.doc, .docx)
                    </span>
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[10px] font-semibold px-2 py-0.5 rounded-md">
                      Hình ảnh (JPG, PNG, WEBP)
                    </span>
                    <span className="bg-cyan-50 text-cyan-700 border border-cyan-200/60 text-[10px] font-semibold px-2 py-0.5 rounded-md">
                      CAD (.dwg, .dxf)
                    </span>
                  </div>
                </label>
              </div>

              {/* Quick sample file presets */}
              <div>
                <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
                  Gợi ý chọn nhanh file mẫu thử nghiệm:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handlePickPreset('image')}
                    className="p-2 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl text-left transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700 group-hover:text-emerald-700">
                      <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                      Ảnh mốc giới .jpg
                    </div>
                    <span className="text-[10px] text-slate-400 block truncate">Ảnh chụp thực địa</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePickPreset('doc')}
                    className="p-2 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl text-left transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700 group-hover:text-blue-700">
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      Báo cáo Word .docx
                    </div>
                    <span className="text-[10px] text-slate-400 block truncate">Báo cáo thẩm định</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePickPreset('pdf')}
                    className="p-2 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-300 rounded-xl text-left transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700 group-hover:text-rose-700">
                      <FileText className="w-3.5 h-3.5 text-rose-600" />
                      Bản vẽ .pdf
                    </div>
                    <span className="text-[10px] text-slate-400 block truncate">Trích đo hiệu chỉnh</span>
                  </button>
                </div>
              </div>

              {/* Selected File Details & Preview */}
              {uploadedFileName && (
                <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-3.5 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                        {renderFileIcon(uploadedFileType)}
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-800 font-mono block truncate">
                          {uploadedFileName}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Kích thước: {uploadedFileSize} • Định dạng: {uploadedFileType.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadedFileName('');
                        setUploadedDataUrl(null);
                      }}
                      className="text-xs text-rose-600 hover:underline cursor-pointer"
                    >
                      Bỏ chọn
                    </button>
                  </div>

                  {/* Thumbnail if image */}
                  {uploadedDataUrl && (
                    <div className="mt-2 rounded-xl overflow-hidden border border-blue-200 max-h-36 bg-slate-900 flex items-center justify-center">
                      <img
                        src={uploadedDataUrl}
                        alt="Preview"
                        className="max-h-36 object-contain"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Metadata Form Inputs */}
              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 uppercase tracking-wide block mb-1">
                    Tên file hiển thị
                  </label>
                  <input
                    type="text"
                    value={uploadedFileName}
                    onChange={(e) => setUploadedFileName(e.target.value)}
                    placeholder="VD: BanTrichDo_DiaChinh_v2.pdf hoặc Anh_ThucDia_01.jpg"
                    required
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 uppercase tracking-wide block mb-1">
                      Người thực hiện tải lên
                    </label>
                    <input
                      type="text"
                      value={uploader}
                      onChange={(e) => setUploader(e.target.value)}
                      required
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 uppercase tracking-wide block mb-1">
                      Ghi chú đính kèm
                    </label>
                    <input
                      type="text"
                      value={fileNote}
                      onChange={(e) => setFileNote(e.target.value)}
                      placeholder="VD: Bản sửa đổi ngày 03/09"
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {checklistItem?.status === 'rejected' && (
                  <label className="flex items-center gap-2 p-2.5 bg-amber-50/70 border border-amber-200 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoResolve}
                      onChange={(e) => setAutoResolve(e.target.checked)}
                      className="accent-blue-600 rounded"
                    />
                    <span className="text-xs font-semibold text-amber-900">
                      Tự động khắc phục lỗi từ chối và đổi trạng thái mục này thành &quot;Hợp lệ&quot;
                    </span>
                  </label>
                )}
              </div>

              {uploadSuccessMessage && (
                <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-medium flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600" />
                  {uploadSuccessMessage}
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Quay lại xem trước
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !uploadedFileName.trim()}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isSubmitting ? 'Đang lưu...' : 'Lưu và Cập nhật tệp vào mục này'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
          <span>Hệ thống Quản lý Quy trình Đo đạc Địa chính 2026</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
