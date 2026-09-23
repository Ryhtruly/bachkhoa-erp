-- Migration: Customer Loyalty Tiers & Contract Discount Tracking
-- Description: Cấu hình khách hàng ưu tiên theo số hợp đồng đã làm và ghi nhận chiết khấu trên hợp đồng

CREATE TABLE IF NOT EXISTS public.customer_loyalty_tiers (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tier_name VARCHAR(100) NOT NULL UNIQUE,
    min_contracts INTEGER NOT NULL UNIQUE CHECK (min_contracts >= 1),
    discount_percent NUMERIC(5, 2) NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_customer_loyalty_tiers_active_min
ON public.customer_loyalty_tiers (is_active, min_contracts DESC);

-- Contract discount columns and loyalty tier tracking
ALTER TABLE public.contracts
ADD COLUMN IF NOT EXISTS loyalty_tier_id VARCHAR DEFAULT NULL,
ADD COLUMN IF NOT EXISTS loyalty_tier_name VARCHAR(100) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS loyalty_discount_percent NUMERIC(5, 2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS loyalty_discount_amount NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS original_value NUMERIC DEFAULT NULL;

-- Index on contracts(customer_id, status) for high-performance eligibility checks
CREATE INDEX IF NOT EXISTS idx_contracts_customer_status
ON public.contracts (customer_id, status);

-- Initial default tiers
INSERT INTO public.customer_loyalty_tiers (id, tier_name, min_contracts, discount_percent, description, is_active)
VALUES
    ('tier_silver', 'Khách hàng Thân Thiết', 2, 5.00, 'Áp dụng cho khách hàng đã hoàn thành từ 2 hợp đồng trở lên', TRUE),
    ('tier_gold', 'Khách hàng VIP Vàng', 5, 10.00, 'Áp dụng cho khách hàng đã hoàn thành từ 5 hợp đồng trở lên', TRUE)
ON CONFLICT (id) DO NOTHING;
