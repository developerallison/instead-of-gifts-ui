/**
 * Supabase Edge Function: stripe-connect-callback
 *
 * Called after the organiser returns from the Stripe Connect onboarding flow.
 * Retrieves the account from Stripe to check whether details_submitted is true,
 * then persists the completed status to user_profiles and syncs stripe_account_id
 * to any of the user's campaigns that do not yet have one.
 *
 * Runtime: Deno (Supabase Edge Runtime)
 * Auth: verify_jwt = true (configured in supabase/config.toml)
 */

import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';

interface StripeAccountSummary {
  id: string;
  email: string | null;
  country: string | null;
  defaultCurrency: string | null;
  businessType: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Initialise clients once
// ---------------------------------------------------------------------------

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  httpClient: Stripe.createFetchHttpClient(),
  apiVersion: '2025-03-31.basil',
});

/** Service-role client — bypasses RLS to write user_profiles / campaigns. */
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')            ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  // ── Authenticate the caller ──────────────────────────────────────────────
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) {
    return respond(401, { error: 'Missing Authorization header' });
  }

  const { data: { user }, error: authError } =
    await supabaseAdmin.auth.getUser(jwt);

  if (authError || !user) {
    console.warn('[stripe-connect-callback] Auth failed:', authError?.message);
    return respond(401, { error: 'Unauthorized' });
  }

  // ── Fetch the user's connected account ID ────────────────────────────────
  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('stripe_account_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[stripe-connect-callback] Profile fetch error:', profileError.message);
      return respond(500, { error: 'Failed to read user profile' });
    }

    const stripeAccountId: string | null = profile?.stripe_account_id ?? null;

    if (!stripeAccountId) {
      // No connected account yet — onboarding hasn't started.
      return respond(200, { complete: false, account: null });
    }

    // ── Check onboarding status with Stripe ──────────────────────────────
    const account = await stripe.accounts.retrieve(stripeAccountId);
    const complete = account.details_submitted === true;
    const accountSummary: StripeAccountSummary = {
      id: account.id,
      email: account.email ?? null,
      country: account.country ?? null,
      defaultCurrency: account.default_currency ?? null,
      businessType: account.business_type ?? null,
      chargesEnabled: account.charges_enabled === true,
      payoutsEnabled: account.payouts_enabled === true,
    };

    console.log(
      `[stripe-connect-callback] Account ${stripeAccountId} for user ${user.id}: ` +
      `details_submitted=${account.details_submitted}`
    );

    if (complete) {
      // Persist completed status to user_profiles.
      await supabaseAdmin
        .from('user_profiles')
        .update({ stripe_onboarding_complete: true })
        .eq('id', user.id);

      // Sync stripe_account_id (and completed flag) to any campaigns owned
      // by this user that don't have an account linked yet.
      await supabaseAdmin
        .from('campaigns')
        .update({
          stripe_account_id:          stripeAccountId,
          stripe_onboarding_complete: true,
        })
        .eq('created_by', user.id);
    }

    return respond(200, { complete, account: accountSummary });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[stripe-connect-callback] Error:', msg);
    return respond(500, { error: `Error checking connect status: ${msg}` });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
  };
}

function respond(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}
