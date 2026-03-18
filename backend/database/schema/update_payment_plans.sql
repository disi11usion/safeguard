-- Update or insert payment plans without truncating other tables.
INSERT INTO payments.plans (
  plan_key, tier, billing_cycle, price_cents, currency,
  duration_days,
  news_analysis_limit, social_analysis_limit,
  data_access,
  api_access, priority_support,
  is_visible, is_active,
  description
)
VALUES
  (
    'free', 'free', 'none', 0, 'USD',
    NULL,
    10, 10, 'basic', FALSE, FALSE,
    TRUE, TRUE,
    'Free plan with limited analyses'
  ),
  (
    'basic_monthly', 'basic', 'monthly', 1999, 'USD',
    30,
    200, 200,
    'limited',
    FALSE, FALSE,
    TRUE, TRUE,
    'Basic monthly subscription'
  ),
  (
    'basic_yearly', 'basic', 'yearly', 14900, 'USD',
    365,
    3000, 3000,
    'limited',
    FALSE, TRUE,
    TRUE, TRUE,
    'Basic yearly subscription'
  ),
  (
    'premium_monthly', 'premium', 'monthly', 4999, 'USD',
    30,
    -1, -1,
    'full',
    TRUE, TRUE,
    TRUE, TRUE,
    'Premium monthly subscription'
  ),
  (
    'premium_yearly', 'premium', 'yearly', 37500, 'USD',
    365,
    -1, -1,
    'full',
    TRUE, TRUE,
    TRUE, TRUE,
    'Premium yearly subscription'
  ),
  (
    'enterprise_monthly', 'enterprise', 'monthly', 2500, 'USD',
    30,
    -1, -1,
    'full',
    TRUE, TRUE,
    TRUE, TRUE,
    'Enterprise monthly subscription'
  )
ON CONFLICT (plan_key) DO UPDATE SET
  tier = EXCLUDED.tier,
  billing_cycle = EXCLUDED.billing_cycle,
  price_cents = EXCLUDED.price_cents,
  currency = EXCLUDED.currency,
  duration_days = EXCLUDED.duration_days,
  news_analysis_limit = EXCLUDED.news_analysis_limit,
  social_analysis_limit = EXCLUDED.social_analysis_limit,
  data_access = EXCLUDED.data_access,
  api_access = EXCLUDED.api_access,
  priority_support = EXCLUDED.priority_support,
  is_visible = EXCLUDED.is_visible,
  is_active = EXCLUDED.is_active,
  description = EXCLUDED.description,
  updated_at = now();
