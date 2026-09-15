-- Bách Khoa ERP - Finance enum/status backfill
-- Run this script manually on the intended PostgreSQL database.
-- It only touches Accounting tables:
--   public.cashflow_transactions
--   public.fund_opening_balances
-- It does not modify workflow, checklist, payroll, or handover statuses.

begin;

-- 1) Preview existing values before changing anything.
select 'cashflow_transactions.status' as field, coalesce(status, '<NULL>') as value, count(*)
from public.cashflow_transactions
group by status
order by value;

select 'cashflow_transactions.transaction_type' as field, coalesce(transaction_type, '<NULL>') as value, count(*)
from public.cashflow_transactions
group by transaction_type
order by value;

select 'cashflow_transactions.payment_method' as field, coalesce(payment_method, '<NULL>') as value, count(*)
from public.cashflow_transactions
group by payment_method
order by value;

select 'cashflow_transactions.scope' as field, coalesce(scope, '<NULL>') as value, count(*)
from public.cashflow_transactions
group by scope
order by value;

-- 2) Normalize known legacy values.  SETTLED is mapped before COMPLETED so
-- a genuine "Đã quyết toán" row is not downgraded to "COMPLETED".
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

-- 3) Review values that the script could not classify.
select 'UNKNOWN_STATUS' as issue, status as value, count(*)
from public.cashflow_transactions
where status not in ('COMPLETED', 'SETTLED', 'PENDING', 'REJECTED', 'CANCELLED')
group by status;

select 'UNKNOWN_TRANSACTION_TYPE' as issue, transaction_type as value, count(*)
from public.cashflow_transactions
where transaction_type not in ('INCOME', 'EXPENSE', 'ADVANCE', 'REIMBURSEMENT')
group by transaction_type;

select 'UNKNOWN_PAYMENT_METHOD' as issue, payment_method as value, count(*)
from public.cashflow_transactions
where payment_method not in ('CASH', 'BANK_TRANSFER')
group by payment_method;

select 'UNKNOWN_SCOPE' as issue, scope as value, count(*)
from public.cashflow_transactions
where scope not in ('COMPANY', 'INTERNAL')
group by scope;

-- 4) IMPORTANT: migration 20260822000000 previously mapped the old label
-- "Đã quyết toán" to COMPLETED.  That loses the distinction between a
-- completed voucher and a settled advance.  Do not auto-update those rows;
-- review them with Accounting first:
select id, document_number, transaction_type, status, category_code,
       description, amount, transaction_date
from public.cashflow_transactions
where status = 'COMPLETED'
  and (
      lower(coalesce(category_code, '')) like '%quyết toán%'
      or lower(coalesce(category_code, '')) like '%hoàn ứng%'
      or lower(coalesce(description, '')) like '%quyết toán%'
      or lower(coalesce(description, '')) like '%hoàn ứng%'
      or transaction_type in ('ADVANCE', 'REIMBURSEMENT')
  )
order by transaction_date, id;

commit;
