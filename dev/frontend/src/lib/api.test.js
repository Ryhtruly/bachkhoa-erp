// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, clearApiCache, downloadFile, getCacheTTL, peekApiCache, prefetchApi } from './api';

describe('apiFetch', () => {
  beforeEach(() => {
    localStorage.clear();
    // apiFetch nhớ bản đọc trong vài giây; không xoá thì test sau ăn kết quả
    // của test trước.
    clearApiCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubJson = (body) => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('hai chỗ cùng hỏi một URL trong lúc chờ thì chỉ đi MỘT lượt', async () => {
    // Đây cũng là thứ triệt cái nhân đôi của StrictMode ở dev.
    const fetchMock = stubJson({ ok: 1 });

    const [a, b] = await Promise.all([apiFetch('/api/x'), apiFetch('/api/x')]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ ok: 1 });
    expect(b).toEqual({ ok: 1 });
  });

  it('mỗi người đọc nhận một bản riêng, sửa bản này không đụng bản kia', async () => {
    stubJson({ danh_sach: [1, 2] });

    const a = await apiFetch('/api/y');
    a.danh_sach.push(3);
    const b = await apiFetch('/api/y');

    expect(b.danh_sach).toEqual([1, 2]);
  });

  it('đọc lại trong vài giây thì lấy bản đã nhớ, không gọi mạng', async () => {
    const fetchMock = stubJson({ ok: 1 });

    await apiFetch('/api/z');
    await apiFetch('/api/z');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sau một lệnh GHI thì mọi bản đã nhớ bị vứt', async () => {
    // Lưu xong mà vẫn thấy số cũ là lỗi nặng hơn nhiều so với tốn thêm một lượt.
    const fetchMock = stubJson({ ok: 1 });

    await apiFetch('/api/z');
    await apiFetch('/api/z', { method: 'POST', body: '{}' });
    await apiFetch('/api/z');

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('bên gọi tự mang signal thì KHÔNG gộp chung — một bên huỷ là bên kia gãy theo', async () => {
    const fetchMock = stubJson({ ok: 1 });
    const controller = new AbortController();

    await Promise.all([
      apiFetch('/api/w', { signal: controller.signal }),
      apiFetch('/api/w', { signal: controller.signal }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('peekApiCache trả bản đã nhớ ngay, chưa có thì undefined', async () => {
    // Gieo state ban đầu lúc render: nếu chỉ dựa vào effect thì khung hình đầu
    // luôn rỗng rồi giật một cái.
    stubJson({ ok: 1 });

    expect(peekApiCache('/api/p')).toBeUndefined();
    await apiFetch('/api/p');
    expect(peekApiCache('/api/p')).toEqual({ ok: 1 });
  });

  it('getCacheTTL phân loại TTL cho catalog và data endpoints', () => {
    expect(getCacheTTL('/api/catalog/service-packages')).toBe(300000);
    expect(getCacheTTL('/api/contracts/workspace?id=123')).toBe(60000);
    expect(getCacheTTL('/api/other')).toBe(10000);
  });

  it('clearApiCache hỗ trợ xóa theo scope tiền tố', async () => {
    stubJson({ ok: 1 });
    await apiFetch('/api/contracts/list');
    await apiFetch('/api/catalog/services');

    expect(peekApiCache('/api/contracts/list')).toEqual({ ok: 1 });
    expect(peekApiCache('/api/catalog/services')).toEqual({ ok: 1 });

    clearApiCache('/api/contracts/');
    expect(peekApiCache('/api/contracts/list')).toBeUndefined();
    expect(peekApiCache('/api/catalog/services')).toEqual({ ok: 1 });
  });

  it('prefetchApi nạp trước dữ liệu vào RAM cache', async () => {
    const fetchMock = stubJson({ preloaded: true });
    prefetchApi('/api/prefetch-test');

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      expect(peekApiCache('/api/prefetch-test')).toEqual({ preloaded: true });
    });
  });

  it('adds the saved bearer token to protected requests', async () => {
    localStorage.setItem('bachkhoa_access_token', 'jwt-token');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'emp-1' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/employee-portal/me');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/employee-portal/me',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer jwt-token' }),
      }),
    );
  });

  it('clears the session, dispatches unauthorized, and throws on a 401 response', async () => {
    localStorage.setItem('bachkhoa_access_token', 'expired-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Token expired' }), { status: 401 }),
    ));
    const onUnauthorized = vi.fn();
    window.addEventListener('bachkhoa:unauthorized', onUnauthorized, { once: true });

    await expect(apiFetch('/api/employee-portal/me')).rejects.toMatchObject({
      status: 401,
      message: 'Token expired',
    });

    expect(localStorage.getItem('bachkhoa_access_token')).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('lưu snapshot L2 vào localStorage cho các endpoint catalog và phục hồi ở peekApiCache khi RAM rỗng', async () => {
    stubJson({ data: [{ id: 'p1', name: 'Gói Đo Đạc' }] });

    await apiFetch('/api/catalog/service-packages');

    // Kiểm tra L2 localStorage đã lưu
    const l2Key = 'bk_l2_cache:/api/catalog/service-packages';
    expect(localStorage.getItem(l2Key)).toContain('Gói Đo Đạc');

    // Giả lập F5 / mở tab mới: xoá RAM cache nhưng giữ localStorage
    clearApiCache(); // clearApiCache không tham số xoá cả L2, hãy test xoá RAM bằng cách tạo kịch bản mới
    localStorage.setItem(l2Key, JSON.stringify({ data: [{ id: 'p1', name: 'Gói Đo Đạc' }] }));
    localStorage.setItem('bk_l2_exp:/api/catalog/service-packages', String(Date.now() + 60000));

    // peekApiCache phục hồi từ L2
    const restored = peekApiCache('/api/catalog/service-packages');
    expect(restored).toEqual({ data: [{ id: 'p1', name: 'Gói Đo Đạc' }] });
  });

  it('clearApiCache xoá sạch cả khoá L2 trong localStorage', async () => {
    localStorage.setItem('bk_l2_cache:/api/catalog/test', '{"ok":1}');
    localStorage.setItem('bk_l2_exp:/api/catalog/test', String(Date.now() + 60000));

    clearApiCache();

    expect(localStorage.getItem('bk_l2_cache:/api/catalog/test')).toBeNull();
    expect(localStorage.getItem('bk_l2_exp:/api/catalog/test')).toBeNull();
  });
});

describe('downloadFile with File System Access API & fallback', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    delete window.showSaveFilePicker;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens native showSaveFilePicker when supported', async () => {
    const mockWritable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockHandle = {
      createWritable: vi.fn().mockResolvedValue(mockWritable),
    };
    window.showSaveFilePicker = vi.fn().mockResolvedValue(mockHandle);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('excel data', {
        status: 200,
        headers: {
          'Content-Disposition': 'attachment; filename="Bao_Cao_Thu_Chi.xlsx"',
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }
      })
    ));

    const result = await downloadFile('/api/finance/export/monthly-dashboard-excel', 'default.xlsx');

    expect(window.showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'Bao_Cao_Thu_Chi.xlsx' })
    );
    expect(mockWritable.write).toHaveBeenCalled();
    expect(mockWritable.close).toHaveBeenCalled();
    expect(result).toBe('Bao_Cao_Thu_Chi.xlsx');
  });

  it('returns null when user cancels showSaveFilePicker without throwing error', async () => {
    const abortError = new Error('User cancelled');
    abortError.name = 'AbortError';
    window.showSaveFilePicker = vi.fn().mockRejectedValue(abortError);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('excel data', { status: 200 })
    ));

    const result = await downloadFile('/api/finance/export/monthly-dashboard-excel', 'default.xlsx');
    expect(result).toBeNull();
  });

  it('falls back to <a> click when showSaveFilePicker is not supported', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('excel data', { status: 200 })
    ));

    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/123');
    const mockRevokeObjectURL = vi.fn();
    window.URL.createObjectURL = mockCreateObjectURL;
    window.URL.revokeObjectURL = mockRevokeObjectURL;

    const result = await downloadFile('/api/finance/export/monthly-dashboard-excel', 'default.xlsx');

    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/123');
    expect(result).toBe('default.xlsx');
  });
});
