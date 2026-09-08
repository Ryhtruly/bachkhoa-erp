import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dropdown } from './Dropdown';

afterEach(() => cleanup());

describe('Dropdown', () => {
  it('preserves the existing string callback contract', () => {
    const onChange = vi.fn();
    render(
      <Dropdown
        value="cash"
        options={[{ value: 'cash', label: 'Tiền mặt' }, { value: 'bank', label: 'Ngân hàng' }]}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tiền mặt' }));
    fireEvent.click(screen.getByRole('option', { name: 'Ngân hàng' }));

    expect(onChange).toHaveBeenCalledWith('bank');
  });
});
