import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DatePicker from './DatePicker';

afterEach(cleanup);

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
});
