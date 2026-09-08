-- The contract number placeholder now uses contracts.id directly.
-- contract_number was intentionally removed as redundant.

update public.contract_templates
set
  placeholder_schema = (
    select jsonb_agg(
      case
        when item->>'placeholder' = 'SO_HOP_DONG'
          then jsonb_set(item, '{source}', to_jsonb('contracts.id'::text))
        else item
      end
      order by ordinality
    )
    from jsonb_array_elements(placeholder_schema) with ordinality as source_items(item, ordinality)
  ),
  updated_at = now()
where code = 'HOP_DONG_DICH_VU_KHUNG_BACH_KHOA';
