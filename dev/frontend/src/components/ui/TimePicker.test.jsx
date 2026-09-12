import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TimePicker from './TimePicker';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TimePicker', () => {
  it('renders with 12h display formatted matching SA/CH and opens popover', () => {
    const onChange = vi.fn();
    render(<TimePicker value="17:54" onChange={onChange} format="12" />);

    // In 12h format, 17:54 is 05 : 54 CH
    const trigger = screen.getByRole('button', { name: /05 : 54\s+CH/ });
    expect(trigger).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Check columns exist
    expect(screen.getByText('GIỜ')).toBeInTheDocument();
    expect(screen.getByText('PHÚT')).toBeInTheDocument();
    expect(screen.getByText('BUỔI')).toBeInTheDocument();
  });

  it('selects hour, minute, and period in 12h mode', () => {
    const onChange = vi.fn();
    render(<TimePicker value="08:30" onChange={onChange} format="12" />);

    const trigger = screen.getByRole('button', { name: /08 : 30\s+SA/ });
    fireEvent.click(trigger);

    // Click hour '09'
    const hour09 = screen.getByRole('button', { name: 'Giờ 09' });
    fireEvent.click(hour09);
    expect(onChange).toHaveBeenCalledWith('09:30');

    // Click period 'CH' (PM)
    const periodCH = screen.getByRole('button', { name: 'Buổi CH' });
    fireEvent.click(periodCH);
    expect(onChange).toHaveBeenCalledWith('20:30'); // 8 PM
  });

  it('handles "Bây giờ" click', () => {
    const onChange = vi.fn();
    render(<TimePicker value="10:00" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /10 : 00\s+SA/ }));
    const nowBtn = screen.getByRole('button', { name: 'Bây giờ' });
    fireEvent.click(nowBtn);

    expect(onChange).toHaveBeenCalled();
    const calledWith = onChange.mock.calls[0][0];
    expect(calledWith).toMatch(/^\d{2}:\d{2}$/);
  });

  it('does not open when disabled', () => {
    const onChange = vi.fn();
    render(<TimePicker value="12:00" onChange={onChange} disabled />);

    const trigger = screen.getByRole('button', { name: /12 : 00\s+CH/ });
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
