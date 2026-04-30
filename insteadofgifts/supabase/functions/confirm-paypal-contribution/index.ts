import { createClient } from 'npm:@supabase/supabase-js@2';

const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID') ?? 'paypal_dummy_client_id';
const PAYPAL_CLIENT_SECRET = Deno.env.get('PAYPAL_CLIENT_SECRET') ?? 'paypal_dummy_secret';
const PAYPAL_BASE_URL_OVERRIDE = Deno.env.get('PAYPAL_BASE_URL')?.replace(/\/$/, '') ?? null;
const PAYPAL_ENVIRONMENT = Deno.env.get('PAYPAL_ENVIRONMENT')?.trim().toLowerCase() ?? null;
const PAYPAL_SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com';
const PAYPAL_LIVE_BASE_URL = 'https://api-m.paypal.com';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  if (usingPlaceholderCredentials()) {
    return respond(500, {
      error: 'PayPal is configured with placeholder credentials. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET first.',
    });
  }

  let body: { orderId: string };
  try {
    body = await req.json();
  } catch {
    return respond(400, { error: 'Invalid JSON body' });
  }

  const { orderId } = body;
  if (!orderId || typeof orderId !== 'string') {
    return respond(400, { error: 'orderId is required' });
  }

  try {
    const paypalAuth = await getPayPalAuth();
    const order = await captureOrder(orderId, paypalAuth);
    if (order.status !== 'COMPLETED') {
      return respond(400, { error: `PayPal order is not completed (status: ${order.status ?? 'unknown'})` });
    }

    const { data, error } = await supabase
      .from('contributions')
      .update({ status: 'succeeded' })
      .eq('payment_provider', 'paypal')
      .eq('payment_reference', orderId)
      .select('id, campaign_id')
      .maybeSingle();

    if (error) {
      return respond(500, { error: `Failed to update contribution: ${error.message}` });
    }

    if (!data) {
      return respond(404, { error: 'Pending PayPal contribution not found.' });
    }

    return respond(200, { confirmed: true, orderId }, true);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return respond(500, { error: message });
  }
});

async function captureOrder(
  orderId: string,
  paypalAuth: { accessToken: string; baseUrl: string },
): Promise<Record<string, unknown>> {
  const captureResponse = await fetch(`${paypalAuth.baseUrl}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${paypalAuth.accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const captureBody = await captureResponse.json();
  if (captureResponse.ok) {
    return captureBody as Record<string, unknown>;
  }

  const issue = getPayPalIssue(captureBody);
  if (issue === 'ORDER_ALREADY_CAPTURED') {
    const orderResponse = await fetch(`${paypalAuth.baseUrl}/v2/checkout/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${paypalAuth.accessToken}` },
    });
    const orderBody = await orderResponse.json();
    if (!orderResponse.ok) {
      throw new Error(formatPayPalError(orderBody, 'Failed to fetch captured PayPal order.'));
    }
    return orderBody as Record<string, unknown>;
  }

  throw new Error(formatPayPalError(captureBody, 'Failed to capture PayPal order.'));
}

async function getPayPalAuth(): Promise<{ accessToken: string; baseUrl: string }> {
  const auth = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`);
  let lastError: string | null = null;

  for (const baseUrl of getPayPalBaseUrlCandidates()) {
    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });

    const data = await response.json();
    if (response.ok && data.access_token) {
      return { accessToken: data.access_token as string, baseUrl };
    }

    lastError = `${baseUrl}: ${formatPayPalError(data, 'Failed to authenticate with PayPal.')}`;
  }

  throw new Error(lastError ?? 'Failed to authenticate with PayPal.');
}

function getPayPalBaseUrlCandidates(): string[] {
  if (PAYPAL_BASE_URL_OVERRIDE) {
    return [PAYPAL_BASE_URL_OVERRIDE];
  }

  if (PAYPAL_ENVIRONMENT === 'production' || PAYPAL_ENVIRONMENT === 'live') {
    return [PAYPAL_LIVE_BASE_URL, PAYPAL_SANDBOX_BASE_URL];
  }

  if (PAYPAL_ENVIRONMENT === 'sandbox') {
    return [PAYPAL_SANDBOX_BASE_URL, PAYPAL_LIVE_BASE_URL];
  }

  return [PAYPAL_SANDBOX_BASE_URL, PAYPAL_LIVE_BASE_URL];
}

function getPayPalIssue(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const details = (payload as { details?: Array<{ issue?: string }> }).details;
  return details?.[0]?.issue ?? null;
}

function usingPlaceholderCredentials(): boolean {
  return PAYPAL_CLIENT_ID === 'paypal_dummy_client_id'
    || PAYPAL_CLIENT_SECRET === 'paypal_dummy_secret';
}

function formatPayPalError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const errorPayload = payload as {
      message?: string;
      error_description?: string;
      details?: Array<{ issue?: string; description?: string }>;
    };
    const detail = errorPayload.details?.[0];
    return errorPayload.message
      || errorPayload.error_description
      || detail?.description
      || detail?.issue
      || fallback;
  }
  return fallback;
}

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
  cors = true,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(cors ? corsHeaders() : {}),
    },
  });
}
