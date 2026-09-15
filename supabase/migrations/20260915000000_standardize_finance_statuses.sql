begin;

-- Finance-only data cleanup.  UI labels remain Vietnamese, but persisted
-- values are canonical English enum values consumed by the backend.
-- This migration intentionally does not touch workflow, checklist, payroll,
-- or handover status columns.

update public.cashflow_transactions
set status = case
    when lower(btrim(status)) in ('settled', 'đã quyết toán', 'da_quyet_toan')
        then 'SETTLED'
    when lower(btrim(status)) in (
        'completed', 'approved', 'hoàn thành', 'hoan_thanh',
        'đã duyệt', 'da_duyet'
    ) then 'COMPLETED'
    when lower(btrim(status)) in ('pending', 'chờ duyệt', 'cho_duyet')
        then 'PENDING'
    when lower(btrim(status)) in ('rejected', 'từ chối', 'tu_choi')
        then 'REJECTED'
    when lower(btrim(status)) in ('cancelled', 'đã hủy', 'da_huy')
        then 'CANCELLED'
    when status is null or btrim(status) = '' then 'PENDING'
    else status
end;

update public.cashflow_transactions
set transaction_type = case
    when lower(btrim(transaction_type)) in ('income', 'thu', 'thu tiền', 'thu_tien')
        then 'INCOME'
    when lower(btrim(transaction_type)) in ('expense', 'chi', 'chi tiền', 'chi_tien')
        then 'EXPENSE'
    when lower(btrim(transaction_type)) in ('advance', 'tạm ứng', 'tam_ung')
        then 'ADVANCE'
    when lower(btrim(transaction_type)) in (
        'reimbursement', 'hoàn ứng', 'hoan_ung', 'quyết toán',
        'quyet_toan', 'advance_clear'
    ) then 'REIMBURSEMENT'
    else transaction_type
end
where transaction_type is not null;

update public.cashflow_transactions
set payment_method = case
    when lower(btrim(payment_method)) in ('cash', 'tiền mặt', 'tien_mat', 'tm')
        then 'CASH'
    when lower(btrim(payment_method)) in (
        'bank_transfer', 'bank', 'chuyển khoản', 'chuyen_khoan', 'ck', 'ckhoản'
    ) then 'BANK_TRANSFER'
    else payment_method
end
where payment_method is not null;

update public.cashflow_transactions
set scope = case
    when lower(btrim(scope)) in ('company', 'công ty', 'cong_ty') then 'COMPANY'
    when lower(btrim(scope)) in ('internal', 'nội bộ', 'noi_bo') then 'INTERNAL'
    when scope is null or btrim(scope) = '' then 'COMPANY'
    else scope
end;

update public.fund_opening_balances
set payment_method = case
    when lower(btrim(payment_method)) in ('cash', 'tiền mặt', 'tien_mat', 'tm')
        then 'CASH'
    when lower(btrim(payment_method)) in (
        'bank_transfer', 'bank', 'chuyển khoản', 'chuyen_khoan', 'ck', 'ckhoản'
    ) then 'BANK_TRANSFER'
    else payment_method
end
where payment_method is not null;

alter table public.cashflow_transactions
    alter column status set default 'PENDING',
    alter column scope set default 'COMPANY';

comment on column public.cashflow_transactions.status is
    'Canonical finance enum: COMPLETED, SETTLED, PENDING, REJECTED, CANCELLED. UI labels are localized separately.';
comment on column public.cashflow_transactions.transaction_type is
    'Canonical finance enum: INCOME, EXPENSE, ADVANCE, REIMBURSEMENT.';
comment on column public.cashflow_transactions.payment_method is
    'Canonical finance enum: CASH, BANK_TRANSFER.';
comment on column public.cashflow_transactions.scope is
    'Canonical finance enum: COMPANY, INTERNAL.';

commit;
