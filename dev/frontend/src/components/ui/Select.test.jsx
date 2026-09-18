import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Select from './Select';

afterEach(() => {
  cleanup();
});

const options = [
  { value: 'desc', label: 'Mới nhất' },
  { value: 'asc', label: 'Cũ nhất' },
];

describe('Select', () => {
  it('opens with accessible listbox state and selects an option', () => {
    const onChange = vi.fn();
    render(<Select id="sort" value="desc" options={options} onChange={onChange} />);

    const trigger = screen.getByRole('button', { name: 'Mới nhất' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Mới nhất' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('option', { name: 'Cũ nhất' }));

    expect(onChange).toHaveBeenCalledWith('asc');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('supports arrow navigation and Enter without changing the value contract', () => {
    const onChange = vi.fn();
    render(<Select value="desc" options={options} onChange={onChange} />);

    const trigger = screen.getByRole('button', { name: 'Mới nhất' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('asc');
  });

  it('closes on Escape and outside pointer interaction', () => {
    render(<Select value="desc" options={options} onChange={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: 'Mới nhất' });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('renders the open menu outside its wrapper so ancestor overflow cannot clip options', () => {
    render(<Select value="desc" options={options} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mới nhất' }));

    expect(screen.getByRole('listbox').parentElement).toBe(document.body);
  });

  it('keeps the full option label available when the visible text is truncated', () => {
    const longLabel = 'HD-AUTO-AF821C — Khách hàng Cam Trang (Dịch vụ: Đo hiện trạng | Quy mô: 120 m2)';
    render(<Select value="long" options={[{ value: 'long', label: longLabel }]} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: longLabel }));

    expect(screen.getByRole('option', { name: longLabel })).toHaveAttribute('title', longLabel);
  });

  it('does not open while disabled', () => {
    render(<Select value="desc" options={options} onChange={vi.fn()} disabled />);

    const trigger = screen.getByRole('button', { name: 'Mới nhất' });
    fireEvent.click(trigger);

    expect(trigger).toBeDisabled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
