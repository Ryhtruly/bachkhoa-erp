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
  // Đổi phiên thì mọi bản đọc đã nhớ đều thuộc về người cũ.
  clearApiCache();
}

export function getAccessToken() {
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

/* ── Gộp lượt gọi trùng + nhớ bản đọc trong thời gian ngắn ───────────────────
 * Đo trên máy thật: mỗi lần mở màn Quy trình bắn 8 lượt, mỗi endpoint đúng hai
 * lần, và không có lớp cache nào cả. Hai cơ chế dưới đây xử lý hai nguyên nhân
 * khác nhau:
 *
 *   inFlight  — hai chỗ cùng hỏi một URL trong lúc lượt đầu chưa về thì dùng
 *               chung đúng một lượt. Đây cũng là thứ triệt cái nhân đôi của
 *               StrictMode ở dev.
 *   readCache — mở lại màn vừa xem trong vài giây thì vẽ ngay, không đợi mạng.
 *
 * Giữ TTL rất ngắn và XOÁ SẠCH sau mỗi lệnh ghi: thà tốn thêm một lượt gọi còn
 * hơn để Giám đốc lưu xong mà vẫn nhìn thấy số cũ.
 *
 * Bản lưu giữ dạng chuỗi rồi parse lại cho từng người đọc — nếu phát thẳng một
 * object dùng chung, chỗ nào lỡ sửa nó là những chỗ còn lại thấy theo.
 */
const READ_CACHE_TTL_MS = 5000;
const inFlight = new Map();
const readCache = new Map();

/** Đọc bản đã nhớ NGAY, không qua promise — trả undefined nếu chưa có.
 *
 * Dùng để gieo state ban đầu lúc render: effect chạy sau lần vẽ đầu, nên nếu
 * chỉ dựa vào effect thì khung hình đầu tiên luôn là trạng thái rỗng, rồi giật
 * một cái khi dữ liệu về. Có sẵn trong cache thì vẽ đúng ngay từ đầu.
 */
export function peekApiCache(path) {
  const cached = readCache.get(path);
  if (!cached || Date.now() - cached.at >= READ_CACHE_TTL_MS) return undefined;
  return JSON.parse(cached.raw);
}

/** Vứt mọi bản đọc đã nhớ. Gọi khi biết dữ liệu vừa đổi ngoài luồng apiFetch. */
export function clearApiCache() {
  readCache.clear();
  inFlight.clear();
}

export async function apiFetch(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();

  // Chỉ gộp/nhớ lượt ĐỌC, và bỏ qua khi bên gọi tự mang signal: chia chung một
  // promise thì một bên huỷ là bên kia gãy theo.
  if (method !== 'GET' || options.signal) {
    if (method !== 'GET') readCache.clear();
    return requestOnce(path, options);
  }

  const cached = readCache.get(path);
  if (cached && Date.now() - cached.at < READ_CACHE_TTL_MS) {
    return JSON.parse(cached.raw);
  }

  const flying = inFlight.get(path);
  if (flying) return flying.then(raw => JSON.parse(raw));

  const promise = requestOnce(path, options)
    .then((body) => {
      const raw = JSON.stringify(body ?? null);
      readCache.set(path, { at: Date.now(), raw });
      return raw;
    })
    .finally(() => { inFlight.delete(path); });

  inFlight.set(path, promise);
  return promise.then(raw => JSON.parse(raw));
}

async function requestOnce(path, options = {}) {
  const { headers: callerHeaders, timeout = 10000, signal: callerSignal, ...fetchOptions } = options;
  const headers = { ...(callerHeaders || {}) };
  const token = window.localStorage.getItem(ACCESS_TOKEN_KEY);

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (fetchOptions.body && typeof fetchOptions.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
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


