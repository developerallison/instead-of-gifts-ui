// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? '';
const CELEBRATION_ALERT_TO_EMAIL =
  Deno.env.get('CELEBRATION_ALERT_TO_EMAIL') ?? 'developer@insteadofgifts.com';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const CORS_HEADERS: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface CelebrationCreatedRequest {
  campaignId?: string;
  campaignTitle?: string;
  campaignSlug?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    return respond(500, { error: 'Email service is not configured.' });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return respond(401, { error: 'Missing Authorization header' });
  }

  const jwt = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user?.email) {
    return respond(401, { error: 'Invalid or expired token' });
  }

  let body: CelebrationCreatedRequest;
  try {
    body = await req.json();
  } catch {
    return respond(400, { error: 'Invalid JSON body' });
  }

  const campaignId = body.campaignId?.trim();
  const campaignTitle = body.campaignTitle?.trim();
  const campaignSlug = body.campaignSlug?.trim();

  if (!campaignId || !campaignTitle) {
    return respond(400, { error: 'campaignId and campaignTitle are required' });
  }

  const creatorName = getDisplayName(user.user_metadata, user.email);
  const celebrationUrl = campaignSlug
    ? `${Deno.env.get('FRONTEND_URL') ?? 'http://localhost:4200'}/campaign/${encodeURIComponent(campaignSlug)}`
    : null;

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [CELEBRATION_ALERT_TO_EMAIL],
      subject: `New celebration created by ${creatorName}`,
      text: buildTextBody({
        creatorName,
        creatorEmail: user.email,
        campaignId,
        campaignTitle,
        celebrationUrl,
      }),
      html: buildHtmlBody({
        creatorName,
        creatorEmail: user.email,
        campaignId,
        campaignTitle,
        celebrationUrl,
      }),
    }),
  });

  if (!resendResponse.ok) {
    const responseText = await resendResponse.text();
    console.error('[send-celebration-created-email] Resend error:', responseText);
    return respond(502, { error: 'Failed to send notification email.' });
  }

  return respond(200, { ok: true });
});

function getDisplayName(
  metadata: Record<string, unknown> | undefined,
  email: string,
): string {
  const candidate = metadata?.['full_name'] ?? metadata?.['name'] ?? metadata?.['first_name'];
  return typeof candidate === 'string' && candidate.trim().length
    ? candidate.trim()
    : email;
}

function buildTextBody(input: {
  creatorName: string;
  creatorEmail: string;
  campaignId: string;
  campaignTitle: string;
  celebrationUrl: string | null;
}): string {
  const lines = [
    'A new celebration has been created.',
    '',
    `Name: ${input.creatorName}`,
    `Email: ${input.creatorEmail}`,
    `Celebration: ${input.campaignTitle}`,
    `Campaign ID: ${input.campaignId}`,
  ];

  if (input.celebrationUrl) {
    lines.push(`Celebration URL: ${input.celebrationUrl}`);
  }

  return lines.join('\n');
}

function buildHtmlBody(input: {
  creatorName: string;
  creatorEmail: string;
  campaignId: string;
  campaignTitle: string;
  celebrationUrl: string | null;
}): string {
  const celebrationUrlMarkup = input.celebrationUrl
    ? `<p><strong>Celebration URL:</strong> <a href="${escapeHtml(input.celebrationUrl)}">${escapeHtml(input.celebrationUrl)}</a></p>`
    : '';

  return [
    '<h2>New celebration created</h2>',
    '<p>A signed-in user has created a new celebration.</p>',
    `<p><strong>Name:</strong> ${escapeHtml(input.creatorName)}</p>`,
    `<p><strong>Email:</strong> ${escapeHtml(input.creatorEmail)}</p>`,
    `<p><strong>Celebration:</strong> ${escapeHtml(input.campaignTitle)}</p>`,
    `<p><strong>Campaign ID:</strong> ${escapeHtml(input.campaignId)}</p>`,
    celebrationUrlMarkup,
  ].join('');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function respond(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}