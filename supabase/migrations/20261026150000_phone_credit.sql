-- Prepaid phone credit (CoinPay top-ups) and per-call charges, in micro-dollars.
-- Service role only, like phone_lines / phone_calls.

alter table public.phone_calls
	add column if not exists country text,
	add column if not exists operator boolean not null default false,
	add column if not exists free_allowance integer not null default 0,
	add column if not exists free_seconds integer not null default 0,
	add column if not exists charged_micros bigint not null default 0,
	add column if not exists carrier_cost_micros bigint,
	add column if not exists reconciled_at timestamptz;

-- Calls made before credit existed were free US calls.
update public.phone_calls
	set country = coalesce(country, 'US'), free_seconds = billed_seconds, reconciled_at = coalesce(reconciled_at, now())
	where reconciled_at is null and status in ('ended', 'failed');

create table if not exists public.phone_balances (
	user_id uuid primary key references public.users(id) on delete cascade,
	balance_micros bigint not null default 0,
	updated_at timestamptz not null default now()
);

create table if not exists public.phone_topups (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references public.users(id) on delete cascade,
	amount_cents integer not null check (amount_cents > 0),
	session_id text unique,
	status text not null default 'pending' check (status in ('pending', 'paid')),
	created_at timestamptz not null default now(),
	paid_at timestamptz
);
create index if not exists phone_topups_user on public.phone_topups (user_id, created_at desc);

alter table public.phone_balances enable row level security;
alter table public.phone_topups enable row level security;

-- Add (or with a negative delta, take) credit; returns the new balance.
create or replace function public.phone_add_balance(p_user uuid, p_delta bigint)
returns bigint language sql as $$
	insert into public.phone_balances (user_id, balance_micros) values (p_user, p_delta)
	on conflict (user_id) do update set balance_micros = public.phone_balances.balance_micros + excluded.balance_micros, updated_at = now()
	returning balance_micros;
$$;

-- Credit a paid top-up exactly once; returns the new balance, or null if it was already credited.
create or replace function public.phone_credit_topup(p_topup uuid)
returns bigint language plpgsql as $$
declare t record;
begin
	update public.phone_topups set status = 'paid', paid_at = now()
		where id = p_topup and status = 'pending'
		returning user_id, amount_cents into t;
	if not found then return null; end if;
	return public.phone_add_balance(t.user_id, t.amount_cents::bigint * 10000);
end $$;

-- Charge a call exactly once; returns the new balance, or null if it was already charged.
create or replace function public.phone_charge_call(p_call uuid, p_micros bigint, p_carrier_micros bigint)
returns bigint language plpgsql as $$
declare u uuid;
begin
	update public.phone_calls
		set charged_micros = p_micros, carrier_cost_micros = coalesce(p_carrier_micros, carrier_cost_micros), reconciled_at = now(), updated_at = now()
		where id = p_call and reconciled_at is null
		returning user_id into u;
	if not found then return null; end if;
	if p_micros > 0 then return public.phone_add_balance(u, -p_micros); end if;
	return 0;
end $$;

revoke all on function public.phone_add_balance(uuid, bigint) from public, anon, authenticated;
revoke all on function public.phone_credit_topup(uuid) from public, anon, authenticated;
revoke all on function public.phone_charge_call(uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.phone_add_balance(uuid, bigint) to service_role;
grant execute on function public.phone_credit_topup(uuid) to service_role;
grant execute on function public.phone_charge_call(uuid, bigint, bigint) to service_role;
