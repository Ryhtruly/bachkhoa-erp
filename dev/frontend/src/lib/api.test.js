// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, downloadFile } from './api';

describe('apiFetch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
