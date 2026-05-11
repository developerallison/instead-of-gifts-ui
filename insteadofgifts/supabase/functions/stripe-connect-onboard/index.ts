/**
 * Supabase Edge Function: stripe-connect-onboard
 *
 * Creates (or reuses) a Stripe Express connected account for the authenticated
 * organiser and returns an AccountLink URL to begin / resume onboarding.
 *
 * Runtime: Deno (Supabase Edge Runtime)
 * Auth: verify_jwt = true (configured in supabase/config.toml)
 */

import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Initialise clients once (module-level — reused across warm invocations)
// ---------------------------------------------------------------------------

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const STRIPE_CONNECT_COUNTRY = Deno.env.get('STRIPE_CONNECT_COUNTRY') ?? 'US';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  httpClient: Stripe.createFetchHttpClient(),
  apiVersion: '2025-03-31.basil',
});

/** Service-role client — bypasses RLS to read/write user_profiles. */
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

  if (!STRIPE_SECRET_KEY) {
    return respond(500, { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in Supabase secrets.' });
  }

  let body: { forceNewAccount?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is allowed.
  }

  // ── Authenticate the caller ──────────────────────────────────────────────
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) {
    return respond(401, { error: 'Missing Authorization header' });
  }

  const { data: { user }, error: authError } =
    await supabaseAdmin.auth.getUser(jwt);

  if (authError || !user) {
    console.warn('[stripe-connect-onboard] Auth failed:', authError?.message);
    return respond(401, { error: 'Unauthorized' });
  }

  // ── Fetch or create the Stripe connected account ─────────────────────────
  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('stripe_account_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[stripe-connect-onboard] Profile fetch error:', profileError.message);
      return respond(500, { error: 'Failed to read user profile' });
    }

    let stripeAccountId: string = profile?.stripe_account_id ?? '';
    const forceNewAccount = body.forceNewAccount === true;

    if (!stripeAccountId || forceNewAccount) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: STRIPE_CONNECT_COUNTRY,
        email: user.email ?? undefined,
        business_type: 'individual',
        business_profile: {
          product_description: 'Personal celebration contributions received through InsteadOfGifts.',
        },
        metadata: { supabase_user_id: user.id },
      });
      stripeAccountId = account.id;

      const { error: updateError } = await supabaseAdmin
        .from('user_profiles')
        .upsert(
          {
            id: user.id,
            stripe_account_id: stripeAccountId,
            stripe_onboarding_complete: false,
          },
          { onConflict: 'id' },
        );

      if (updateError) {
        console.error('[stripe-connect-onboard] Profile update error:', updateError.message);
        return respond(500, { error: 'Failed to save Stripe account' });
      }

      const { error: campaignSyncError } = await supabaseAdmin
        .from('campaigns')
        .update({
          stripe_account_id: stripeAccountId,
          stripe_onboarding_complete: false,
        })
        .eq('created_by', user.id);

      if (campaignSyncError) {
        console.error('[stripe-connect-onboard] Campaign sync error:', campaignSyncError.message);
        return respond(500, { error: 'Failed to sync Stripe account to celebrations' });
      }
    }

    // ── Generate an AccountLink for onboarding ────────────────────────────
    const frontendUrl = resolveFrontendUrl(req);

    const accountLink = await stripe.accountLinks.create({
      account:     stripeAccountId,
      type:        'account_onboarding',
      refresh_url: `${frontendUrl}/dashboard?connect=refresh`,
      return_url:  `${frontendUrl}/dashboard?connect=success`,
    });

    console.log(
      `[stripe-connect-onboard] AccountLink created for user ${user.id}, ` +
      `account ${stripeAccountId}`
    );

    return respond(200, { url: accountLink.url });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[stripe-connect-onboard] Stripe error:', msg);
    return respond(500, { error: `Stripe error: ${msg}` });
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

function resolveFrontendUrl(req: Request): string {
  const origin = req.headers.get('origin')?.trim();
  if (origin && /^https?:\/\//i.test(origin)) {
    return origin.replace(/\/+$/, '');
  }

  const referer = req.headers.get('referer')?.trim();
  if (referer) {
    try {
      return new URL(referer).origin.replace(/\/+$/, '');
    } catch {
      // Ignore invalid referer and fall back to configuration.
    }
  }

  return (Deno.env.get('FRONTEND_URL') ?? 'http://localhost:4200').replace(/\/+$/, '');
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
