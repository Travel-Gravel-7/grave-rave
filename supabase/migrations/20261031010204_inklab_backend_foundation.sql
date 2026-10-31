-- GraveX InkLab backend foundation
-- Applied to Supabase project vhditxhtzcvbeilthskw on 2026-10-30.
-- This migration is namespaced and does not alter Pokediction objects.

create schema if not exists inklab_private;
revoke all on schema inklab_private from public, anon, authenticated;

create table if not exists public.inklab_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inklab_profiles_display_name_len check (display_name is null or char_length(display_name) between 1 and 40)
);

create table if not exists public.inklab_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled project',
  notes text not null default '',
  output_style text not null default 'edges',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inklab_projects_name_len check (char_length(name) between 1 and 80),
  constraint inklab_projects_notes_len check (char_length(notes) <= 5000),
  constraint inklab_projects_style check (output_style in ('edges','threshold','gray','detail'))
);
create index if not exists inklab_projects_user_updated_idx on public.inklab_projects (user_id, updated_at desc);

create table if not exists public.inklab_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'inactive',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint inklab_entitlements_plan check (plan in ('free','premium')),
  constraint inklab_entitlements_status check (status in ('inactive','active','trialing','past_due','canceled','unpaid','incomplete'))
);

create table if not exists public.inklab_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  conversions integer not null default 0,
  saved_projects integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start),
  constraint inklab_usage_nonnegative check (conversions >= 0 and saved_projects >= 0)
);

alter table public.inklab_profiles enable row level security;
alter table public.inklab_projects enable row level security;
alter table public.inklab_entitlements enable row level security;
alter table public.inklab_usage enable row level security;

create policy "inklab_profiles_select_own" on public.inklab_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "inklab_profiles_insert_own" on public.inklab_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "inklab_profiles_update_own" on public.inklab_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "inklab_projects_select_own" on public.inklab_projects for select to authenticated using ((select auth.uid()) = user_id);
create policy "inklab_projects_insert_own" on public.inklab_projects for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "inklab_projects_update_own" on public.inklab_projects for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "inklab_projects_delete_own" on public.inklab_projects for delete to authenticated using ((select auth.uid()) = user_id);
create policy "inklab_entitlements_select_own" on public.inklab_entitlements for select to authenticated using ((select auth.uid()) = user_id);
create policy "inklab_usage_select_own" on public.inklab_usage for select to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update on public.inklab_profiles to authenticated;
grant select, insert, update, delete on public.inklab_projects to authenticated;
grant select on public.inklab_entitlements, public.inklab_usage to authenticated;
revoke all on public.inklab_entitlements from anon, authenticated;
grant select on public.inklab_entitlements to authenticated;
revoke insert, update, delete on public.inklab_usage, public.inklab_entitlements from anon, authenticated;
revoke all on public.inklab_profiles, public.inklab_projects, public.inklab_usage from anon;

create or replace function inklab_private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.inklab_profiles (user_id, display_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', ''), 40), ''))
  on conflict (user_id) do nothing;
  insert into public.inklab_entitlements (user_id, plan, status)
  values (new.id, 'free', 'inactive')
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function inklab_private.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_inklab on auth.users;
create trigger on_auth_user_created_inklab after insert on auth.users
for each row execute function inklab_private.handle_new_user();
