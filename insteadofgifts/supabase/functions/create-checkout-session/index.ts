/**
 * Supabase Edge Function: create-checkout-session
 *
 * Creates a Stripe Checkout Session for a campaign contribution and returns
 * the hosted Checkout URL. All contribution details are embedded in the
 * session metadata so the stripe-webhook function can persist the contribution
 * row on payment completion; no pending row is created here.
 *
 * Runtime: Deno (Supabase Edge Runtime)
 * Called by: Angular frontend StripeService.redirectToCheckout()
 *
 * Auth: verify_jwt = false (configured in supabase/config.toml). This is a
 * public endpoint; security is enforced by validating the campaign exists,
 * is active, and has a payout-ready Stripe account.
 */

import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
if (!stripeSecretKey) {
  throw new Error(
    'Missing STRIPE_SECRET_KEY environment variable. Set it before running this function.',
  );
}

const stripe = new Stripe(stripeSecretKey, {
  httpClient: Stripe.createFetchHttpClient(),
  apiVersion: '2025-03-31.basil',
});

const CAMPAIGN_CONTRIBUTION_GRACE_PERIOD_DAYS = 15;

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_ANON_KEY') ?? '',
);

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  let body: {
    campaignId: string;
    amountPence: number;
    contributorName: string;
    message: string;
    isAnonymous: boolean;
    successUrl: string;
    cancelUrl: string;
  };

  try {
    body = await req.json();
  } catch {
    return respond(400, { error: 'Invalid JSON body' });
  }

  const {
    campaignId,
    amountPence,
    contributorName,
    message,
    isAnonymous,
    successUrl,
    cancelUrl,
  } = body;

  if (!campaignId || typeof campaignId !== 'string') {
    return respond(400, { error: 'campaignId is required' });
  }

  if (typeof amountPence !== 'number' || amountPence < 100) {
    return respond(400, { error: 'amountPence must be at least 100 ($1.00)' });
  }

  if (!successUrl || !cancelUrl) {
    return respond(400, { error: 'successUrl and cancelUrl are required' });
  }

  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, title, is_active, deadline, stripe_account_id, stripe_onboarding_complete')
    .eq('id', campaignId)
    .single();

  if (campaignError || !campaign) {
    console.warn('[create-checkout-session] Campaign not found:', campaignId);
    return respond(404, { error: 'Campaign not found' });
  }

  if (!campaign.is_active || hasCampaignContributionWindowClosed(campaign.deadline)) {
    return respond(400, { error: 'Campaign is no longer accepting contributions' });
  }

  if (!campaign.stripe_account_id || !campaign.stripe_onboarding_complete) {
    return respond(400, {
      error:
        'Donations are currently disabled for this celebration. The organiser must connect Stripe and add bank account details before receiving donations.',
    });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      adaptive_pricing: { enabled: false },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Contribution to ${campaign.title}`,
            },
            unit_amount: amountPence,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        campaign_id: campaignId,
        contributor_name: (contributorName ?? '').slice(0, 255),
        message: (message ?? '').slice(0, 500),
        is_anonymous: isAnonymous ? 'true' : 'false',
        amount_pence: String(amountPence),
      },
      payment_intent_data: {
        metadata: {
          campaign_id: campaignId,
          contributor_name: (contributorName ?? '').slice(0, 255),
          message: (message ?? '').slice(0, 500),
          is_anonymous: isAnonymous ? 'true' : 'false',
          amount_pence: String(amountPence),
        },
        transfer_data: { destination: campaign.stripe_account_id },
      },
    });

    console.log(
      `[create-checkout-session] Created session ${session.id} ` +
      `for campaign ${campaignId}, amount ${amountPence} cents, ` +
      `routed in full to connected account ${campaign.stripe_account_id}`,
    );

    return respond(200, { url: session.url! }, true);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[create-checkout-session] Stripe error:', msg);
    return respond(500, { error: `Failed to create checkout session: ${msg}` });
  }
});

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
  };
}

function respond(
  status: number,
  body: Record<string, unknown>,
  cors = false,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(cors ? corsHeaders() : {}),
    },
  });
}

function hasCampaignContributionWindowClosed(deadline: string | null): boolean {
  if (!deadline) {
    return false;
  }

  const closesAt = getCampaignContributionWindowCloseAt(deadline);
  if (!closesAt) {
    return false;
  }

  return Date.now() > closesAt.getTime();
}

function getCampaignContributionWindowCloseAt(deadline: string): Date | null {
  const gracePeriodMs = CAMPAIGN_CONTRIBUTION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  const dateOnlyMatch = deadline.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const deadlineEnd = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      23,
      59,
      59,
      999,
    );

    return new Date(deadlineEnd.getTime() + gracePeriodMs);
  }

  const parsedDeadline = new Date(deadline);
  if (Number.isNaN(parsedDeadline.getTime())) {
    return null;
  }

  return new Date(parsedDeadline.getTime() + gracePeriodMs);
}
