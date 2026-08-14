/**
 * fileSave.js — Tiện ích lưu file với hộp thoại chọn thư mục tùy ý (Save As)
 *
 * Sử dụng File System Access API (`window.showSaveFilePicker`) trên các trình duyệt hiện đại
 * (Chrome, Edge, Cốc Cốc, Opera) cho phép người dùng tự do chọn bất kỳ ổ đĩa / thư mục nào
 * trên máy tính (D:\, E:\, Desktop, thư mục Khách hàng,...) để lưu file.
 *
 * Trình duyệt không hỗ trợ sẽ báo kết quả để UI hướng dẫn dùng Chrome hoặc Edge.
 */

const DOCX_FILE_TYPES = [
  {
    description: 'Tài liệu Word (*.docx)',
    accept: {
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
  },
];

export async function requestDocxSaveHandle(suggestedName = 'HopDong.docx') {
  if (typeof window === 'undefined' || typeof window.showSaveFilePicker !== 'function') {
    return { reason: 'SaveLocationUnsupported' };
  }

  try {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: DOCX_FILE_TYPES,
    });
    return { handle };
  } catch (error) {
    if (error?.name === 'AbortError') return { cancelled: true };
    throw error;
  }
}

export async function writeBlobToFileHandle(handle, blob) {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return { success: true, method: 'picker' };
}

export async function fetchProtectedDocumentBlob(documentUrl, accessToken) {
  const response = await fetch(documentUrl, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || 'Không thể tải tài liệu hợp đồng');
  }
  return response.blob();
}
