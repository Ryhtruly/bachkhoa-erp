-- Xoá sạch data mẫu (khách seed_test + hợp đồng của họ). Không đụng data thật.
delete from public.receivables where contract_id in
  (select id from public.contracts where customer_id in (select id from public.customers where source_channel='seed_test'));
delete from public.service_lines where contract_id in
  (select id from public.contracts where customer_id in (select id from public.customers where source_channel='seed_test'));
delete from public.contracts where customer_id in (select id from public.customers where source_channel='seed_test');
delete from public.customers where source_channel='seed_test';
