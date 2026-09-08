import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FilterBar from './FilterBar';

afterEach(() => cleanup());

describe('FilterBar select controls', () => {
  it('keeps sort changes routed to the existing callback', () => {
    const onSortChange = vi.fn();
    render(<FilterBar sort="desc" onSortChange={onSortChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sắp xếp' }));
    fireEvent.click(screen.getByRole('option', { name: 'Cũ nhất' }));

    expect(onSortChange).toHaveBeenCalledWith('asc');
  });
});
