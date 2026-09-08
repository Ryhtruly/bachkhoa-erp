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
});
