-- Seed data for influencer codes + referral tracking.

WITH influencer_row AS (
    INSERT INTO marketing.influencers (name, referral_code, status)
    VALUES ('KOL Sample', 'KOL30', 'active')
    ON CONFLICT (referral_code) DO UPDATE
        SET name = EXCLUDED.name,
            status = EXCLUDED.status
    RETURNING id, referral_code
),
influencer_code AS (
    INSERT INTO marketing.influencer_codes (code, influencer_id, is_active, usage_count)
    SELECT referral_code, id, TRUE, 0
    FROM influencer_row
    ON CONFLICT (code) DO UPDATE
        SET influencer_id = EXCLUDED.influencer_id,
            is_active = EXCLUDED.is_active
    RETURNING id, code, influencer_id
),
referred_user AS (
    INSERT INTO auth.users (
        username,
        email,
        hashed_password,
        full_name,
        is_active,
        role,
        user_type,
        referral_code_used,
        referred_influencer_id,
        referred_at,
        last_login_at
    )
    VALUES (
        'kol_fan',
        'kol_fan@example.com',
        '$2b$12$Cjw7nWZ0b9Z2pwx0Xj3sOeQfEo8pH7vH4l0pdd1G6b7s1Yk5ZcX0u',
        'KOL Fan',
        TRUE,
        'user',
        'normal',
        (SELECT code FROM influencer_code),
        (SELECT influencer_id FROM influencer_code),
        NOW(),
        NOW()
    )
    ON CONFLICT (email) DO UPDATE
        SET referral_code_used = EXCLUDED.referral_code_used,
            referred_influencer_id = EXCLUDED.referred_influencer_id,
            referred_at = EXCLUDED.referred_at
    RETURNING user_id
),
referral_row AS (
    INSERT INTO marketing.referrals (user_id, influencer_code_id, referred_at, source)
    VALUES (
        (SELECT user_id FROM referred_user),
        (SELECT id FROM influencer_code),
        NOW(),
        'signup'
    )
    ON CONFLICT (user_id) DO UPDATE
        SET influencer_code_id = EXCLUDED.influencer_code_id,
            referred_at = EXCLUDED.referred_at,
            source = EXCLUDED.source
    RETURNING influencer_code_id
)
UPDATE marketing.influencer_codes
SET usage_count = 1,
    updated_at = NOW()
WHERE id = (SELECT influencer_code_id FROM referral_row);

INSERT INTO auth.users (
    username,
    email,
    hashed_password,
    full_name,
    is_active,
    role,
    user_type,
    last_login_at
)
VALUES (
    'plain_user',
    'plain_user@example.com',
    '$2b$12$Cjw7nWZ0b9Z2pwx0Xj3sOeQfEo8pH7vH4l0pdd1G6b7s1Yk5ZcX0u',
    'Plain User',
    TRUE,
    'user',
    'normal',
    NOW()
)
ON CONFLICT (email) DO NOTHING;
