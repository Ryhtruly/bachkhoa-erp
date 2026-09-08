import { describe, expect, it } from 'vitest';
import { getPrintableTransactions } from './cashflowPrintUtils';

describe('CashflowScreen print rows', () => {
  it('excludes rejected, cancelled and pending transactions from the printed ledger', () => {
    const transactions = [
      { id: 'PT-001', status: 'COMPLETED', amount: 100 },
      { id: 'PT-002', status: 'REJECTED', amount: 200 },
      { id: 'PC-003', status: 'CANCELLED', amount: 300 },
      { id: 'PC-004', status: 'PENDING', amount: 400 },
      { id: 'PT-005', status: 'Hoàn thành', amount: 500 },
    ];

    expect(getPrintableTransactions(transactions).map(row => row.id)).toEqual([
      'PT-001',
      'PT-005',
    ]);
  });
});
