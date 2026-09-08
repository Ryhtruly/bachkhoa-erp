import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
        { employee: 'Hồ Thị Mỹ Hằng', total_completed: 0, on_time_rate: null, rejections: 0, avg_time: 0, final_score: 0, performance: 'Chưa đánh giá' },
        { employee: 'Nguyễn Hoan Khai', total_completed: 0, on_time_rate: null, rejections: 0, avg_time: 0, final_score: 0, performance: 'Chưa đánh giá' },
        { employee: 'Nguyễn Văn A', total_completed: 0, on_time_rate: null, rejections: 0, avg_time: 0, final_score: 0, performance: 'Chưa đánh giá' },
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

  it('renders analytics grid with score progress bars and performance insights', async () => {
    vi.spyOn(api, 'apiFetch').mockResolvedValue({
      status: 'success',
      data: [
        { employee: 'Nguyễn Văn A', total_completed: 4, on_time_rate: 100, rejections: 0, avg_time: 0.2, final_score: 88, performance: 'Tốt' },
        { employee: 'Hồ Thị Mỹ Hằng', total_completed: 2, on_time_rate: 100, rejections: 0, avg_time: 0, final_score: 84, performance: 'Tốt' },
      ]
    });

    render(<KPI />);

    await waitFor(() => {
      expect(screen.getByText('Bảng Điểm KPI Nhân Sự')).toBeInTheDocument();
    });

    expect(screen.getByText('Xếp hạng & Điểm KPI')).toBeInTheDocument();
    expect(screen.getByText('Phân bổ hiệu suất & Tốc độ')).toBeInTheDocument();
    expect(screen.getByText('Đạt loại Tốt & Xuất sắc')).toBeInTheDocument();
    expect(screen.getByText('Đúng hạn tuyệt đối (100%)')).toBeInTheDocument();
    expect(screen.getByText('Thời gian xử lý trung bình')).toBeInTheDocument();
  });

  it('shows no-data instead of 100 percent when the period has no completed work', async () => {
    vi.spyOn(api, 'apiFetch').mockResolvedValue({
      status: 'success',
      data: [{ employee: 'Nhân Sự Chưa Phát Sinh', total_completed: 0, on_time_rate: null, rejections: 0, avg_time: 0, final_score: 0, performance: 'Chưa đánh giá' }]
    });

    render(<KPI />);

    await waitFor(() => expect(screen.getByText('Đúng hạn trung bình')).toBeInTheDocument());

    const averageCard = document.querySelectorAll('.kpi-summary__item')[2];
    expect(averageCard).toHaveTextContent('—');
    expect(averageCard).not.toHaveTextContent('100%');
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
  });

  it('does not include employees without activity in the KPI analytics ranking', async () => {
    vi.spyOn(api, 'apiFetch').mockResolvedValue({
      status: 'success',
      data: [
        { employee: 'Nhân Sự Có Phát Sinh', total_completed: 4, on_time_rate: 100, rejections: 0, avg_time: 1, final_score: 88, performance: 'Tốt' },
        { employee: 'Nhân Sự Chưa Phát Sinh', total_completed: 0, on_time_rate: null, rejections: 0, avg_time: 0, final_score: 0, performance: 'Chưa đánh giá' },
      ]
    });

    render(<KPI />);

    await waitFor(() => expect(screen.getByText('Xếp hạng & Điểm KPI')).toBeInTheDocument());

    const chartNames = [...document.querySelectorAll('.kpi-bar-row__name')].map(node => node.textContent);
    expect(chartNames).toEqual(['#1 Nhân Sự Có Phát Sinh']);
  });

  it('shows a retryable error when the KPI endpoint fails', async () => {
    const fetchSpy = vi.spyOn(api, 'apiFetch').mockRejectedValueOnce(new Error('Server unavailable'));

    render(<KPI />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không tải được dữ liệu KPI'));
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();

    fetchSpy.mockResolvedValueOnce({ status: 'success', data: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  });

  it('renders KPI analytics on the agreed 100-point scale', async () => {
    vi.spyOn(api, 'apiFetch').mockResolvedValue({
      status: 'success',
      data: [{ employee: 'Nhân Sự Vượt Ngưỡng', total_completed: 20, on_time_rate: 100, rejections: 0, avg_time: 1, final_score: 110, performance: 'Xuất sắc' }]
    });

    render(<KPI />);

    await waitFor(() => expect(screen.getByText('Xếp hạng & Điểm KPI')).toBeInTheDocument());

    const scoreText = document.querySelector('.kpi-bar-row__score');
    expect(scoreText).toHaveTextContent('100/100 • Xuất sắc');
    expect(scoreText).not.toHaveTextContent('110/100 • Xuất sắc');
  });
});
