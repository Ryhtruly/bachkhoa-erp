/**
 * fileSave.js — Tiện ích lưu file với hộp thoại chọn thư mục tùy ý (Save As)
 *
 * Sử dụng File System Access API (`window.showSaveFilePicker`) trên các trình duyệt hiện đại
 * (Chrome, Edge, Cốc Cốc, Opera) cho phép người dùng tự do chọn bất kỳ ổ đĩa / thư mục nào
 * trên máy tính (D:\, E:\, Desktop, thư mục Khách hàng,...) để lưu file.
 *
 * Trình duyệt không hỗ trợ sẽ báo kết quả để UI hướng dẫn dùng Chrome hoặc Edge.
 */

import { getAccessToken, refreshAccessToken } from './api';

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

const MIME_EXTENSION_MAP = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'text/plain': '.txt',
};

export function extractExtension(nameOrPath) {
  if (!nameOrPath || typeof nameOrPath !== 'string') return '';
  const clean = nameOrPath.split('?')[0].split('#')[0];
  const match = clean.match(/\.([a-zA-Z0-9]{2,6})$/);
  return match ? `.${match[1].toLowerCase()}` : '';
}

export function resolveDocumentFileName(doc, headerFileName = null, mimeType = null) {
  const detectedExt =
    extractExtension(headerFileName) ||
    extractExtension(doc?.file_name) ||
    extractExtension(doc?.link) ||
    (mimeType ? MIME_EXTENSION_MAP[String(mimeType).toLowerCase()] : '') ||
    '';

  let baseName = '';
  if (doc?.title && typeof doc.title === 'string' && doc.title.trim()) {
    baseName = doc.title.trim();
  } else if (headerFileName && typeof headerFileName === 'string' && headerFileName.trim()) {
    baseName = headerFileName.trim();
  } else if (doc?.file_name && typeof doc.file_name === 'string' && doc.file_name.trim()) {
    baseName = doc.file_name.trim();
  } else if (doc?.link && typeof doc.link === 'string') {
    baseName = doc.link.split('/').pop() || '';
  } else if (doc?.id) {
    baseName = String(doc.id).trim();
  } else {
    baseName = 'Tai_Lieu';
  }

  const existingExt = extractExtension(baseName);
  if (!existingExt && detectedExt) {
    return `${baseName}${detectedExt}`;
  }
  return baseName;
}

export function downloadBlob(blob, fileName = 'tai-lieu') {
  if (typeof window === 'undefined') return;
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    if (anchor.parentNode) anchor.parentNode.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
  }, 1000);
}

export async function fetchProtectedDocumentFile(documentUrl, accessToken) {
  let token = accessToken || getAccessToken();
  let response = await fetch(documentUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 401) {
    try {
      token = await refreshAccessToken();
      response = await fetch(documentUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // Refresh thất bại, chuyển tiếp xử lý lỗi HTTP
    }
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || 'Không thể tải tài liệu');
  }

  let fileName = null;
  const contentDisposition = response.headers?.get ? response.headers.get('content-disposition') : null;
  if (contentDisposition) {
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match) {
      try {
        fileName = decodeURIComponent(utf8Match[1]);
      } catch {
        fileName = utf8Match[1];
      }
    } else {
      const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
      if (quotedMatch) {
        fileName = quotedMatch[1];
      } else {
        const simpleMatch = contentDisposition.match(/filename=([^; ]+)/i);
        if (simpleMatch) fileName = simpleMatch[1];
      }
    }
  }

  const blob = await response.blob();
  const mimeType = (response.headers?.get ? response.headers.get('content-type') : null) || blob.type || '';
  return { blob, fileName, mimeType };
}

export async function fetchProtectedDocumentBlob(documentUrl, accessToken) {
  const result = await fetchProtectedDocumentFile(documentUrl, accessToken);
  return result.blob;
}
