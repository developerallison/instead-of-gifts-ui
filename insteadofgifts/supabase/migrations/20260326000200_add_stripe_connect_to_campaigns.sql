-- Migration: add Stripe Connect fields to user_profiles and campaigns
-- All statements are idempotent (IF NOT EXISTS / DO NOTHING).

-- ---------------------------------------------------------------------------
-- 1. user_profiles — store the organiser's connected Stripe account
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- 2. campaigns — mirror the connected account so checkout can read it in one
--    query. Populated / synced by the stripe-connect-callback Edge Function.
-- ---------------------------------------------------------------------------

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS stripe_account_id       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- 3. RLS — protect stripe_onboarding_complete on campaigns from direct writes
--    by authenticated users.
--
--    Strategy: a BEFORE UPDATE trigger raises an exception when an
--    authenticated session (auth.uid() IS NOT NULL) tries to flip the flag.
--    The service-role key bypasses RLS entirely and executes as the postgres
--    superuser; in that context auth.uid() returns NULL, so the trigger
--    permits the write.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_campaign_stripe_onboarding_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service-role / superuser: auth.uid() is NULL → allow everything.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Authenticated user: block changes to stripe_onboarding_complete.
  IF NEW.stripe_onboarding_complete IS DISTINCT FROM OLD.stripe_onboarding_complete THEN
    RAISE EXCEPTION
      'stripe_onboarding_complete may only be set by the service role';
  END IF;

  RETURN NEW;
END;
$$;

-- Drop first so the CREATE is idempotent across re-runs.
DROP TRIGGER IF EXISTS trg_guard_campaign_stripe_onboarding_complete ON public.campaigns;

CREATE TRIGGER trg_guard_campaign_stripe_onboarding_complete
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_campaign_stripe_onboarding_complete();

-- ---------------------------------------------------------------------------
-- Note: user_profiles already restricts writes to the service role via its
-- existing RLS policies ("service-role can do anything"; authenticated users
-- can only SELECT their own row). No additional policy changes are required
-- for user_profiles.stripe_account_id or user_profiles.stripe_onboarding_complete.
-- ---------------------------------------------------------------------------
