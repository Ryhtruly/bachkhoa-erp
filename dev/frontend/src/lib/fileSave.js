/**
 * fileSave.js — Tiện ích lưu file với hộp thoại chọn thư mục tùy ý (Save As)
 *
 * Sử dụng File System Access API (`window.showSaveFilePicker`) trên các trình duyệt hiện đại
 * (Chrome, Edge, Cốc Cốc, Opera) cho phép người dùng tự do chọn bất kỳ ổ đĩa / thư mục nào
 * trên máy tính (D:\, E:\, Desktop, thư mục Khách hàng,...) để lưu file.
 *
 * Trình duyệt không hỗ trợ sẽ báo kết quả để UI hướng dẫn dùng Chrome hoặc Edge.
 */

export async function saveFileWithUserLocation(blobOrUrl, suggestedName = 'HopDong.docx', customTypes = null) {
  let blob = blobOrUrl;
  if (typeof blobOrUrl === 'string') {
    const resp = await fetch(blobOrUrl);
    if (!resp.ok) {
      throw new Error(`Không thể tải tệp từ đường dẫn: ${blobOrUrl}`);
    }
    blob = await resp.blob();
  }

  const defaultTypes = [
    {
      description: 'Tài liệu Word (*.docx)',
      accept: {
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      },
    },
  ];

  const types = customTypes || defaultTypes;

  // 1. Thử dùng File System Access API để hỏi trực tiếp vị trí lưu
  if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types,
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { success: true, method: 'picker' };
    } catch (err) {
      if (err.name === 'AbortError') {
        // Người dùng chủ động huỷ chọn thư mục
        return { success: false, cancelled: true };
      }
      console.warn('showSaveFilePicker không thành công, chuyển sang cơ chế download dự phòng:', err);
    }
  }

  return { success: false, reason: 'SaveLocationUnsupported' };
}

export async function openProtectedDocument(documentUrl, accessToken) {
  const preview = window.open('about:blank', '_blank');
  if (!preview) {
    throw new Error('Trình duyệt đã chặn cửa sổ xem tài liệu');
  }
  preview.opener = null;

  try {
    const response = await fetch(documentUrl, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || 'Không thể mở tài liệu hợp đồng');
    }

    const objectUrl = window.URL.createObjectURL(await response.blob());
    preview.location.replace(objectUrl);
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
    return { success: true };
  } catch (error) {
    preview.close();
    throw error;
  }
}
