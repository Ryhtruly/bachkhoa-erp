import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DataTable from './DataTable'

afterEach(() => cleanup())

describe('DataTable keyboard interaction', () => {
  it('opens a clickable row with Enter and Space', () => {
    const onRowClick = vi.fn()
    render(
      <DataTable
        columns={[{ key: 'name', label: 'Tên' }]}
        data={[{ id: 'row-1', name: 'Phiếu thu' }]}
        onRowClick={onRowClick}
      />,
    )

    const row = screen.getByRole('row', { name: 'Phiếu thu' })
    fireEvent.keyDown(row, { key: 'Enter' })
    fireEvent.keyDown(row, { key: ' ' })

    expect(onRowClick).toHaveBeenCalledTimes(2)
  })
})
