# GraveX InkLab

A local-first tattoo stencil workspace from GraveX Studios. The static app converts user-selected images into clean line stencils, bold black stencils, grey-wash references, and fine-detail outputs in the browser. Uploaded artwork is processed locally and is not sent to the backend.

## Live app

https://travel-gravel-7.github.io/grave-rave/

## Current features

- Local image import and canvas-based stencil conversion
- Clean line, bold black, grey-wash, and fine-detail modes
- Threshold, detail strength, and invert controls
- PNG export, print, and mirrored transfer output
- Optional Supabase email/password accounts
- Private cloud saving of project names, notes, and stencil settings
- Free tier remains usable without creating an account

**Privacy boundary:** saved projects contain settings and notes only. The uploaded artwork itself is not uploaded or stored by InkLab.

## Backend

Supabase project: `vhditxhtzcvbeilthskw` (US East).

Namespaced tables:
- `inklab_profiles`
- `inklab_projects`
- `inklab_entitlements`
- `inklab_usage`

All tables have Row Level Security enabled. Profile and free-tier entitlement records are created by a private-schema auth trigger. Project rows are restricted to their owner. Entitlements can be read by their owner but only trusted backend code may update them. Usage writes are reserved for backend code.

The applied database migrations are recorded under `supabase/migrations/`: `20261031010204_inklab_backend_foundation.sql`, `20261031010205_inklab_stripe_event_idempotency.sql`, and `20261031010206_inklab_stripe_event_service_policy.sql`.

## Planned subscription model

- Free: local stencil tools remain useful with no card required.
- Premium: planned at $3.99/month, with additional professional controls and workflow features.
- Stripe Checkout, Customer Portal, signed webhook processing, subscription lifecycle handling, and server-side premium enforcement are not yet active.
- No live billing has been enabled.

## Security notes

- The browser uses only the Supabase publishable key.
- Never commit Supabase service-role keys, Stripe secret/restricted keys, or webhook signing secrets.
- Never trust a client-side plan label to grant premium access. Premium access must be verified by server-side subscription state.
- The Supabase project is shared with Pokediction; InkLab database objects are namespaced and the existing Pokediction tables/functions are left untouched.

## Deployment

GitHub Pages publishes the static frontend from the repository's main branch. Supabase handles account authentication and project metadata. Stripe backend functions and secrets must be configured before paid subscriptions can be enabled.

## Billing deployment checklist

The following Edge Functions are deployed under the InkLab-only names:
- `inklab-create-checkout` — authenticated Stripe subscription Checkout.
- `inklab-customer-portal` — authenticated Stripe Customer Portal session.
- `inklab-stripe-webhook` — public endpoint with Stripe signature verification.

Before enabling checkout, configure these Edge Function secrets in Supabase:
- `STRIPE_SECRET_KEY` — use a restricted Stripe key with only the permissions required for customers, Checkout Sessions, subscriptions, and billing portal sessions; start with test mode.
- `STRIPE_PRICE_ID` — the Stripe Price ID for the $3.99 USD monthly Premium subscription.
- `STRIPE_WEBHOOK_SECRET` — signing secret for the InkLab webhook endpoint.
- `APP_URL` — `https://travel-gravel-7.github.io/grave-rave` (no trailing slash).

Supabase supplies its project URL and server API keys to Edge Functions. Never place a service-role key, Stripe key, or webhook secret in GitHub or browser code.

Configure the Stripe webhook destination as:
`https://vhditxhtzcvbeilthskw.supabase.co/functions/v1/inklab-stripe-webhook`

Subscribe only to the lifecycle events currently handled by this first implementation:
`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`.

**Not launch-ready yet:** no Stripe Product/Price has been created, no Edge Function secrets have been configured, and no checkout or webhook test has been completed. Before production billing, extend webhook handling for refunds, disputes, and early fraud warnings; verify tax registrations/settings; test renewal, cancellation, failed payment, and refund flows; then obtain explicit approval before switching to live billing.


## Plans

- **Free:** unlimited single-image stencil conversion, local PNG export/printing, and up to 3 saved cloud project-setting records. Source artwork is processed in the browser and is not uploaded.
- **InkLab Premium — $3.99/month:** unlimited saved projects and Batch Forge, which processes up to 25 selected images locally and packages the resulting PNG stencils into one ZIP. Batch source images remain on the user's device.
- Subscription access is synchronized by the dedicated `inklab-stripe-webhook` Edge Function. The three InkLab Edge Functions are separate from Pokediction billing functions.

## Live billing launch checklist

Before accepting subscribers, configure these Supabase Edge Function secrets in the project dashboard: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, and `APP_URL`. The live Stripe product/price and webhook endpoint are provisioned, but do not announce billing until secrets are installed and a real end-to-end checkout, entitlement, cancellation, renewal, and failed-payment test has passed.
