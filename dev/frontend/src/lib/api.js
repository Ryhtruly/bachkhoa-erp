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
const DEFAULT_CACHE_TTL_MS = 10000;
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút cho Master Data & Catalogs
const DATA_CACHE_TTL_MS = 60 * 1000; // 60 giây cho danh sách và mẫu
const SWR_STALE_THRESHOLD_MS = 15 * 1000; // 15 giây: sau mốc này trả cache ngay và fetch ngầm cập nhật

const inFlight = new Map();
const readCache = new Map();

export function getCacheTTL(path) {
  if (!path) return DEFAULT_CACHE_TTL_MS;
  const cleanPath = String(path).split('?')[0];
  if (
    cleanPath.startsWith('/api/catalog/') ||
    cleanPath.startsWith('/api/config') ||
    cleanPath === '/api/document-register/workflow-nodes' ||
    cleanPath === '/api/document-register/storage-locations' ||
    cleanPath === '/api/contracts/workflow/catalog'
  ) {
    return CATALOG_CACHE_TTL_MS;
  }
  if (
    cleanPath.startsWith('/api/contracts/workspace') ||
    cleanPath.startsWith('/api/document-register/templates') ||
    cleanPath.startsWith('/api/document-register/register') ||
    cleanPath.startsWith('/api/contracts/workflow/templates')
  ) {
    return DATA_CACHE_TTL_MS;
  }
  return DEFAULT_CACHE_TTL_MS;
}

const L2_CACHE_PREFIX = 'bk_l2_cache:';
const L2_CACHE_EXPIRY_PREFIX = 'bk_l2_exp:';

function getL2Cache(path) {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(L2_CACHE_PREFIX + path);
    if (!raw) return undefined;
    const exp = Number(window.localStorage.getItem(L2_CACHE_EXPIRY_PREFIX + path) || 0);
    if (Date.now() > exp) {
      window.localStorage.removeItem(L2_CACHE_PREFIX + path);
      window.localStorage.removeItem(L2_CACHE_EXPIRY_PREFIX + path);
      return undefined;
    }
    return raw;
  } catch {
    return undefined;
  }
}

function setL2Cache(path, raw, ttlMs) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const cleanPath = String(path).split('?')[0];
  const isPersistable = cleanPath.startsWith('/api/catalog/')
    || cleanPath.startsWith('/api/config')
    || cleanPath.startsWith('/api/document-register/')
    || cleanPath.startsWith('/api/contracts/workflow/templates');
  if (!isPersistable) return;

  try {
    window.localStorage.setItem(L2_CACHE_PREFIX + path, raw);
    window.localStorage.setItem(L2_CACHE_EXPIRY_PREFIX + path, String(Date.now() + ttlMs));
  } catch {
    // QuotaExceeded hoặc private mode — bỏ qua êm thấm
  }
}

function removeL2Cache(pattern) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(L2_CACHE_PREFIX)) {
        const path = key.slice(L2_CACHE_PREFIX.length);
        if (!pattern || path.includes(pattern)) {
          window.localStorage.removeItem(key);
          window.localStorage.removeItem(L2_CACHE_EXPIRY_PREFIX + path);
        }
      }
    }
  } catch {
    // Bỏ qua
  }
}

/** Đọc bản đã nhớ NGAY, không qua promise — trả undefined nếu chưa có hoặc hết hạn. */
export function peekApiCache(path) {
  const cached = readCache.get(path);
  if (cached) {
    const ttl = getCacheTTL(path);
    if (Date.now() - cached.at < ttl) {
      return JSON.parse(cached.raw);
    }
  }
  const l2Raw = getL2Cache(path);
  if (l2Raw) {
    try {
      const parsed = JSON.parse(l2Raw);
      readCache.set(path, { raw: l2Raw, at: Date.now() - SWR_STALE_THRESHOLD_MS });
      return parsed;
    } catch {
      // JSON hỏng
    }
  }
  return undefined;
}

/** Vứt bản đọc đã nhớ theo phạm vi tiền tố, hoặc toàn bộ nếu không truyền tham số. */
export function clearApiCache(scope) {
  if (!scope) {
    readCache.clear();
    inFlight.clear();
    removeL2Cache();
    return;
  }
  const prefix = String(scope);
  for (const key of readCache.keys()) {
    if (key.startsWith(prefix) || key.includes(prefix)) {
      readCache.delete(key);
    }
  }
  for (const key of inFlight.keys()) {
    if (key.startsWith(prefix) || key.includes(prefix)) {
      inFlight.delete(key);
    }
  }
  removeL2Cache(prefix);
}

/** Nạp trước API vào RAM cache ngầm (dùng cho hover/focus) không gây nghẽn UI */
export function prefetchApi(path, options = {}) {
  if (!path) return;
  const cached = readCache.get(path);
  const ttl = getCacheTTL(path);
  if (cached && Date.now() - cached.at < ttl / 2) return; // Đang còn rất mới thì không cần prefetch

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => {
      apiFetch(path, options).catch(() => {});
    }, { timeout: 800 });
  } else {
    setTimeout(() => {
      apiFetch(path, options).catch(() => {});
    }, 0);
  }
}

function invalidateOnMutation(path) {
  const clean = String(path).split('?')[0];
  if (clean.startsWith('/api/contracts/')) {
    clearApiCache('/api/contracts/');
  } else if (clean.startsWith('/api/document-register/')) {
    clearApiCache('/api/document-register/');
  } else if (clean.startsWith('/api/employee-portal/')) {
    clearApiCache('/api/employee-portal/');
  } else {
    // Với các mutation chung (như test /api/z), xóa sạch
    clearApiCache();
  }
}

export async function apiFetch(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();

  // Chỉ gộp/nhớ lượt ĐỌC, và bỏ qua khi bên gọi tự mang signal: chia chung một
  // promise thì một bên huỷ là bên kia gãy theo.
  if (method !== 'GET' || options.signal) {
    if (method !== 'GET') invalidateOnMutation(path);
    return requestOnce(path, options);
  }

  const ttl = getCacheTTL(path);
  let cached = readCache.get(path);
  if (!cached) {
    const l2Raw = getL2Cache(path);
    if (l2Raw) {
      cached = { raw: l2Raw, at: Date.now() - SWR_STALE_THRESHOLD_MS };
      readCache.set(path, cached);
    }
  }

  if (cached) {
    const age = Date.now() - cached.at;
    if (age < ttl) {
      // SWR: Nếu dữ liệu trong khoảng quá stale threshold và không có inFlight, fetch ngầm cập nhật
      if (age >= SWR_STALE_THRESHOLD_MS && !inFlight.has(path)) {
        requestOnce(path, options)
          .then((body) => {
            const raw = JSON.stringify(body ?? null);
            readCache.set(path, { at: Date.now(), raw });
            setL2Cache(path, raw, ttl);
          })
          .catch(() => {});
      }
      return JSON.parse(cached.raw);
    }
  }

  const flying = inFlight.get(path);
  if (flying) return flying.then(raw => JSON.parse(raw));

  const promise = requestOnce(path, options)
    .then((body) => {
      const raw = JSON.stringify(body ?? null);
      readCache.set(path, { at: Date.now(), raw });
      setL2Cache(path, raw, ttl);
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


