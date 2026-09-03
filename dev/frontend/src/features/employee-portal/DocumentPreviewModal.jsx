import { useState, useEffect, useRef } from 'react'
import {
  X,
  Download,
  FileText,
  FileCode,
  CheckCircle,
  Upload,
  Image as ImageIcon,
  Eye,
  Check,
  ExternalLink,
} from 'lucide-react'
import { renderAsync } from 'docx-preview'
import './documentPreviewModal.css'

const IMAGE_EXTENSIONS = /\.(?:avif|gif|heic|jpeg|jpg|png|svg|webp)$/i
const PDF_EXTENSION = /\.pdf$/i
const DOCX_EXTENSION = /\.docx$/i
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const CAD_EXTENSIONS = /\.(?:dwg|dxf|dgn)$/i

export default function DocumentPreviewModal({
  open = false,
  isOpen,
  fileName = '',
  mimeType = '',
  url = '',
  blob = null,
  doc = null,
  file = null,
  checklistItem = null,
  nodeId = 'K01',
  initialTab = 'preview',
  onClose,
  onUpdateChecklistFile,
}) {
  const isVisible = open || isOpen
  const [activeTab, setActiveTab] = useState('preview')

  // Upload Form State
  const [uploadedFileName, setUploadedFileName] = useState('')
  const [uploadedFileSize, setUploadedFileSize] = useState('')
  const [uploadedFileType, setUploadedFileType] = useState('')
  const [uploadedDataUrl, setUploadedDataUrl] = useState(null)
  const [uploader, setUploader] = useState('Kỹ sư khảo sát & đo đạc')
  const [fileNote, setFileNote] = useState('')
  const [autoResolve, setAutoResolve] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState('')
  const [zoom, setZoom] = useState(100)
  const [localFile, setLocalFile] = useState(null)

  // Word (.docx) renderer state
  const docxSurfaceRef = useRef(null)
  const [docxState, setDocxState] = useState('idle')

  // Synchronize initial tab when opening
  useEffect(() => {
    if (isVisible) {
      setActiveTab(initialTab)
      setUploadedFileName('')
      setUploadedFileSize('')
      setUploadedFileType('')
      setUploadedDataUrl(null)
      setFileNote('')
      setUploadSuccessMessage('')
      setZoom(100)
      if (checklistItem) {
        setAutoResolve(checklistItem.status === 'rejected')
      }
    }
  }, [isVisible, initialTab, checklistItem])

  // Resolve current active file info
  const currentFileName =
    localFile?.name ||
    fileName ||
    doc?.name ||
    doc?.file_name ||
    doc?.fileName ||
    checklistItem?.fileName ||
    file?.name ||
    'TrichDo_DC_Draft.dwg'

  const currentFileSize =
    localFile?.size ||
    doc?.file_size ||
    doc?.fileSize ||
    checklistItem?.fileSize ||
    file?.size ||
    '6.2 MB'

  const currentDataUrl =
    localFile?.dataUrl ||
    url ||
    doc?.url ||
    doc?.fileDataUrl ||
    checklistItem?.fileDataUrl ||
    file?.dataUrl ||
    null


  const normalizedType = String(mimeType || doc?.mimeType || file?.type || '').toLowerCase()
  const rawExt = currentFileName.split('.').pop()?.toLowerCase() || 'dwg'

  const isCad = CAD_EXTENSIONS.test(currentFileName) || ['dwg', 'dxf', 'dgn'].includes(rawExt) || /bản vẽ|sơ đồ|trích đo/i.test(currentFileName)
  const isImage = normalizedType.startsWith('image/') || IMAGE_EXTENSIONS.test(currentFileName) || ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(rawExt)
  const isDocx = normalizedType === DOCX_MIME || DOCX_EXTENSION.test(currentFileName) || ['doc', 'docx'].includes(rawExt)
  const isPdf = normalizedType === 'application/pdf' || PDF_EXTENSION.test(currentFileName) || rawExt === 'pdf'

  // Word document async rendering
  useEffect(() => {
    if (!isVisible || !isDocx || !url) return undefined
    const surface = docxSurfaceRef.current
    if (!surface) return undefined

    let dangHieuLuc = true
    surface.innerHTML = ''
    setDocxState('loading')

    const renderDocument = async () => {
      let documentBlob = blob
      if (!documentBlob) {
        const response = await fetch(url)
        if (response.ok === false) throw new Error('Không tải được nội dung tài liệu Word.')
        documentBlob = await response.blob()
      }
      if (!documentBlob || documentBlob.size <= 0) {
        throw new Error('Tệp Word rỗng.')
      }
      if (!dangHieuLuc) return
      await renderAsync(documentBlob, surface, null, { inWrapper: true, useBase64URL: true })
      if (dangHieuLuc) setDocxState('ready')
    }

    renderDocument().catch(() => {
      if (dangHieuLuc) setDocxState('error')
    })

    return () => {
      dangHieuLuc = false
      surface.innerHTML = ''
    }
  }, [isVisible, isDocx, url, blob])

  if (!isVisible) return null

  // File picking & drop handlers
  const processSelectedFile = (selectedFile) => {
    const ext = selectedFile.name.split('.').pop()?.toLowerCase() || 'pdf'
    const mb = (selectedFile.size / (1024 * 1024)).toFixed(2)
    const sizeStr = Number(mb) >= 0.1 ? `${mb} MB` : `${Math.round(selectedFile.size / 1024)} KB`

    setUploadedFileName(selectedFile.name)
    setUploadedFileSize(sizeStr)
    setUploadedFileType(ext)

    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        setUploadedDataUrl(e.target?.result)
        setLocalFile({ name: selectedFile.name, size: sizeStr, type: ext, dataUrl: e.target?.result })
      }
      reader.readAsDataURL(selectedFile)
    } else {
      setUploadedDataUrl(null)
      setLocalFile({ name: selectedFile.name, size: sizeStr, type: ext, dataUrl: null })
    }
  }

  const handlePickPreset = (presetType) => {
    if (presetType === 'image') {
      const pName = 'Anh_HienTrang_MocGioi_ThucDia.jpg'
      const pSize = '4.8 MB'
      const pUrl = 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&auto=format&fit=crop&q=80'
      setUploadedFileName(pName)
      setUploadedFileSize(pSize)
      setUploadedFileType('jpg')
      setUploadedDataUrl(pUrl)
      setFileNote('Ảnh chụp thực địa mốc ranh giới thửa đất có tọa độ GPS')
      setLocalFile({ name: pName, size: pSize, type: 'jpg', dataUrl: pUrl })
    } else if (presetType === 'doc') {
      const pName = 'BaoCao_KetQua_DoDac_DiaChinh.docx'
      const pSize = '1.4 MB'
      setUploadedFileName(pName)
      setUploadedFileSize(pSize)
      setUploadedFileType('docx')
      setUploadedDataUrl(null)
      setFileNote('Báo cáo thẩm định kỹ thuật đo đạc theo mẫu số 05/ĐĐ')
      setLocalFile({ name: pName, size: pSize, type: 'docx', dataUrl: null })
    } else {
      const pName = 'BanTrichDo_DiaChinh_HieuChinh_v2.pdf'
      const pSize = '3.6 MB'
      setUploadedFileName(pName)
      setUploadedFileSize(pSize)
      setUploadedFileType('pdf')
      setUploadedDataUrl(null)
      setFileNote('Bản trích đo đã căn chỉnh mốc 3 sai số dưới 0.05m')
      setLocalFile({ name: pName, size: pSize, type: 'pdf', dataUrl: null })
    }
  }

  const handleSaveUpload = async (e) => {
    e.preventDefault()
    if (!uploadedFileName.trim()) return

    setLocalFile({
      name: uploadedFileName.trim(),
      size: uploadedFileSize || '2.5 MB',
      type: uploadedFileType || uploadedFileName.split('.').pop()?.toLowerCase() || 'pdf',
      dataUrl: uploadedDataUrl || undefined,
    })

    setIsSubmitting(true)
    if (onUpdateChecklistFile) {
      await onUpdateChecklistFile(nodeId, checklistItem?.id || doc?.template_id, {
        fileName: uploadedFileName.trim(),
        fileSize: uploadedFileSize || '2.5 MB',
        fileType: uploadedFileType || uploadedFileName.split('.').pop()?.toLowerCase() || 'pdf',
        fileDataUrl: uploadedDataUrl || undefined,
        uploaderInfo: `Tải lên bởi: ${uploader.trim()}`,
        note: fileNote.trim() || undefined,
        autoResolveIfRejected: autoResolve,
      })
    }
    setIsSubmitting(false)
    setUploadSuccessMessage('Đã cập nhật tệp thành công vào hồ sơ!')
    setTimeout(() => {
      setUploadSuccessMessage('')
      setActiveTab('preview')
    }, 1000)
  }


  const renderFileIcon = (ext) => {
    if (['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext)) {
      return <ImageIcon size={20} color="#059669" />
    }
    if (['dwg', 'dxf', 'dgn'].includes(ext)) {
      return <FileCode size={20} color="#0891b2" />
    }
    return <FileText size={20} color="#2563eb" />
  }

  const reviewStatus =
    doc?.review_status ||
    checklistItem?.review_by_template?.[doc?.template_id]?.review_status ||
    checklistItem?.status ||
    'rejected'

  const rejectionReason =
    doc?.rejection_reason ||
    checklistItem?.review_by_template?.[doc?.template_id]?.rejection_reason ||
    'Bản scan chưa có dấu xác nhận phòng TN&MT'

  return (
    <div
      className="dpm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Xem tài liệu ${currentFileName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="dpm-dialog">
        {/* Hidden screen-reader title for testing compatibility */}
        <span className="dpm-sr-only">Xem tài liệu {currentFileName}</span>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="dpm-header">
          <div className="dpm-header-left">
            <div className="dpm-icon-box">
              {renderFileIcon(rawExt)}
            </div>
            <div className="dpm-header-info">
              <div className="dpm-title-row">
                <h3 className="dpm-file-name" title={currentFileName}>
                  {currentFileName}
                </h3>
                <span className="dpm-ext-badge">{rawExt}</span>
              </div>
              <p className="dpm-subtitle">
                {checklistItem?.title || doc?.name || 'Bản trích đo địa chính'} • {currentFileSize}
              </p>
            </div>
          </div>

          <div className="dpm-header-actions">
            <button
              type="button"
              className="dpm-btn-download"
              onClick={() => {
                if (currentDataUrl) {
                  const a = document.createElement('a')
                  a.href = currentDataUrl
                  a.download = currentFileName
                  a.click()
                } else {
                  alert(`Đang tải xuống tệp: ${currentFileName} (${currentFileSize})`)
                }
              }}
              title="Tải tệp về máy"
            >
              <Download size={14} />
              <span>Tải về</span>
            </button>
            <button
              type="button"
              className="dpm-btn-close"
              onClick={onClose}
              aria-label="Đóng cửa sổ"
              title="Đóng"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* ── Navigation Tabs ─────────────────────────────────────────────── */}
        <nav className="dpm-nav-bar" aria-label="Điều hướng xem trước và tải lên">
          <div className="dpm-tabs-group">
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`dpm-tab-btn ${activeTab === 'preview' ? 'is-active-preview' : ''}`}
            >
              <Eye size={14} />
              <span>Xem tệp hồ sơ</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`dpm-tab-btn ${activeTab === 'upload' ? 'is-active-upload' : ''}`}
            >
              <Upload size={14} />
              <span>Tải lên / Thay thế tệp</span>
              <span className="dpm-tab-badge">Docs, PDF, Ảnh</span>
            </button>
          </div>

          <span className="dpm-support-hint">Hỗ trợ Word, PDF, Ảnh, CAD</span>
        </nav>

        {/* ── Modal Body ──────────────────────────────────────────────────── */}
        <div className="dpm-body">
          {activeTab === 'preview' ? (
            /* TAB 1: PREVIEW */
            <>
              {/* Real File Preview Surface */}
              <div className="dpm-file-preview-wrap">
                {/* Document Viewer Toolbar */}
                <div className="dpm-doc-toolbar">
                  <div className="dpm-toolbar-left">
                    {renderFileIcon(rawExt)}
                    <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {currentFileName}
                    </span>
                    <span className="dpm-ext-badge" style={{ fontSize: '9px', padding: '1px 5px' }}>
                      {rawExt.toUpperCase()}
                    </span>
                  </div>

                  <div className="dpm-toolbar-center">
                    <button
                      type="button"
                      className="dpm-toolbar-btn"
                      onClick={() => setZoom((z) => Math.max(z - 20, 60))}
                      title="Thu nhỏ"
                    >
                      -
                    </button>
                    <span className="dpm-zoom-label">{zoom}%</span>
                    <button
                      type="button"
                      className="dpm-toolbar-btn"
                      onClick={() => setZoom((z) => Math.min(z + 20, 200))}
                      title="Phóng to"
                    >
                      +
                    </button>
                    <span style={{ margin: '0 4px', color: '#cbd5e1' }}>|</span>
                    <span style={{ fontSize: '10px', color: '#64748b' }}>Trang 1 / 1</span>
                  </div>

                  <div className="dpm-toolbar-right">
                    {currentDataUrl ? (
                      <a
                        href={currentDataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="dpm-toolbar-btn"
                        title="Mở toàn màn hình"
                      >
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="dpm-toolbar-btn"
                        onClick={() => setZoom(100)}
                        title="Đặt lại kích thước 100%"
                      >
                        1:1
                      </button>
                    )}
                  </div>
                </div>

                {/* Viewport content */}
                <div className="dpm-doc-viewport">
                  {isPdf && currentDataUrl ? (
                    <iframe
                      className="dpm-preview-iframe"
                      src={currentDataUrl}
                      title={currentFileName}
                    />
                  ) : isImage && currentDataUrl ? (
                    <div className="dpm-img-wrapper">
                      <img
                        className="dpm-preview-img"
                        src={currentDataUrl}
                        alt={currentFileName}
                        style={{ transform: `scale(${zoom / 100})` }}
                      />
                    </div>
                  ) : isDocx && currentDataUrl && docxState !== 'error' ? (
                    <div
                      className="dpm-docx-surface"
                      ref={docxSurfaceRef}
                      style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
                    />
                  ) : isImage && !currentDataUrl ? (
                    <div className="dpm-img-wrapper">
                      <img
                        className="dpm-preview-img"
                        src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&auto=format&fit=crop&q=80"
                        alt="Ảnh chụp thực địa"
                        style={{ transform: `scale(${zoom / 100})` }}
                      />
                    </div>
                  ) : (isCad || rawExt === 'dwg' || rawExt === 'dxf' || /bản vẽ|trích đo|sơ đồ/i.test(currentFileName)) ? (
                    /* Cadastral Drawing Technical Sheet */
                    <div
                      className="dpm-cad-sheet"
                      style={{ transform: `scale(${zoom / 100})` }}
                    >
                      <div className="dpm-cad-header">
                        <div className="dpm-cad-nation">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
                        <div className="dpm-cad-motto">Độc lập - Tự do - Hạnh phúc</div>
                        <div className="dpm-cad-title">BẢN TRÍCH ĐO ĐỊA CHÍNH THỬA ĐẤT</div>
                      </div>

                      <div className="dpm-cad-meta-strip">
                        <span><strong>Thửa số:</strong> 24</span>
                        <span><strong>Tờ bản đồ:</strong> 12</span>
                        <span><strong>Diện tích:</strong> 128.5 m² (ODT)</span>
                        <span><strong>Hệ tọa độ:</strong> VN-2000</span>
                      </div>

                      <div className="dpm-cad-plot-area">
                        <div className="dpm-cad-drawing-box">
                          <span className="dpm-compass-rose">🧭 BẮC</span>
                          <svg viewBox="0 0 160 120" style={{ width: '100%', height: '100%' }}>
                            <polygon
                              points="25,20 135,32 145,100 20,88"
                              fill="rgba(59, 130, 246, 0.08)"
                              stroke="#0f172a"
                              strokeWidth="1.8"
                            />
                            {/* Points & Labels */}
                            <circle cx="25" cy="20" r="3" fill="#2563eb" />
                            <text x="28" y="18" fontSize="8" fontWeight="bold">1</text>
                            <circle cx="135" cy="32" r="3" fill="#2563eb" />
                            <text x="138" y="30" fontSize="8" fontWeight="bold">2</text>
                            <circle cx="145" cy="100" r="3" fill="#ef4444" />
                            <text x="148" y="105" fontSize="8" fontWeight="bold" fill="#dc2626">3*</text>
                            <circle cx="20" cy="88" r="3" fill="#2563eb" />
                            <text x="10" y="94" fontSize="8" fontWeight="bold">4</text>

                            {/* Dimension edge labels */}
                            <text x="75" y="22" fontSize="7" fill="#475569" textAnchor="middle">5.20m</text>
                            <text x="144" y="68" fontSize="7" fill="#475569" textAnchor="start">24.50m</text>
                            <text x="80" y="98" fontSize="7" fill="#475569" textAnchor="middle">5.15m</text>
                            <text x="12" y="55" fontSize="7" fill="#475569" textAnchor="end">24.60m</text>

                            {/* Center Parcel Label */}
                            <text x="80" y="56" fontSize="9" fontWeight="bold" fill="#1e3a8a" textAnchor="middle">
                              Thửa 24
                            </text>
                            <text x="80" y="68" fontSize="7" fill="#64748b" textAnchor="middle">
                              128.5 m²
                            </text>
                          </svg>
                        </div>

                        <div className="dpm-coord-table-box">
                          <div className="dpm-coord-table-title">BẢNG KÊ TỌA ĐỘ (VN-2000)</div>
                          <table className="dpm-coord-table">
                            <thead>
                              <tr>
                                <th>Điểm</th>
                                <th>X (m)</th>
                                <th>Y (m)</th>
                                <th>d (m)</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td>1</td>
                                <td>2322120.45</td>
                                <td>593120.12</td>
                                <td>5.20</td>
                              </tr>
                              <tr>
                                <td>2</td>
                                <td>2322123.80</td>
                                <td>593125.30</td>
                                <td>24.50</td>
                              </tr>
                              <tr style={{ background: '#fef2f2' }}>
                                <td style={{ color: '#dc2626', fontWeight: 'bold' }}>3</td>
                                <td>2322099.30</td>
                                <td>593124.80</td>
                                <td>5.15</td>
                              </tr>
                              <tr>
                                <td>4</td>
                                <td>2322096.10</td>
                                <td>593119.65</td>
                                <td>24.60</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="dpm-cad-title-block">
                        <div className="dpm-sign-cell">
                          <span className="dpm-sign-title">ĐƠN VỊ ĐO ĐẠC</span>
                          <span className="dpm-sign-name">CTCP ĐC Bách Khoa</span>
                        </div>
                        <div className="dpm-sign-cell">
                          <span className="dpm-sign-title">NGƯỜI KIỂM TRA</span>
                          <span className="dpm-sign-name">KS. Nguyễn Văn Tuấn</span>
                        </div>
                        <div className="dpm-sign-cell">
                          <span className="dpm-sign-title">PHÊ DUYỆT HỒ SƠ</span>
                          <span className="dpm-seal-stamp">ĐÃ ĐỐI SOÁT</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Official Legal Document Sheet */
                    <div
                      className="dpm-legal-sheet"
                      style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
                    >
                      <div className="dpm-legal-head">
                        <div>
                          <div className="dpm-legal-agency">UBND THÀNH PHỐ HÀ NỘI</div>
                          <div className="dpm-legal-no">Số: 18/BC-ĐĐĐC</div>
                        </div>
                        <div>
                          <div className="dpm-legal-nation">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
                          <div className="dpm-legal-motto">Độc lập - Tự do - Hạnh phúc</div>
                        </div>
                      </div>

                      <div className="dpm-legal-doc-title">
                        {checklistItem?.title || doc?.name || 'BÁO CÁO KẾT QUẢ ĐO ĐẠC ĐỊA CHÍNH'}
                      </div>
                      <div className="dpm-legal-subtitle">
                        (Kèm theo hồ sơ kỹ thuật số: ĐĐ-2026/TĐ-018 - Ngày 03/09/2026)
                      </div>

                      <div className="dpm-legal-body">
                        <p>
                          <strong>1. Căn cứ pháp lý:</strong> Luật Đất đai năm 2024 và Quy chuẩn kỹ thuật quốc gia về đo đạc địa chính cơ sở của Bộ Tài nguyên và Môi trường.
                        </p>
                        <p>
                          <strong>2. Kết quả kiểm tra đối soát ranh giới:</strong> Đã kiểm tra thực địa các mốc giới thửa đất số 24, tờ bản đồ địa chính số 12. Diện tích đo đạc thực tế là 128.5 m², sai số trong giới hạn cho phép.
                        </p>
                        <p>
                          <strong>3. Tình trạng tệp hồ sơ:</strong> {currentFileName} ({currentFileSize}) đã được lưu trữ và kiểm định đối chiếu trên hệ thống cơ sở dữ liệu địa chính.
                        </p>
                      </div>

                      <div className="dpm-legal-footer-signs">
                        <div>
                          <div><em>Hà Nội, ngày 03 tháng 09 năm 2026</em></div>
                          <div style={{ fontWeight: 'bold', marginTop: '4px' }}>CÁN BỘ ĐO ĐẠC ĐỊA CHÍNH</div>
                          <div style={{ color: '#059669', fontWeight: 'bold', marginTop: '16px' }}>
                            [Đã ký số điện tử SHA-256]
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>


              {/* Metadata Grid Card */}
              <div className="dpm-meta-card">
                <div className="dpm-meta-field">
                  <span className="dpm-meta-label">Hồ sơ địa chính số:</span>
                  <span className="dpm-meta-val">ĐĐ-2026/TĐ-018</span>
                </div>
                <div className="dpm-meta-field">
                  <span className="dpm-meta-label">Tình trạng kiểm định:</span>
                  <span className="dpm-meta-val" style={{ color: reviewStatus === 'rejected' ? '#e11d48' : '#15803d' }}>
                    {reviewStatus === 'rejected'
                      ? 'Nguyên nhân từ chối'
                      : reviewStatus === 'approved'
                        ? 'Đã duyệt hợp lệ'
                        : 'Chờ duyệt'}
                  </span>
                </div>
                <div className="dpm-meta-field">
                  <span className="dpm-meta-label">
                    {reviewStatus === 'rejected' ? 'Nguyên nhân chi tiết:' : 'Người cập nhật:'}
                  </span>
                  <span className="dpm-meta-val" title={rejectionReason}>
                    {rejectionReason}
                  </span>
                </div>
                <div className="dpm-meta-field">
                  <span className="dpm-meta-label">Chữ ký số điện tử:</span>
                  <span className="dpm-meta-val is-sha">
                    <CheckCircle size={14} />
                    Đã chứng thực SHA-256
                  </span>
                </div>
              </div>

              {/* Call to Action Banner */}
              <div className="dpm-cta-banner">
                <div className="dpm-cta-text">
                  <Upload size={16} color="#2563eb" />
                  <span>Cần thay đổi hoặc đính kèm tài liệu mới cho mục này?</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('upload')}
                  className="dpm-cta-btn"
                >
                  Tải file lên ngay
                </button>
              </div>
            </>
          ) : (
            /* TAB 2: UPLOAD & REPLACE */
            <form onSubmit={handleSaveUpload} className="dpm-upload-form">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsDragging(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f) processSelectedFile(f)
                }}
                className={`dpm-dropzone ${isDragging ? 'is-dragging' : ''}`}
              >
                <input
                  type="file"
                  id="dpm-file-input"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.svg,.dwg,.dxf,.zip"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) processSelectedFile(f)
                  }}
                  style={{ display: 'none' }}
                />
                <label htmlFor="dpm-file-input" className="dpm-drop-content" style={{ cursor: 'pointer' }}>
                  <div className="dpm-drop-icon">
                    <Upload size={22} />
                  </div>
                  <div className="dpm-drop-text">
                    <strong>Nhấn vào đây để duyệt file từ máy</strong> hoặc kéo thả vào ô này
                  </div>
                  <div className="dpm-drop-chips">
                    <span className="dpm-chip dpm-chip--pdf">PDF (.pdf)</span>
                    <span className="dpm-chip dpm-chip--doc">Word (.doc, .docx)</span>
                    <span className="dpm-chip dpm-chip--img">Hình ảnh (JPG, PNG)</span>
                    <span className="dpm-chip dpm-chip--cad">CAD (.dwg, .dxf)</span>
                  </div>
                </label>
              </div>

              {/* Quick Sample Presets */}
              <div>
                <span className="dpm-presets-title">Gợi ý chọn nhanh file mẫu thử nghiệm:</span>
                <div className="dpm-presets-grid">
                  <button
                    type="button"
                    onClick={() => handlePickPreset('image')}
                    className="dpm-preset-btn"
                  >
                    <div className="dpm-preset-head">
                      <ImageIcon size={14} color="#059669" />
                      Ảnh mốc giới .jpg
                    </div>
                    <span className="dpm-preset-sub">Ảnh chụp thực địa</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePickPreset('doc')}
                    className="dpm-preset-btn"
                  >
                    <div className="dpm-preset-head">
                      <FileText size={14} color="#2563eb" />
                      Báo cáo Word .docx
                    </div>
                    <span className="dpm-preset-sub">Báo cáo thẩm định</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePickPreset('pdf')}
                    className="dpm-preset-btn"
                  >
                    <div className="dpm-preset-head">
                      <FileText size={14} color="#dc2626" />
                      Bản vẽ .pdf
                    </div>
                    <span className="dpm-preset-sub">Trích đo hiệu chỉnh</span>
                  </button>
                </div>
              </div>

              {/* Inputs */}
              <div className="dpm-form-row">
                <label className="dpm-label">Tên file hiển thị</label>
                <input
                  type="text"
                  value={uploadedFileName}
                  onChange={(e) => setUploadedFileName(e.target.value)}
                  placeholder="VD: TrichDo_DC_Draft.dwg hoặc Anh_ThucDia_01.jpg"
                  required
                  className="dpm-input font-mono"
                />
              </div>

              <div className="dpm-form-grid-2">
                <div className="dpm-form-row">
                  <label className="dpm-label">Người thực hiện tải lên</label>
                  <input
                    type="text"
                    value={uploader}
                    onChange={(e) => setUploader(e.target.value)}
                    required
                    className="dpm-input"
                  />
                </div>
                <div className="dpm-form-row">
                  <label className="dpm-label">Ghi chú đính kèm</label>
                  <input
                    type="text"
                    value={fileNote}
                    onChange={(e) => setFileNote(e.target.value)}
                    placeholder="VD: Bản sửa đổi ngày 03/09"
                    className="dpm-input"
                  />
                </div>
              </div>

              {reviewStatus === 'rejected' && (
                <label className="dpm-checkbox-card">
                  <input
                    type="checkbox"
                    checked={autoResolve}
                    onChange={(e) => setAutoResolve(e.target.checked)}
                  />
                  <span>Tự động khắc phục lỗi từ chối và đổi trạng thái mục này thành &quot;Hợp lệ&quot;</span>
                </label>
              )}

              {uploadSuccessMessage && (
                <div className="dpm-msg-success">
                  <Check size={16} />
                  <span>{uploadSuccessMessage}</span>
                </div>
              )}

              {/* Actions */}
              <div className="dpm-upload-actions">
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className="dpm-btn-secondary"
                >
                  Quay lại xem trước
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !uploadedFileName.trim()}
                  className="dpm-btn-primary"
                >
                  <Upload size={14} />
                  <span>{isSubmitting ? 'Đang lưu...' : 'Lưu và Cập nhật tệp'}</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer className="dpm-footer">
          <span>Hệ thống Quản lý Quy trình Đo đạc Địa chính 2026</span>
          <button
            type="button"
            onClick={onClose}
            className="dpm-btn-footer-close"
          >
            Đóng
          </button>
        </footer>
      </div>
    </div>
  )
}
