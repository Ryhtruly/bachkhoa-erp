import { describe, expect, it } from 'vitest'

import { hydrateExistingCustomerAddress } from './ContractComposer'

describe('existing customer address hydration', () => {
  it('keeps the parsed address when the province list is not ready yet', () => {
    expect(hydrateExistingCustomerAddress({
      address: 'Số 12 Nguyễn Huệ, Phường Bến Nghé, TP. Hồ Chí Minh',
    }, null)).toEqual({
      detail: 'Số 12 Nguyễn Huệ',
      provinceCode: '',
      provinceName: 'TP. Hồ Chí Minh',
      wardCode: '',
      wardName: 'Phường Bến Nghé',
    })
  })
})
