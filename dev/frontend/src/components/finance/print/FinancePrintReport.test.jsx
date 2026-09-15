import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FinancePrintReport from './FinancePrintReport';

describe('FinancePrintReport', () => {
  it('renders supplied signer names in the print footer', () => {
    render(
      <FinancePrintReport
        title="Bảng lương văn phòng"
        columns={[]}
        signers={[
          { role: 'Người lập biểu', name: 'Lê Văn Sáu' },
          { role: 'Kế toán trưởng', name: 'Kế toán A' },
          { role: 'Giám đốc', name: 'Giám đốc B' },
        ]}
      />
    );

    expect(screen.getByText('Lê Văn Sáu')).toBeInTheDocument();
    expect(screen.getByText('Kế toán A')).toBeInTheDocument();
    expect(screen.getByText('Giám đốc B')).toBeInTheDocument();
  });

  it('allows table headers to wrap naturally to prevent overflow into adjacent columns', () => {
    render(
      <FinancePrintReport
        title="Sổ Thu Chi"
        columns={[
          { key: 'partner', label: 'Đối tác / Người giao dịch', width: '135px', align: 'left' },
          { key: 'method', label: 'Hình thức', width: '85px', align: 'center' },
          { key: 'fixed_col', label: 'Cố định', width: '50px', headerNowrap: true },
        ]}
      />
    );

    const partnerTh = screen.getByText('Đối tác / Người giao dịch').closest('th');
    const methodTh = screen.getByText('Hình thức').closest('th');
    const fixedTh = screen.getByText('Cố định').closest('th');

    expect(partnerTh.style.whiteSpace).toBe('normal');
    expect(partnerTh.style.overflowWrap).toBe('break-word');
    expect(methodTh.style.whiteSpace).toBe('normal');
    expect(fixedTh.style.whiteSpace).toBe('nowrap');
  });
});
