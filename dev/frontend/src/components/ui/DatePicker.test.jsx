import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DatePicker from './DatePicker';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DatePicker', () => {
  it('keeps the existing day selection contract', () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-08-14" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /14\/08\/2026/ }));
    fireEvent.click(screen.getByRole('button', { name: '15' }));

    expect(onChange).toHaveBeenCalledWith('2026-08-15');
  });

  it('selects an accounting month without changing its YYYY-MM format', () => {
    const onChange = vi.fn();
    render(
      <DatePicker
        selectionMode="month"
        value="2026-08"
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Tháng 8 2026/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Tháng 9' }));

    expect(onChange).toHaveBeenCalledWith('2026-09');
  });

  it('does not open or clear when disabled', () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-08-14" onChange={onChange} disabled />);

    const trigger = screen.getByRole('button', { name: /14\/08\/2026/ });
    fireEvent.click(trigger);

    expect(trigger).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('right-aligns the popover when opening left-aligned would crowd the viewport edge', async () => {
    const rect = (values) => ({
      x: values.left,
      y: values.top,
      width: values.width,
      height: values.height,
      top: values.top,
      right: values.left + values.width,
      bottom: values.top + values.height,
      left: values.left,
      toJSON: () => ({}),
    });

    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function getRect() {
      if (this.classList?.contains('date-picker')) {
        return rect({ left: 800, top: 100, width: 164, height: 42 });
      }
      if (this.classList?.contains('date-picker__popover')) {
        return rect({ left: 800, top: 150, width: 320, height: 320 });
      }
      return rect({ left: 0, top: 0, width: 0, height: 0 });
    });

    render(<DatePicker value="2026-08-14" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /14\/08\/2026/ }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveClass('date-picker__popover--right');
    });
  });

  it('pulls the right-aligned popover back inside a narrow viewport', async () => {
    const rect = (values) => ({
      x: values.left,
      y: values.top,
      width: values.width,
      height: values.height,
      top: values.top,
      right: values.left + values.width,
      bottom: values.top + values.height,
      left: values.left,
      toJSON: () => ({}),
    });

    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(367);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function getRect() {
      if (this.classList?.contains('date-picker')) {
        return rect({ left: 338, top: 100, width: 164, height: 42 });
      }
      if (this.classList?.contains('date-picker__popover')) {
        return rect({ left: 338, top: 150, width: 320, height: 320 });
      }
      return rect({ left: 0, top: 0, width: 0, height: 0 });
    });

    render(<DatePicker value="2026-08-14" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /14\/08\/2026/ }));

    await waitFor(() => {
      expect(screen.getByRole('dialog').style.getPropertyValue('--date-picker-popover-right-offset'))
        .toBe('151px');
    });
  });

  it('keeps bottom placement when there is sufficient room below', async () => {
    const rect = (values) => ({
      x: values.left,
      y: values.top,
      width: values.width,
      height: values.height,
      top: values.top,
      right: values.left + values.width,
      bottom: values.top + values.height,
      left: values.left,
      toJSON: () => ({}),
    });

    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function getRect() {
      if (this.classList?.contains('date-picker')) {
        return rect({ left: 100, top: 300, width: 200, height: 42 });
      }
      if (this.classList?.contains('date-picker__popover')) {
        return rect({ left: 100, top: 350, width: 280, height: 280 });
      }
      return rect({ left: 0, top: 0, width: 0, height: 0 });
    });

    render(<DatePicker value="2026-08-14" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /14\/08\/2026/ }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).not.toHaveClass('date-picker__popover--top');
    });
  });

  it('flips to top placement only when space below is insufficient and space above fits', async () => {
    const rect = (values) => ({
      x: values.left,
      y: values.top,
      width: values.width,
      height: values.height,
      top: values.top,
      right: values.left + values.width,
      bottom: values.top + values.height,
      left: values.left,
      toJSON: () => ({}),
    });

    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function getRect() {
      if (this.classList?.contains('date-picker')) {
        return rect({ left: 100, top: 450, width: 200, height: 42 });
      }
      if (this.classList?.contains('date-picker__popover')) {
        return rect({ left: 100, top: 150, width: 280, height: 280 });
      }
      return rect({ left: 0, top: 0, width: 0, height: 0 });
    });

    render(<DatePicker value="2026-08-14" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /14\/08\/2026/ }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveClass('date-picker__popover--top');
    });
  });
});
