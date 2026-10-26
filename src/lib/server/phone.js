/**
 * Phone calls from qrypt.chat: start, follow, bill and top up (Telnyx + CoinPay).
 *
 *   1. POST /api/phone/call checks the number and the caller's allowance (free
 *      US/Canada minutes, then prepaid credit), saves a call row and rings the
 *      caller's browser (its WebRTC credential) through the Call Control app,
 *      carrying { c: callId } as client_state.
 *   2. The browser answers; on call.answered for that leg we transfer it to the
 *      number with time_limit_secs = the allowance, so Telnyx itself ends the call.
 *   3. call.answered on the phone leg starts the clock; call.hangup on it bills.
 *      US/Canada: free seconds first, then 1 cent per started minute, charged at
 *      once. Elsewhere: twice the carrier's cost from Telnyx's call records, charged
 *      when those records appear (reconcileCall, retried and also run on GET /api/phone).
 *
 * Storage goes through a small store (supabaseStore below; a memory one in tests).
 */
import { billableSeconds, blockedReason, callAllowance, countryName, dayStart, freeSecondsLeft, intlChargeMicros, isFreeCountry, parseNumber, usCaChargeMicros } from '@/lib/phone/rules.js';
import { decodeState, encodeState } from './telnyx-voice.js';

const LIVE = ['ringing', 'connecting', 'active'];
const STALE_MS = 2 * 60 * 60 * 1000;
const RECONCILE_AFTER_MS = [90_000, 5 * 60_000, 30 * 60_000];

export class PhoneError extends Error {
	constructor(message, status = 400) {
		super(message);
		this.status = status;
	}
}

export const operatorIds = (env = process.env) => new Set(String(env.PHONE_OPERATOR_IDS || '').split(',').map((s) => s.trim()).filter(Boolean));

/** What this person may do right now. */
export async function accountState({ store, user, env = process.env, now = new Date() }) {
	const operator = operatorIds(env).has(user.id);
	const anonymous = user.account_type === 'anonymous';
	const [usedTodaySeconds, balanceMicros] = await Promise.all([store.freeUsedSince(user.id, dayStart(now)), store.balance(user.id)]);
	return { operator, anonymous, usedTodaySeconds, balanceMicros, freeSecondsLeft: freeSecondsLeft({ operator, anonymous, usedTodaySeconds }) };
}

/** The user's WebRTC line (a Telnyx telephony credential), made on first use. */
export async function ensureLine({ store, telnyx, config, user }) {
	const existing = await store.getLine(user.id);
	if (existing) return existing;
	const cred = await telnyx.createCredential(config.connectionId, `qrypt-${user.id}`);
	const line = { user_id: user.id, credential_id: cred.id, sip_username: cred.sip_username };
	await store.saveLine(line);
	return line;
}

/** A login token for the browser SDK. */
export async function loginToken({ store, telnyx, config, user }) {
	const line = await ensureLine({ store, telnyx, config, user });
	return { token: await telnyx.loginToken(line.credential_id), line };
}

function noAllowanceMessage(account, country) {
	if (!isFreeCountry(country)) return `Calls to ${countryName(country)} use credit. Add credit to call.`;
	if (account.anonymous) return 'Free calling minutes are for signed-in accounts. Sign in with a phone number, passkey or CoinPay, or add credit.';
	return "You've used today's 10 free minutes. Add credit to keep calling, or wait for midnight UTC.";
}

