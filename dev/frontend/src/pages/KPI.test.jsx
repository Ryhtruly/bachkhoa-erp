import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import KPI from './KPI';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
  getAccessToken: vi.fn(() => 'mock-token'),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('KPI Screen Ranking & Tie-breaking', () => {
  it('renders "Chưa có dữ liệu" and "—" for rank when all employees have 0 score', async () => {
    vi.spyOn(api, 'apiFetch').mockResolvedValue({
      status: 'success',
      data: [
        { employee: 'Hồ Thị Mỹ Hằng', total_completed: 0, on_time_rate: 100, rejections: 0, avg_time: 0, final_score: 0, performance: 'Chưa đánh giá' },
        { employee: 'Nguyễn Hoan Khai', total_completed: 0, on_time_rate: 100, rejections: 0, avg_time: 0, final_score: 0, performance: 'Chưa đánh giá' },
        { employee: 'Nguyễn Văn A', total_completed: 0, on_time_rate: 100, rejections: 0, avg_time: 0, final_score: 0, performance: 'Chưa đánh giá' },
      ]
    });

    render(<KPI />);

    await waitFor(() => {
      expect(screen.getByText('Chưa có dữ liệu')).toBeInTheDocument();
    });

    // No employee should have Top 1 tag
    expect(screen.queryByText('Top 1')).not.toBeInTheDocument();

    // All ranks should display '—'
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it('correctly handles tied scores for rank 1 and secondary criteria', async () => {
    vi.spyOn(api, 'apiFetch').mockResolvedValue({
      status: 'success',
      data: [
        { employee: 'Nhân Sự 1', total_completed: 15, on_time_rate: 95, rejections: 0, avg_time: 1, final_score: 110, performance: 'Xuất sắc' },
        { employee: 'Nhân Sự 2', total_completed: 15, on_time_rate: 95, rejections: 0, avg_time: 1, final_score: 110, performance: 'Xuất sắc' },
        { employee: 'Nhân Sự 3', total_completed: 8, on_time_rate: 80, rejections: 1, avg_time: 2, final_score: 85, performance: 'Tốt' },
      ]
    });

    render(<KPI />);

    await waitFor(() => {
      expect(screen.getByText('Bảng Điểm KPI Nhân Sự')).toBeInTheDocument();
    });

    // Both tied top performers should have a restrained leading badge
    const leadingTags = screen.getAllByText('Dẫn đầu');
    expect(leadingTags).toHaveLength(2);

    // Stats card should mention tied rank 1
    expect(screen.getByText(/Đồng hạng 1/)).toBeInTheDocument();

    // The 3rd employee should have #3 (Standard Competition Rank)
    expect(screen.getByText('#3')).toBeInTheDocument();
  });

  it('uses a compact ERP summary hierarchy instead of a decorative dashboard block', async () => {
    vi.spyOn(api, 'apiFetch').mockResolvedValue({
      status: 'success',
      data: [{ employee: 'Nhân Sự 1', total_completed: 12, on_time_rate: 95, rejections: 0, avg_time: 1, final_score: 100, performance: 'Xuất sắc' }]
    });

    render(<KPI />);

    await waitFor(() => {
      expect(screen.getByText('Bảng Điểm KPI Nhân Sự')).toBeInTheDocument();
    });

    expect(document.querySelector('.kpi-page')).toBeInTheDocument();
    expect(document.querySelector('.kpi-header__eyebrow')).toHaveTextContent('Hiệu suất nhân sự');
    expect(document.querySelectorAll('.kpi-summary__item')).toHaveLength(4);
    expect(document.querySelector('.kpi-summary__item--leader')).toBeInTheDocument();
    expect(screen.getByText('Đúng hạn trung bình')).toBeInTheDocument();
    expect(screen.getByText('Dẫn đầu kỳ')).toBeInTheDocument();
    expect(screen.getByText('Đánh giá theo hồ sơ hoàn thành, đúng hạn, nộp lại và thời gian xử lý.')).toBeInTheDocument();
    expect(screen.queryByText(/Thuật toán tự động chấm điểm hiệu suất/)).not.toBeInTheDocument();
  });

  it('explains how to access the full KPI table on narrow screens', async () => {
    vi.spyOn(api, 'apiFetch').mockResolvedValue({
      status: 'success',
      data: [{ employee: 'Nhân Sự 1', total_completed: 12, on_time_rate: 95, rejections: 0, avg_time: 1, final_score: 100, performance: 'Xuất sắc' }]
    });

    render(<KPI />);

    await waitFor(() => {
      expect(screen.getByText('Bảng Điểm KPI Nhân Sự')).toBeInTheDocument();
    });

    expect(screen.getByText(/Vuốt ngang để xem đầy đủ các chỉ số/i)).toBeInTheDocument();
  });
});
