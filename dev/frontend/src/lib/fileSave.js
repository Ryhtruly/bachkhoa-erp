/**
 * fileSave.js — Tiện ích lưu file với hộp thoại chọn thư mục tùy ý (Save As)
 *
 * Sử dụng File System Access API (`window.showSaveFilePicker`) trên các trình duyệt hiện đại
 * (Chrome, Edge, Cốc Cốc, Opera) cho phép người dùng tự do chọn bất kỳ ổ đĩa / thư mục nào
 * trên máy tính (D:\, E:\, Desktop, thư mục Khách hàng,...) để lưu file.
 *
 * Tự động fallback về Blob Download nếu trình duyệt không hỗ trợ File System Access API.
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

  // 2. Cơ chế dự phòng: Kích hoạt tải về với thẻ <a> và download attribute
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = suggestedName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 1000);
    return { success: true, method: 'download' };
  }

  return { success: false, reason: 'Unsupported environment' };
}
