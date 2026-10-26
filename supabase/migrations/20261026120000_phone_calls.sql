-- Phone calls from qrypt.chat to US/Canadian phones (Telnyx). Service role only:
-- the API routes read and write these, never the browser.

-- Each user's WebRTC line: a Telnyx telephony credential on the qrypt.chat credential connection.
create table if not exists public.phone_lines (
	user_id uuid primary key references public.users(id) on delete cascade,
	credential_id text not null,
	sip_username text not null,
	created_at timestamptz not null default now()
);

create table if not exists public.phone_calls (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references public.users(id) on delete cascade,
	to_number text not null,
	status text not null default 'ringing' check (status in ('ringing', 'connecting', 'active', 'ended', 'failed')),
	limit_seconds integer not null,
	user_leg_id text,
	pstn_leg_id text,
	session_id text,
	answered_at timestamptz,
	ended_at timestamptz,
	billed_seconds integer not null default 0,
	hangup_cause text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists phone_calls_user_created on public.phone_calls (user_id, created_at desc);
create index if not exists phone_calls_session on public.phone_calls (session_id);

alter table public.phone_lines enable row level security;
alter table public.phone_calls enable row level security;
-- No policies: only the service role (which bypasses RLS) touches these tables.
