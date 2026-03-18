# Safeguard Combined

## Referral Tracking Seed
1. Apply migrations:
   - Run `python backend/database/scripts/run_create.py` to apply schema updates (includes `alter_20260216_referral_tracking.sql`).
2. Load seed data:
   - Run `psql "$DATABASE_URL" -f backend/database/schema/seed_referral_users.sql`.
3. Verify in Admin UI:
   - Open `/admin` and confirm the "Recent Users" table shows:
     - `kol_fan` as "Referred? = Yes" with code `KOL30`.
     - `plain_user` as "Referred? = No".
