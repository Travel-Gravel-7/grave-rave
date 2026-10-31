-- Stripe webhook idempotency ledger; service-role access only.
create table if not exists public.inklab_stripe_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);
alter table public.inklab_stripe_events enable row level security;
revoke all on public.inklab_stripe_events from public, anon, authenticated;
