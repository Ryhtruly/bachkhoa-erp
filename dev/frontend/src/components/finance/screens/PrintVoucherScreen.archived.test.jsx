import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { VoucherTemplate } from './PrintVoucherScreen';

afterEach(() => cleanup());

const baseProps = {
  title: 'PHIẾU CHI',
  voucherId: 'PC-09/2026-001',
  date: '2026-09-15',
  personName: 'Nguyễn Văn A',
  labelPerson: 'Người nhận tiền',
  description: 'Chi phí kiểm tra',
  amount: '100000',
  amountWords: 'Một trăm nghìn đồng',
  category: 'Khác',
  paymentMethod: 'CASH',
};

describe('VoucherTemplate archived status', () => {
  it('shows a non-posting archive warning for rejected vouchers', () => {
    render(<VoucherTemplate {...baseProps} status="REJECTED" />);

    expect(screen.getByText('BẢN LƯU - CHỨNG TỪ BỊ TỪ CHỐI')).toBeInTheDocument();
    expect(screen.getByText('Không có giá trị ghi sổ và không phát sinh thu chi trên sổ quỹ.')).toBeInTheDocument();
  });

  it('does not show an archive warning for completed vouchers', () => {
    render(<VoucherTemplate {...baseProps} status="COMPLETED" />);

    expect(screen.queryByText(/BẢN LƯU - CHỨNG TỪ/)).not.toBeInTheDocument();
  });

  it('shows a draft warning for pending vouchers', () => {
    render(<VoucherTemplate {...baseProps} status="PENDING" />);

    expect(screen.getByText('BẢN DỰ THẢO - CHỜ DUYỆT')).toBeInTheDocument();
    expect(screen.getByText('Chưa có giá trị ghi sổ và chưa phải chứng từ chính thức.')).toBeInTheDocument();
  });
});