export async function startCall({ store, telnyx, config, user, to, env = process.env, now = new Date() }) {
	const parsed = parseNumber(to);
	const reason = blockedReason(parsed);
	if (reason) throw new PhoneError(reason, 400);
	const account = await accountState({ store, user, env, now });
	const { limit, free } = callAllowance(account, parsed.country);
	if (!limit) throw new PhoneError(noAllowanceMessage(account, parsed.country), 402);
	const live = await store.liveCall(user.id, new Date(now.getTime() - STALE_MS).toISOString());
	if (live) throw new PhoneError('You are already on a call.', 409);

	const line = await ensureLine({ store, telnyx, config, user });
	const call = await store.insertCall({
		user_id: user.id,
		to_number: parsed.e164,
		country: parsed.country,
		operator: account.operator,
		status: 'ringing',
		limit_seconds: limit,
		free_allowance: free,
	});
	try {
		const leg = await telnyx.dial({
			connection_id: config.appId,
			to: `sip:${line.sip_username}@sip.telnyx.com`,
			from: config.callerId,
			timeout_secs: 30,
			client_state: encodeState({ c: call.id }),
		});
		await store.updateCall(call.id, { user_leg_id: leg.call_control_id, session_id: leg.call_session_id });
	} catch (e) {
		await store.updateCall(call.id, { status: 'failed', ended_at: now.toISOString(), hangup_cause: 'dial_failed', reconciled_at: now.toISOString() });
		throw new PhoneError(`Could not place the call: ${e.message}`, 502);
	}
	return { callId: call.id, to: parsed.e164, country: parsed.country, limitSeconds: limit, freeSeconds: free, account };
}

/**
 * Settle a finished call: free seconds, then the charge. US/Canada at once;
 * elsewhere from Telnyx's call records (returns { pending: true } until they exist).
 */
export async function settleCall({ store, telnyx, call }) {
	if (call.reconciled_at) return { settled: 'already' };
	const billed = call.billed_seconds || 0;
	if (call.operator || !billed) {
		await store.chargeCall(call.id, 0, null);
		return { charged: 0 };
	}
	if (isFreeCountry(call.country)) {
		const micros = usCaChargeMicros(billed, call.free_allowance);
		await store.chargeCall(call.id, micros, null);
		return { charged: micros };
	}
	const records = await telnyx.callRecords(call.session_id);
	if (!records.length) return { pending: true };
	const carrierUsd = records.reduce((n, r) => n + (Number(r.cost) || 0), 0);
	const micros = intlChargeMicros(carrierUsd);
	await store.chargeCall(call.id, micros, Math.round(carrierUsd * 1e6));
	return { charged: micros, carrierUsd };
}

/** Settle this user's finished calls still waiting on carrier records. */
export async function settlePending({ store, telnyx, userId, now = Date.now() }) {
	const calls = (await store.unsettled(userId)) || [];
	for (const c of calls) {
		if (c.ended_at && now - Date.parse(c.ended_at) > 60_000) await settleCall({ store, telnyx, call: c }).catch(() => {});
	}
}

function settleLater({ store, telnyx, callId }) {
	for (const ms of RECONCILE_AFTER_MS) {
		const t = setTimeout(async () => {
			const call = await store.findCall({ id: callId }).catch(() => null);
			if (call && !call.reconciled_at) await settleCall({ store, telnyx, call }).catch(() => {});
		}, ms);
		t.unref?.();
	}
}

/** One Telnyx webhook event. Safe to receive twice. */
export async function handleEvent({ store, telnyx, config, event }) {
	const type = event?.event_type;
	const p = event?.payload || {};
	const state = decodeState(p.client_state);
	const call = (state?.c && (await store.findCall({ id: state.c }))) || (p.call_session_id && (await store.findCall({ sessionId: p.call_session_id })));
	if (!call) return { ignored: 'unknown call' };
	const ccid = p.call_control_id;
	const isUserLeg = ccid && ccid === call.user_leg_id;
	const isPhoneLeg = p.to === call.to_number || (call.pstn_leg_id && ccid === call.pstn_leg_id);

	if (type === 'call.answered' && isUserLeg && call.status === 'ringing') {
		await store.updateCall(call.id, { status: 'connecting' });
		try {
			await telnyx.transfer(ccid, {
				to: call.to_number,
				from: config.callerId,
				time_limit_secs: call.limit_seconds,
				timeout_secs: 45,
				client_state: encodeState({ c: call.id }),
			});
		} catch (e) {
			await store.updateCall(call.id, { status: 'failed', hangup_cause: 'transfer_failed' });
			await telnyx.hangup(ccid).catch(() => {});
			return { error: e.message };
		}
		return { transferred: true };
	}
	if (type === 'call.answered' && isPhoneLeg && !call.answered_at) {
		await store.updateCall(call.id, { status: 'active', answered_at: p.start_time || event.occurred_at, pstn_leg_id: ccid });
		return { active: true };
	}
	if (type === 'call.hangup' && isPhoneLeg && call.status !== 'ended') {
		const answeredAt = call.answered_at || (p.start_time && call.status === 'active' ? p.start_time : null);
		const endedAt = p.end_time || event.occurred_at;
		const billed = billableSeconds(answeredAt, endedAt);
		const freeSeconds = Math.min(billed, call.free_allowance || 0);
		await store.updateCall(call.id, { status: 'ended', ended_at: endedAt, billed_seconds: billed, free_seconds: freeSeconds, hangup_cause: p.hangup_cause || null, pstn_leg_id: call.pstn_leg_id || ccid });
		const fresh = await store.findCall({ id: call.id });
		const result = await settleCall({ store, telnyx, call: fresh });
		if (result.pending) settleLater({ store, telnyx, callId: call.id });
		return { billed, ...result };
	}
	if (type === 'call.hangup' && isUserLeg && call.status !== 'ended') {
		// The caller hung up (or never answered) before the other side picked up.
		if (call.status === 'active') return { waiting: 'phone leg hangup' };
		await store.updateCall(call.id, { status: 'ended', ended_at: p.end_time || event.occurred_at, hangup_cause: p.hangup_cause || null });
		await store.chargeCall(call.id, 0, null);
		return { ended: true };
	}
	return { ignored: type };
}

