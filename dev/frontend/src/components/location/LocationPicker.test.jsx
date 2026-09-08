import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import LocationPicker from './LocationPicker'

function LocationPickerHarness() {
  const [value, setValue] = useState({
    provinceCode: '', provinceName: '', wardCode: '', wardName: '', detail: '', displayAddress: '',
  })
  return <>
    <LocationPicker value={value} onChange={setValue} />
    <output data-testid="address">{value.displayAddress}</output>
  </>
}

describe('LocationPicker', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('combines street detail with the selected ward and province', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'success', data: [{ code: '79', name: 'TP. Hồ Chí Minh' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'success', data: [{ code: '26734', name: 'Phường Bến Nghé', province_name: 'TP. Hồ Chí Minh' }] }) }))

    render(<LocationPickerHarness />)

    await screen.findByRole('option', { name: 'TP. Hồ Chí Minh' })
    expect(screen.getByLabelText('Tỉnh/Thành phố')).toBeRequired()
    expect(screen.getByLabelText('Phường/Xã')).toBeRequired()
    fireEvent.change(screen.getByLabelText('Tỉnh/Thành phố'), { target: { value: '79' } })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Phường Bến Nghé' })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Phường/Xã'), { target: { value: '26734' } })
    fireEvent.change(screen.getByLabelText('Số nhà, đường'), { target: { value: '12 Lê Lợi' } })

    expect(screen.getByTestId('address')).toHaveTextContent('12 Lê Lợi, Phường Bến Nghé, TP. Hồ Chí Minh')
  })
})
