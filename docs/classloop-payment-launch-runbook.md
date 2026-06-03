# ClassLoop Payment Launch Runbook

Last updated: 2026-06-02

This runbook is for turning the existing ClassLoop Pro billing scaffold into a real, chargeable production path. The app can show pricing, create Stripe Checkout sessions, listen for signed Stripe webhooks, update Supabase-owned entitlements, and open the Stripe customer portal. Charging real users still stays on hold until the live setup and proof steps below are complete.

## Current Status

- Free and Pro plan surfaces exist in the app.
- Pro is targeted at `$3.99/month` for unlimited sessions, live capture, delivery proof, analytics, and exports.
- Pro unlock is server-owned. The UI should stay Free until `/api/profile` returns a Stripe-verified active Pro profile.
- Hosted demo accounts should not be upgraded.
- A temporary owner-only manual Pro grant exists for development and founder testing. It is not a scalable payment plan and should not be advertised.

## Code Contract

These are the payment paths the external setup must support:

- `api/billing/prepare-account.js` creates or prepares a Supabase cloud account before checkout, so the upgrade flow can feel like one account setup instead of a second visible signup.
- The app opens the configured Stripe Payment Link at `VITE_STRIPE_PAYMENT_LINK_URL` and appends the signed-in email plus Supabase user id as `prefilled_email` and `client_reference_id`.
- `api/billing/checkout.js` remains as the server-owned Checkout Session fallback using `STRIPE_PRO_PRICE_ID`, the authenticated Supabase user, a Stripe customer, `client_reference_id`, and `supabaseUserId` metadata.
- Hosted Checkout or Payment Link success should return to `#/billing?billing=success` when configured in Stripe.
- `api/billing/webhook.js` verifies the raw Stripe body with `STRIPE_WEBHOOK_SECRET` and updates `classloop_profiles` for:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
- `api/billing/portal.js` creates a Stripe customer portal session after a real Stripe customer exists.
- `api/profile.js` returns the trusted billing profile used by the app to unlock or keep Pro gated.
- `src/cloud.ts` and `src/App.tsx` keep client-side billing state as display state only; client/local tampering should not unlock paid-only features.

## External Setup

### 1. Supabase

1. Create or select the production Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Keep Row Level Security enabled.
4. In Supabase Dashboard -> Authentication -> URL Configuration, set:
   - Site URL: `https://classloop-followup.vercel.app`
   - Redirect allow list:
     - `https://classloop-followup.vercel.app/#/billing?cloud=confirmed`
     - `http://127.0.0.1:5177/#/billing?cloud=confirmed`
     - `http://localhost:5177/#/billing?cloud=confirmed`
5. Paste `supabase/email-templates/confirm-signup.html` into Authentication -> Email Templates -> Confirm signup.
6. Copy the project URL, anon key, and service role key. The service role key is server-only.

### 2. Stripe

1. Start in Stripe test mode.
2. Create a product named `ClassLoop Pro`.
3. Create a recurring monthly price for `$3.99/month`.
4. Copy the recurring Price ID into both:
   - `STRIPE_PRO_PRICE_ID`
   - `VITE_STRIPE_PRO_PRICE_ID`
5. Create or confirm the Stripe Payment Link and copy it into `VITE_STRIPE_PAYMENT_LINK_URL`.
6. Optional fallback: keep a Stripe pricing table id in `VITE_STRIPE_PRICING_TABLE_ID`.
7. Copy the Stripe publishable key into `VITE_STRIPE_PUBLISHABLE_KEY`.
8. Copy the Stripe secret key into `STRIPE_SECRET_KEY`.
9. Configure the Stripe customer portal so users can cancel or manage the subscription.
10. Add a webhook endpoint for the deployed domain:
   - `https://classloop-followup.vercel.app/api/billing/webhook`
11. Subscribe the endpoint to:
    - `checkout.session.completed`
    - `customer.subscription.updated`
    - `customer.subscription.deleted`
    - `invoice.paid`
    - `invoice.payment_failed`
12. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.

Do not mix test and live values. A test secret key, test Price ID, and test webhook secret must stay together. Live launch needs a live secret key, live Price ID, live webhook secret, and redacted `cs_live_...` Checkout Session proof.

### 3. Vercel

Add these values in the Vercel project settings for Production and any Preview environment used for billing tests:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

VITE_CLASSLOOP_PUBLIC_URL=https://classloop-followup.vercel.app
CLASSLOOP_PUBLIC_URL=https://classloop-followup.vercel.app

VITE_STRIPE_PRO_PRICE_ID=
VITE_STRIPE_PUBLISHABLE_KEY=
VITE_STRIPE_PRICING_TABLE_ID=
VITE_STRIPE_PAYMENT_LINK_URL=https://buy.stripe.com/7sY28qeT16Mh5wi0ZbeME00
STRIPE_SECRET_KEY=
STRIPE_PRO_PRICE_ID=
STRIPE_WEBHOOK_SECRET=
```

Redeploy after every environment variable change. Vercel env changes do not affect already-created deployments.

## Verification

Run the focused local checks before touching live billing:

```bash
npm run build
npm run test:security
npm run test:entitlements
npm run test:stripe
```

For the hosted surface, run one of these depending on the target:

```bash
npm run test:web:local
npm run test:web
```

Manual Stripe test-mode walkthrough:

1. Open the deployed app with non-demo teacher credentials.
2. Go to Plan options.
3. Click Upgrade to Pro.
4. Confirm the cloud account if Supabase email confirmation is enabled.
5. Complete the Stripe Payment Link checkout with a Stripe test card.
6. Return to `#/billing?billing=success`.
7. Refresh plan.
8. Verify the app shows `PRO / active`.
9. Verify live capture and other Pro-only surfaces unlock.
10. Open Manage billing and confirm Stripe portal opens.
11. Cancel or mark the subscription past due in Stripe test mode.
12. Confirm the webhook updates `/api/profile` and the app removes or changes Pro access appropriately.
13. Confirm demo teacher/student accounts cannot enter a paid upgrade.

Evidence to save before live promotion:

- Redacted `cs_live_...` Checkout Session proof.
- Redacted Stripe webhook delivery showing a 2xx response.
- Redacted Supabase `classloop_profiles` row showing `plan_tier = pro` and `subscription_status = active`.
- Cancellation or failed-payment proof showing the app does not keep active Pro incorrectly.
- Browser screenshot of the billing page after webhook-confirmed Pro.

## Manual Or Founder Grants

The owner-only manual Pro grant is only for development and founder usage. It should not be the normal way to sell Pro.

Use manual grants only when all of these are true:

- The user is Rushil or another explicitly approved internal tester.
- The grant is temporary.
- The account is not a demo account.
- The account does not need Stripe customer portal access.
- The grant is documented as internal testing, not paid subscription proof.

For real users, use Stripe Checkout and signed webhook entitlements.

## Launch Gates

Paid Pro promotion remains on hold until all of these are true:

- Live Stripe Checkout creates a real `cs_live_...` session.
- Stripe webhook updates Supabase profile entitlements server-side.
- Billing portal cancellation or downgrade is proven.
- Failed-payment or past-due behavior is proven.
- Demo accounts stay blocked from upgrade.
- Clean-host installer evidence exists for each public desktop download.
- Public signup and real student-data handling have legal/privacy review or a controlled pilot agreement.

## Official References

- Stripe Checkout Session API: https://docs.stripe.com/api/checkout/sessions/create
- Stripe Pricing Table docs: https://docs.stripe.com/payments/checkout/pricing-table
- Stripe webhook verification: https://docs.stripe.com/webhooks
- Stripe Customer Portal sessions: https://docs.stripe.com/api/customer_portal/sessions
- Supabase Auth redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls
- Vercel environment variables: https://vercel.com/docs/projects/environment-variables