export async function hangupCall({ store, telnyx, user, callId }) {
	const call = await store.findCall({ id: callId });
	if (!call || call.user_id !== user.id) throw new PhoneError('No such call', 404);
	for (const leg of [call.pstn_leg_id, call.user_leg_id]) if (leg) await telnyx.hangup(leg).catch(() => {});
	return { ok: true };
}

/** Storage on qrypt's Supabase (tables from supabase/migrations/202610261*_phone_*.sql). */
export function supabaseStore(db) {
	const one = async (q) => {
		const { data, error } = await q;
		if (error && error.code !== 'PGRST116') throw new Error(error.message);
		return data ?? null;
	};
	return {
		getLine: (userId) => one(db.from('phone_lines').select('*').eq('user_id', userId).maybeSingle()),
		saveLine: (line) => one(db.from('phone_lines').insert(line)),
		async freeUsedSince(userId, iso) {
			const rows = (await one(db.from('phone_calls').select('free_seconds').eq('user_id', userId).gte('created_at', iso))) || [];
			return rows.reduce((n, r) => n + (r.free_seconds || 0), 0);
		},
		async balance(userId) {
			const row = await one(db.from('phone_balances').select('balance_micros').eq('user_id', userId).maybeSingle());
			return Number(row?.balance_micros || 0);
		},
		liveCall: (userId, sinceIso) => one(db.from('phone_calls').select('id').eq('user_id', userId).in('status', LIVE).gte('created_at', sinceIso).limit(1).maybeSingle()),
		insertCall: (row) => one(db.from('phone_calls').insert(row).select('*').single()),
		updateCall: (id, patch) => one(db.from('phone_calls').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)),
		findCall: ({ id, sessionId }) => one(id ? db.from('phone_calls').select('*').eq('id', id).maybeSingle() : db.from('phone_calls').select('*').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(1).maybeSingle()),
		chargeCall: (id, micros, carrierMicros) => one(db.rpc('phone_charge_call', { p_call: id, p_micros: micros, p_carrier_micros: carrierMicros })),
		unsettled: (userId) => one(db.from('phone_calls').select('*').eq('user_id', userId).eq('status', 'ended').is('reconciled_at', null).limit(20)),
		recentCalls: (userId, n = 20) => one(db.from('phone_calls').select('id, to_number, country, status, billed_seconds, free_seconds, charged_micros, reconciled_at, hangup_cause, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(n)),
		insertTopup: (row) => one(db.from('phone_topups').insert(row).select('*').single()),
		setTopupSession: (id, sessionId) => one(db.from('phone_topups').update({ session_id: sessionId }).eq('id', id)),
		creditTopup: (id) => one(db.rpc('phone_credit_topup', { p_topup: id })),
		async topupIdBySession(sessionId) {
			const row = await one(db.from('phone_topups').select('id').eq('session_id', sessionId).maybeSingle());
			return row?.id || null;
		},
	};
}
