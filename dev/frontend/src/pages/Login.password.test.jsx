import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import Login from './Login';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { ToastProvider } from '../contexts/ToastContext';

describe('Login Forgot Password Flow', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders login form by default and toggles to forgot password form', () => {
    render(<Login onLogin={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /Đăng nhập/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Quên mật khẩu\?/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Quên mật khẩu\?/i }));

    expect(screen.getByRole('heading', { name: /Quên mật khẩu/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/admin hoặc user@gmail.com/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gửi mã OTP qua Email/i })).toBeInTheDocument();
  });

  it('sends remember_me=true when the user selects Ghi nhớ', async () => {
    const onLogin = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'access-token',
        user: { username: 'staff' },
      }),
    });

    render(<Login onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText('Tài khoản'), { target: { value: 'staff' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ghi nhớ' }));
    fireEvent.click(screen.getByRole('button', { name: /Truy cập hệ thống/i }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('access-token', { username: 'staff' }));

    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      username: 'staff',
      password: 'password123',
      remember_me: true,
    });
  });

  it('sends OTP request and transitions to OTP verification step', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        email_masked: 'us***r@gmail.com',
        ttl_minutes: 10,
      }),
    });

    render(<Login onLogin={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Quên mật khẩu\?/i }));

    const input = screen.getByPlaceholderText(/admin hoặc user@gmail.com/i);
    fireEvent.change(input, { target: { value: 'testuser' } });

    fireEvent.click(screen.getByRole('button', { name: /Gửi mã OTP qua Email/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Xác thực OTP/i })).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText('••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tiếp tục đặt mật khẩu/i })).toBeInTheDocument();
  });

  it('verifies OTP and transitions to new password step', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, email_masked: 'us***r@gmail.com', ttl_minutes: 10 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true, message: 'Mã OTP chính xác.' }),
      });

    render(<Login onLogin={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Quên mật khẩu\?/i }));
    fireEvent.change(screen.getByPlaceholderText(/admin hoặc user@gmail.com/i), { target: { value: 'testuser' } });
    fireEvent.click(screen.getByRole('button', { name: /Gửi mã OTP qua Email/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('••••••')).toBeInTheDocument();
    });

    const otpInput = screen.getByPlaceholderText('••••••');
    fireEvent.change(otpInput, { target: { value: '123456' } });

    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục đặt mật khẩu/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Đặt lại mật khẩu/i })).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText(/Tối thiểu 6 ký tự/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Nhập lại mật khẩu mới/i)).toBeInTheDocument();
  });

  it('validates password mismatch on Step 3 before calling API', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, email_masked: 'us***r@gmail.com', ttl_minutes: 10 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true }),
      });

    render(<Login onLogin={vi.fn()} />);

    // Step 1
    fireEvent.click(screen.getByRole('button', { name: /Quên mật khẩu\?/i }));
    fireEvent.change(screen.getByPlaceholderText(/admin hoặc user@gmail.com/i), { target: { value: 'testuser' } });
    fireEvent.click(screen.getByRole('button', { name: /Gửi mã OTP qua Email/i }));

    // Step 2
    await waitFor(() => expect(screen.getByPlaceholderText('••••••')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('••••••'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục đặt mật khẩu/i }));

    // Step 3
    await waitFor(() => expect(screen.getByPlaceholderText(/Tối thiểu 6 ký tự/i)).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Tối thiểu 6 ký tự/i), { target: { value: 'newpassword123' } });
    fireEvent.change(screen.getByPlaceholderText(/Nhập lại mật khẩu mới/i), { target: { value: 'differentpassword' } });

    fireEvent.click(screen.getByRole('button', { name: /Cập nhật & Đăng nhập/i }));

    expect(screen.getByText(/Mật khẩu xác nhận không khớp/i)).toBeInTheDocument();
    // Verify fetch was only called twice (step 1 and step 2), not step 3
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('ChangePasswordModal', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders inputs and closes on cancel', () => {
    const handleClose = vi.fn();
    render(
      <ToastProvider>
        <ChangePasswordModal open={true} onClose={handleClose} />
      </ToastProvider>
    );

    expect(screen.getByText(/Đổi mật khẩu tài khoản/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Nhập mật khẩu đang sử dụng/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Tối thiểu 6 ký tự/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Nhập lại mật khẩu mới/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Hủy bỏ/i }));
    expect(handleClose).toHaveBeenCalled();
  });

  it('validates matching passwords and minimum length in modal', async () => {
    render(
      <ToastProvider>
        <ChangePasswordModal open={true} onClose={vi.fn()} />
      </ToastProvider>
    );

    fireEvent.change(screen.getByPlaceholderText(/Nhập mật khẩu đang sử dụng/i), { target: { value: 'oldpass123' } });
    fireEvent.change(screen.getByPlaceholderText(/Tối thiểu 6 ký tự/i), { target: { value: '123' } });
    fireEvent.change(screen.getByPlaceholderText(/Nhập lại mật khẩu mới/i), { target: { value: '123' } });

    fireEvent.click(screen.getByRole('button', { name: /Đổi mật khẩu/i }));
    expect(screen.getByText(/Mật khẩu mới phải có ít nhất 6 ký tự/i)).toBeInTheDocument();
  });
});
