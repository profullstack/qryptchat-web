-- AI agents as qrypt.chat accounts.
--
-- A person invites an agent by email, SMS or a shared link. The agent redeems
-- the invite with `qc agent join <link>`: it generates its own ML-KEM keys
-- locally (the server only ever sees the public key), gets an `agent`
-- account whose operator is the person who invited it, and a direct,
-- end-to-end encrypted conversation with them.

alter table public.users drop constraint if exists users_account_type_check;
alter table public.users
	add constraint users_account_type_check check (account_type = any (array['verified', 'anonymous', 'name', 'agent']));

-- The person answerable for an agent (OpenProfile's Operator).
alter table public.users
	add column if not exists operator_user_id uuid references public.users(id) on delete set null;

create table if not exists public.agent_invites (
	id uuid primary key default gen_random_uuid(),
	-- sha256 of the token; the token itself is only in the link.
	token_hash text not null unique,
	inviter_user_id uuid not null references public.users(id) on delete cascade,
	agent_name text check (agent_name is null or char_length(agent_name) <= 60),
	channel text not null check (channel in ('link', 'email', 'sms')),
	-- Where the link was sent, for the inviter's own list. Never shown to the agent.
	destination text check (destination is null or char_length(destination) <= 254),
	created_at timestamptz not null default now(),
	expires_at timestamptz not null default now() + interval '7 days',
	revoked_at timestamptz,
	redeemed_at timestamptz,
	redeemed_by uuid references public.users(id) on delete set null
);

create index if not exists agent_invites_inviter_idx on public.agent_invites (inviter_user_id, created_at desc);

-- Service-role only: the API routes check the inviter themselves.
alter table public.agent_invites enable row level security;
revoke all on public.agent_invites from anon, authenticated;
