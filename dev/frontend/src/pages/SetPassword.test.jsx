import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import SetPassword from './SetPassword';

describe('SetPassword Page', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.location;
    window.location = new URL('http://localhost:5173/set-password');
  });

  afterEach(() => {
    cleanup();
  });

  it('shows error if token is missing from URL', async () => {
    render(<SetPassword onDone={vi.fn()} />);

    expect(await screen.findByText(/Liên kết không hợp lệ: thiếu mã xác thực kích hoạt tài khoản/i)).toBeInTheDocument();
  });

  it('shows error if token is invalid or expired from backend', async () => {
    window.location = new URL('http://localhost:5173/set-password?token=invalid-token-123');

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ detail: 'Mã mời không tồn tại hoặc đã hết hạn.' }),
    });

    render(<SetPassword onDone={vi.fn()} />);

    expect(await screen.findByText(/Mã mời không tồn tại hoặc đã hết hạn/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /QUAY LẠI TRANG ĐĂNG NHẬP/i })).toBeInTheDocument();
  });

  it('loads invite data and allows user to set password when valid', async () => {
    window.location = new URL('http://localhost:5173/set-password?token=valid-token-xyz');

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          username: 'nhanvien01',
          employee_name: 'Nguyễn Văn A',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'jwt-access-token-123',
        }),
      });

    const onDoneMock = vi.fn();
    render(<SetPassword onDone={onDoneMock} />);

    expect(await screen.findByText('nhanvien01')).toBeInTheDocument();
    expect(screen.getByText(/Nguyễn Văn A/i)).toBeInTheDocument();

    const passInput = screen.getByPlaceholderText(/Nhập mật khẩu mới.../i);
    const confirmInput = screen.getByPlaceholderText(/Nhập lại mật khẩu mới.../i);
    const submitBtn = screen.getByRole('button', { name: /LƯU MẬT KHẨU & ĐĂNG NHẬP/i });

    // Button should be disabled initially
    expect(submitBtn).toBeDisabled();

    // Type matching valid password
    fireEvent.change(passInput, { target: { value: 'password123' } });
    fireEvent.change(confirmInput, { target: { value: 'password123' } });

    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Đặt mật khẩu thành công/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(onDoneMock).toHaveBeenCalledWith('jwt-access-token-123');
    }, { timeout: 2000 });
  });
});

