-- Call Control events for calls AI agents place (agent-phone on dev2). The
-- agent's host cannot be reached from the internet, so Telnyx's webhooks land
-- here (/api/phone/agent-webhook) and the agent long-polls them
-- (/api/phone/agent-events) by call session. Service role only.
create table if not exists public.phone_agent_events (
	id bigserial primary key,
	session_id text not null,
	event jsonb not null,
	created_at timestamptz not null default now()
);
create index if not exists phone_agent_events_session on public.phone_agent_events (session_id, id);
alter table public.phone_agent_events enable row level security;
