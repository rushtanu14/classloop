-- ClassLoop hosted backend MVP.
-- Run this in Supabase SQL editor, then keep Row Level Security enabled.

create table if not exists public.classloop_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'teacher' check (role in ('teacher', 'student', 'individual')),
  plan_tier text not null default 'free' check (plan_tier in ('free', 'pro')),
  subscription_status text not null default 'not_configured',
  stripe_customer_id text,
  subscription_id text,
  current_period_end timestamptz,
  no_training_on_student_data boolean not null default true,
  email_delivery_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.classloop_workspace_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint classloop_workspace_state_no_local_identity_check
    check (not (state ? 'accounts') and not (state ? 'billingProfile'))
);

create table if not exists public.classloop_pilot_feedback (
  id bigint generated always as identity primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  note text not null default '',
  role text not null default 'unknown',
  source text not null default 'pilot_feedback',
  transcript text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.classloop_profiles add column if not exists subscription_id text;
alter table public.classloop_profiles add column if not exists current_period_end timestamptz;
alter table public.classloop_profiles add column if not exists email_delivery_enabled boolean not null default false;
alter table public.classloop_profiles drop constraint if exists classloop_profiles_role_check;
alter table public.classloop_profiles
  add constraint classloop_profiles_role_check check (role in ('teacher', 'student', 'individual'));
update public.classloop_workspace_state
set state = state - 'accounts' - 'billingProfile'
where state ? 'accounts' or state ? 'billingProfile';
alter table public.classloop_workspace_state
  drop constraint if exists classloop_workspace_state_no_local_identity_check;
alter table public.classloop_workspace_state
  add constraint classloop_workspace_state_no_local_identity_check
  check (not (state ? 'accounts') and not (state ? 'billingProfile'));
alter table public.classloop_pilot_feedback alter column owner_id drop not null;
alter table public.classloop_pilot_feedback add column if not exists role text not null default 'unknown';
alter table public.classloop_pilot_feedback add column if not exists source text not null default 'pilot_feedback';
alter table public.classloop_pilot_feedback add column if not exists transcript text not null default '';
alter table public.classloop_pilot_feedback add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists classloop_profiles_stripe_customer_id_idx
  on public.classloop_profiles(stripe_customer_id);

create table if not exists public.classloop_classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.classloop_class_memberships (
  class_id uuid not null references public.classloop_classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('teacher', 'student')),
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

create table if not exists public.classloop_publications (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classloop_classes(id) on delete cascade,
  session_id text not null,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  content jsonb not null,
  published_at timestamptz not null default now(),
  unique (class_id, session_id, version)
);

create table if not exists public.classloop_submissions (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.classloop_publications(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'todo' check (status in ('todo', 'working', 'submitted', 'reviewed')),
  note text not null default '',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (publication_id, student_id)
);

create table if not exists public.classloop_publication_versions (
  publication_id uuid not null references public.classloop_publications(id) on delete cascade,
  version integer not null check (version > 0),
  content jsonb not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (publication_id, version)
);

create index if not exists classloop_classes_teacher_id_idx on public.classloop_classes(teacher_id);
create index if not exists classloop_class_memberships_user_id_idx on public.classloop_class_memberships(user_id);
create index if not exists classloop_publications_class_id_idx on public.classloop_publications(class_id);
create index if not exists classloop_submissions_student_id_idx on public.classloop_submissions(student_id);

create or replace function public.classloop_is_class_teacher(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classloop_classes class
    where class.id = target_class_id
      and class.teacher_id = auth.uid()
  );
$$;

create or replace function public.classloop_is_class_member(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classloop_class_memberships membership
    where membership.class_id = target_class_id
      and membership.user_id = auth.uid()
  );
$$;

revoke all on function public.classloop_is_class_teacher(uuid) from public;
revoke all on function public.classloop_is_class_member(uuid) from public;
grant execute on function public.classloop_is_class_teacher(uuid) to authenticated;
grant execute on function public.classloop_is_class_member(uuid) to authenticated;

alter table public.classloop_profiles enable row level security;
alter table public.classloop_workspace_state enable row level security;
alter table public.classloop_pilot_feedback enable row level security;
alter table public.classloop_classes enable row level security;
alter table public.classloop_class_memberships enable row level security;
alter table public.classloop_publications enable row level security;
alter table public.classloop_submissions enable row level security;
alter table public.classloop_publication_versions enable row level security;

-- Supabase grants table-level writes to authenticated users by default. Keep
-- billing, role, delivery, and account identity columns service-role only while
-- preserving the one privacy preference users are allowed to change directly.
revoke insert on table public.classloop_profiles from anon, authenticated;
revoke insert (
  id,
  email,
  role,
  plan_tier,
  subscription_status,
  stripe_customer_id,
  subscription_id,
  current_period_end,
  no_training_on_student_data,
  email_delivery_enabled,
  created_at,
  updated_at
) on public.classloop_profiles from anon, authenticated;
revoke update on table public.classloop_profiles from anon, authenticated;
revoke update (
  id,
  email,
  role,
  plan_tier,
  subscription_status,
  stripe_customer_id,
  subscription_id,
  current_period_end,
  email_delivery_enabled,
  created_at,
  updated_at,
  no_training_on_student_data
) on public.classloop_profiles from anon, authenticated;
grant update (no_training_on_student_data)
  on public.classloop_profiles to authenticated;

-- Cloud workspace writes go through /api/cloud-state, where the authenticated
-- user and payload schema are validated before the service-role write.
revoke insert, update on table public.classloop_workspace_state from anon, authenticated;
revoke insert (owner_id, state, updated_at)
  on public.classloop_workspace_state from anon, authenticated;
revoke update (owner_id, state, updated_at)
  on public.classloop_workspace_state from anon, authenticated;

-- Submission identity stays immutable. Both students and teachers may change
-- workflow fields, while the row policies below decide which status/review
-- transitions each authenticated user is allowed to make.
revoke update on table public.classloop_submissions from anon, authenticated;
revoke update (
  id,
  publication_id,
  student_id,
  status,
  note,
  submitted_at,
  reviewed_at,
  updated_at
) on public.classloop_submissions from anon, authenticated;
grant update (status, note, submitted_at, reviewed_at)
  on public.classloop_submissions to authenticated;

drop policy if exists "profiles_select_own" on public.classloop_profiles;
create policy "profiles_select_own"
  on public.classloop_profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.classloop_profiles;

drop policy if exists "profiles_update_own" on public.classloop_profiles;
create policy "profiles_update_own"
  on public.classloop_profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "workspace_state_select_own" on public.classloop_workspace_state;
create policy "workspace_state_select_own"
  on public.classloop_workspace_state for select
  using (auth.uid() = owner_id);

drop policy if exists "workspace_state_insert_own" on public.classloop_workspace_state;

drop policy if exists "workspace_state_update_own" on public.classloop_workspace_state;

drop policy if exists "feedback_insert_own" on public.classloop_pilot_feedback;
create policy "feedback_insert_own"
  on public.classloop_pilot_feedback for insert
  with check (auth.uid() = owner_id);

drop policy if exists "feedback_select_own" on public.classloop_pilot_feedback;
create policy "feedback_select_own"
  on public.classloop_pilot_feedback for select
  using (auth.uid() = owner_id);

drop policy if exists "classes_teacher_all" on public.classloop_classes;
create policy "classes_teacher_all"
  on public.classloop_classes for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

drop policy if exists "classes_member_select" on public.classloop_classes;
create policy "classes_member_select"
  on public.classloop_classes for select
  using (public.classloop_is_class_member(id));

drop policy if exists "memberships_teacher_manage" on public.classloop_class_memberships;
create policy "memberships_teacher_manage"
  on public.classloop_class_memberships for all
  using (public.classloop_is_class_teacher(class_id))
  with check (public.classloop_is_class_teacher(class_id));

drop policy if exists "memberships_select_own" on public.classloop_class_memberships;
create policy "memberships_select_own"
  on public.classloop_class_memberships for select
  using (user_id = auth.uid());

drop policy if exists "publications_teacher_manage" on public.classloop_publications;
create policy "publications_teacher_manage"
  on public.classloop_publications for all
  using (
    teacher_id = auth.uid()
    and public.classloop_is_class_teacher(class_id)
  )
  with check (
    teacher_id = auth.uid()
    and public.classloop_is_class_teacher(class_id)
  );

drop policy if exists "publications_member_select" on public.classloop_publications;
create policy "publications_member_select"
  on public.classloop_publications for select
  using (public.classloop_is_class_member(class_id));

drop policy if exists "submissions_student_manage" on public.classloop_submissions;
drop policy if exists "submissions_student_select" on public.classloop_submissions;
create policy "submissions_student_select"
  on public.classloop_submissions for select
  using (
    student_id = auth.uid()
    and exists (
      select 1
      from public.classloop_publications publication
      join public.classloop_class_memberships membership
        on membership.class_id = publication.class_id
      where publication.id = publication_id
        and membership.user_id = auth.uid()
        and membership.role = 'student'
    )
  );

drop policy if exists "submissions_student_insert" on public.classloop_submissions;
create policy "submissions_student_insert"
  on public.classloop_submissions for insert
  with check (
    student_id = auth.uid()
    and status in ('todo', 'working', 'submitted')
    and reviewed_at is null
    and exists (
      select 1
      from public.classloop_publications publication
      join public.classloop_class_memberships membership
        on membership.class_id = publication.class_id
      where publication.id = publication_id
        and membership.user_id = auth.uid()
        and membership.role = 'student'
    )
  );

drop policy if exists "submissions_student_update" on public.classloop_submissions;
create policy "submissions_student_update"
  on public.classloop_submissions for update
  using (
    student_id = auth.uid()
    and status in ('todo', 'working', 'submitted')
    and reviewed_at is null
    and exists (
      select 1
      from public.classloop_publications publication
      join public.classloop_class_memberships membership
        on membership.class_id = publication.class_id
      where publication.id = publication_id
        and membership.user_id = auth.uid()
        and membership.role = 'student'
    )
  )
  with check (
    student_id = auth.uid()
    and status in ('todo', 'working', 'submitted')
    and reviewed_at is null
    and exists (
      select 1
      from public.classloop_publications publication
      join public.classloop_class_memberships membership
        on membership.class_id = publication.class_id
      where publication.id = publication_id
        and membership.user_id = auth.uid()
        and membership.role = 'student'
    )
  );

drop policy if exists "submissions_teacher_select" on public.classloop_submissions;
create policy "submissions_teacher_select"
  on public.classloop_submissions for select
  using (
    exists (
      select 1
      from public.classloop_publications publication
      where publication.id = publication_id
        and publication.teacher_id = auth.uid()
        and public.classloop_is_class_teacher(publication.class_id)
    )
  );

drop policy if exists "submissions_teacher_update" on public.classloop_submissions;
create policy "submissions_teacher_update"
  on public.classloop_submissions for update
  using (
    exists (
      select 1
      from public.classloop_publications publication
      where publication.id = publication_id
        and publication.teacher_id = auth.uid()
        and public.classloop_is_class_teacher(publication.class_id)
    )
  )
  with check (
    exists (
      select 1
      from public.classloop_publications publication
      join public.classloop_class_memberships membership
        on membership.class_id = publication.class_id
      where publication.id = publication_id
        and publication.teacher_id = auth.uid()
        and public.classloop_is_class_teacher(publication.class_id)
        and membership.user_id = student_id
        and membership.role = 'student'
    )
  );

drop policy if exists "publication_versions_teacher_manage" on public.classloop_publication_versions;
create policy "publication_versions_teacher_manage"
  on public.classloop_publication_versions for all
  using (
    exists (
      select 1
      from public.classloop_publications publication
      where publication.id = publication_id
        and publication.teacher_id = auth.uid()
        and public.classloop_is_class_teacher(publication.class_id)
    )
  )
  with check (
    exists (
      select 1
      from public.classloop_publications publication
      where publication.id = publication_id
        and publication.teacher_id = auth.uid()
        and public.classloop_is_class_teacher(publication.class_id)
    )
  );
