-- Migration: 20260914140000_add_color_to_catalog.sql
-- Description: Add color column to service_packages and task_types for customizable UI badge colors.

BEGIN;

ALTER TABLE public.service_packages 
ADD COLUMN IF NOT EXISTS color VARCHAR(30) NULL DEFAULT '#3b82f6';

ALTER TABLE public.task_types 
ADD COLUMN IF NOT EXISTS color VARCHAR(30) NULL DEFAULT '#10b981';

-- Gán màu mặc định trực quan cho các gói hiện có nếu chưa có màu
UPDATE public.service_packages SET color = '#3b82f6' WHERE id = 'sp_001' AND (color IS NULL OR color = '');
UPDATE public.service_packages SET color = '#8b5cf6' WHERE id = 'sp_002' AND (color IS NULL OR color = '');
UPDATE public.service_packages SET color = '#f59e0b' WHERE id = 'sp_003' AND (color IS NULL OR color = '');

COMMIT;

