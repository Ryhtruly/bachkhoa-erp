// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, clearApiCache, downloadFile, peekApiCache } from './api';

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
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
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

    const testBlob = new Blob(['excel data'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(testBlob, {
        status: 200,
        headers: { 'Content-Disposition': 'attachment; filename="Bao_Cao_Thu_Chi.xlsx"' }
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

    const testBlob = new Blob(['excel data']);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(testBlob, { status: 200 })
    ));

    const result = await downloadFile('/api/finance/export/monthly-dashboard-excel', 'default.xlsx');
    expect(result).toBeNull();
  });

  it('falls back to <a> click when showSaveFilePicker is not supported', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const testBlob = new Blob(['excel data']);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(testBlob, { status: 200 })
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
