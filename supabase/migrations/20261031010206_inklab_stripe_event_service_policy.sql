-- Restrict the private webhook idempotency ledger to trusted server role.
drop policy if exists "inklab_stripe_events_service_role_only" on public.inklab_stripe_events;
create policy "inklab_stripe_events_service_role_only"
on public.inklab_stripe_events
for all to service_role
using (true) with check (true);
