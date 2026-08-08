// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './api';

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
