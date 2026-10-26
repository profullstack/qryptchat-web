/**
 * Phone calls from qrypt.chat: start, follow and bill them (Telnyx, US/Canada).
 *
 *   1. POST /api/phone/call checks the number and the caller's allowance, saves a
 *      call row and rings the caller's browser (its WebRTC credential) through
 *      the Call Control app, carrying { c: callId } as client_state.
 *   2. The browser answers; Telnyx sends call.answered for that leg, and we
 *      transfer it to the number with time_limit_secs = the allowance, so Telnyx
 *      itself ends the call when the free minutes run out.
 *   3. call.answered on the phone leg starts the clock; call.hangup on it bills
 *      the seconds from answer to hang-up.
 *
 * Storage goes through a small store (supabaseStore below; a memory one in tests).
 */
import { billableSeconds, blockedReason, callLimitSeconds, dayStart, freeSecondsLeft, normalizeNumber } from '@/lib/phone/rules.js';
import { decodeState, encodeState } from './telnyx-voice.js';

const LIVE = ['ringing', 'connecting', 'active'];
const STALE_MS = 2 * 60 * 60 * 1000;

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
	const usedTodaySeconds = await store.usedSince(user.id, dayStart(now));
	return { operator, anonymous, usedTodaySeconds, freeSecondsLeft: freeSecondsLeft({ operator, anonymous, usedTodaySeconds }) };
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

export async function startCall({ store, telnyx, config, user, to, env = process.env, now = new Date() }) {
	const number = normalizeNumber(to);
	const reason = blockedReason(number);
	if (reason) throw new PhoneError(reason, 400);
	const account = await accountState({ store, user, env, now });
	const limit = callLimitSeconds(account);
	if (!limit) {
		throw new PhoneError(account.anonymous ? 'Free calling minutes are for signed-in accounts. Sign in with a phone number, passkey or CoinPay.' : "You've used today's 10 free minutes. They come back at midnight UTC.", 402);
	}
	const live = await store.liveCall(user.id, new Date(now.getTime() - STALE_MS).toISOString());
	if (live) throw new PhoneError('You are already on a call.', 409);

	const line = await ensureLine({ store, telnyx, config, user });
	const call = await store.insertCall({ user_id: user.id, to_number: number, status: 'ringing', limit_seconds: limit });
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
		await store.updateCall(call.id, { status: 'failed', ended_at: now.toISOString(), hangup_cause: 'dial_failed' });
		throw new PhoneError(`Could not place the call: ${e.message}`, 502);
	}
	return { callId: call.id, to: number, limitSeconds: limit, account };
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
	if (type === 'call.hangup' && isPhoneLeg) {
		const answeredAt = call.answered_at || (p.start_time && call.status === 'active' ? p.start_time : null);
		const endedAt = p.end_time || event.occurred_at;
		const billed = billableSeconds(answeredAt, endedAt);
		await store.updateCall(call.id, { status: 'ended', ended_at: endedAt, billed_seconds: billed, hangup_cause: p.hangup_cause || null, pstn_leg_id: call.pstn_leg_id || ccid });
		return { billed };
	}
	if (type === 'call.hangup' && isUserLeg && call.status !== 'ended') {
		// The caller hung up (or never answered) before the other side picked up.
		if (call.status === 'active') return { waiting: 'phone leg hangup' };
		await store.updateCall(call.id, { status: 'ended', ended_at: p.end_time || event.occurred_at, hangup_cause: p.hangup_cause || null });
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

/** Storage on qrypt's Supabase (tables from supabase/migrations/20261026120000_phone_calls.sql). */
export function supabaseStore(db) {
	const one = async (q) => {
		const { data, error } = await q;
		if (error && error.code !== 'PGRST116') throw new Error(error.message);
		return data ?? null;
	};
	return {
		getLine: (userId) => one(db.from('phone_lines').select('*').eq('user_id', userId).maybeSingle()),
		saveLine: (line) => one(db.from('phone_lines').insert(line)),
		async usedSince(userId, iso) {
			const rows = (await one(db.from('phone_calls').select('billed_seconds').eq('user_id', userId).gte('created_at', iso))) || [];
			return rows.reduce((n, r) => n + (r.billed_seconds || 0), 0);
		},
		liveCall: (userId, sinceIso) => one(db.from('phone_calls').select('id').eq('user_id', userId).in('status', LIVE).gte('created_at', sinceIso).limit(1).maybeSingle()),
		insertCall: (row) => one(db.from('phone_calls').insert(row).select('*').single()),
		updateCall: (id, patch) => one(db.from('phone_calls').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)),
		findCall: ({ id, sessionId }) => one(id ? db.from('phone_calls').select('*').eq('id', id).maybeSingle() : db.from('phone_calls').select('*').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(1).maybeSingle()),
		recentCalls: (userId, n = 20) => one(db.from('phone_calls').select('id, to_number, status, billed_seconds, hangup_cause, created_at, answered_at, ended_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(n)),
	};
}
