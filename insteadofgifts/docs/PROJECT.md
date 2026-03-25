## Project Overview: Insteadofgifts

`Insteadofgifts` is a web app for creating and running "gift" (donation) campaigns.
It supports:

- Public contribution flow (anyone can contribute without an account).
- Authenticated organizer dashboard (create/edit/close/delete campaigns).
- A Pro subscription that unlocks additional campaign features.

## Major Pages / User Journeys

### 1) Public home and onboarding

- Landing page describes how the product works and the free vs Pro plan.
- Users typically start by creating a campaign (authenticated) or sharing an existing campaign link (public).

### 2) Organizer: create a campaign

1. Sign in via Supabase Auth (email/password or OAuth).
2. Navigate to `/campaigns/new`.
3. Fill in campaign details (title, description, optional goal/amount, optional deadline).
4. If the user is Pro, they can optionally add:
   - Cover photo
   - Custom thank-you message
   - Additional dashboard perks (see Pro features in the UI)
5. Submit -> the campaign is created in the database; cover image uploads to Supabase Storage (public CDN URL stored back on the campaign).

### 3) Public: contribute to a campaign

1. Navigate to `/contribute/:slug`.
2. Pick an amount and write an optional message (anonymous option available).
3. The frontend calls a backend Edge Function to create a Stripe Checkout Session:
   - Stripe handles the hosted payment page.
4. On payment completion, the app persists the contribution to the database and updates the campaign page.

### 4) Organizer: dashboard

- Authenticated users can view and manage their campaigns at `/dashboard`.
- The dashboard shows:
  - Per-campaign fundraising totals.
  - Recent activity (latest succeeded contributions).

### 5) Pro upgrade

1. Free users who need Pro features visit `/pro/upgrade`.
2. The frontend calls an Edge Function to create a Stripe subscription checkout session.
3. After checkout success, the app confirms the subscription and updates the user profile.
4. Route guards and UI update immediately based on the `user_profiles.is_pro` flag.

