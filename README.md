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

The applied database migration is recorded at `supabase/migrations/20261031010204_inklab_backend_foundation.sql`.

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
