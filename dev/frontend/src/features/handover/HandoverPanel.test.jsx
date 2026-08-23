import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HandoverPanel from './HandoverPanel';

const handoverState = {
  contract_id: '2003/BK-2026',
  debt: {
    is_settled: false,
    remaining: 5000000,
    total_value: 10000000,
    paid: 5000000,
    percent: 50,
    pending_amount: 0,
    has_override: false,
  },
  gate: { is_open: true, reason: '' },
  lane_a: {
    label: 'Bàn giao hồ sơ',
    done: false,
    can_do: false,
    desc: 'Chờ xác nhận bàn giao',
  },
  lane_b: {
    label: 'Thu tiền',
    done: false,
    can_record_payment: true,
    desc: 'Ghi nhận các đợt thanh toán',
  },
  installments: [],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('HandoverPanel payment method select', () => {
  it('uses the custom select inside the payment modal and keeps the value contract', async () => {
    const fetchMock = vi.fn((url) => {
      if (String(url).endsWith('/deliverables')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: null }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: handoverState }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <HandoverPanel taskNodeId="task-1" addToast={vi.fn()} onChanged={vi.fn()} />
    );

    fireEvent.click(await screen.findByRole('button', { name: /ghi nhận thanh toán/i }));

    const paymentTrigger = () => document.body.querySelector('.ui-select__trigger');
    await waitFor(() => expect(paymentTrigger()?.textContent).toContain('Tiền mặt'));
    expect(document.body.querySelectorAll('select')).toHaveLength(0);

    fireEvent.click(paymentTrigger());
    fireEvent.click(screen.getByRole('option', { name: 'Chuyển khoản' }));

    expect(paymentTrigger()).toHaveTextContent('Chuyển khoản');
  });
});
