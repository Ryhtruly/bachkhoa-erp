const ACCESS_TOKEN_KEY = 'bachkhoa_access_token';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function clearAccessToken() {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function getAccessToken() {
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export async function apiFetch(path, options = {}) {
  const { headers: callerHeaders, timeout = 10000, signal: callerSignal, ...fetchOptions } = options;
  const headers = { ...(callerHeaders || {}) };
  const token = window.localStorage.getItem(ACCESS_TOKEN_KEY);

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const signal = callerSignal || controller.signal;

  try {
    const response = await fetch(path, { ...fetchOptions, headers, signal });
    clearTimeout(timeoutId);
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      if (response.status === 401) {
        clearAccessToken();
        window.dispatchEvent(new Event('bachkhoa:unauthorized'));
      }

      throw new ApiError(
        response.status,
        body?.detail || body?.message || response.statusText || 'Yêu cầu thất bại',
      );
    }

    return body;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new ApiError(408, 'Hết thời gian kết nối tới máy chủ');
    }
    throw error;
  }
}

export async function downloadFile(path, defaultFilename = 'download.xlsx') {
  const token = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, { headers });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      errorBody?.detail || errorBody?.message || response.statusText || 'Tải file thất bại'
    );
  }

  // Extract filename from header if available
  let filename = defaultFilename;
  const disposition = response.headers.get('Content-Disposition');
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) {
      filename = match[1].trim();
    }
  }

  const blob = await response.blob();

  // Mở hộp thoại chọn nơi lưu (Save As) nếu trình duyệt hỗ trợ File System Access API
  if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
    try {
      const isXlsx = filename.endsWith('.xlsx');
      const isDocx = filename.endsWith('.docx');
      const isPdf = filename.endsWith('.pdf');

      const fileTypes = isXlsx ? [
        {
          description: 'Bảng tính Excel (*.xlsx)',
          accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
        },
      ] : isDocx ? [
        {
          description: 'Tài liệu Word (*.docx)',
          accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
        },
      ] : isPdf ? [
        {
          description: 'Tài liệu PDF (*.pdf)',
          accept: { 'application/pdf': ['.pdf'] },
        },
      ] : [];

      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: fileTypes.length ? fileTypes : undefined,
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return filename;
    } catch (pickerError) {
      if (pickerError?.name === 'AbortError') {
        // Người dùng nhấn Hủy/Cancel hộp thoại chọn nơi lưu
        return null;
      }
      // Nếu có lỗi khác, tiếp tục fallback tải xuống thông thường
    }
  }

  // Fallback tải xuống tự động
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(blobUrl);
  return filename;
}


