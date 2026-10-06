/**
 * AI agents as qrypt.chat accounts.
 *
 * A person invites an agent (email, SMS or a link they share). The agent runs
 * `qc agent join <link>`: it makes its own ML-KEM keys locally and redeems the
 * invite with only the public key. The server creates an `agent` account whose
 * operator is the inviter, stores the public key, opens a direct conversation
 * between them, and hands back a session. From then on the agent chats like
 * any qc user, end to end encrypted.
 *
 * The invite token is a 256-bit secret carried in the link's fragment (never
 * sent in a request line or a Referer); the database keeps only its SHA-256.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const INVITE_TTL_DAYS = 7;
export const MAX_OPEN_INVITES = 25;
export const SITE = 'https://qrypt.chat';
export const AGENT_USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;
const ML_KEM_1024_PUBLIC_KEY_BYTES = 1568;

export class AgentError extends Error {
	constructor(code, message, status = 400) {
		super(message);
		this.code = code;
		this.status = status;
	}
}

export const newInviteToken = () => randomBytes(32).toString('base64url');
export const hashInviteToken = (token) => createHash('sha256').update(String(token)).digest('hex');

/** The link a person shares; the token rides in the fragment. */
export const inviteUrl = (token) => `${SITE}/agents/join#${token}`;

/** A token from a link, a fragment or the bare token. */
export function tokenFrom(input) {
	const text = String(input ?? '').trim();
	const fromUrl = /[#?&](?:token=)?([A-Za-z0-9_-]{40,})$/.exec(text);
	const token = fromUrl ? fromUrl[1] : text;
	return /^[A-Za-z0-9_-]{40,64}$/.test(token) ? token : null;
}

/** What the inviter types, cleaned: a name of up to 60 characters, or null. */
export function cleanAgentName(name) {
	if (name === undefined || name === null) return null;
	const text = String(name).trim().replace(/\s+/g, ' ');
	if (!text) return null;
	if (text.length > 60 || /[<>\p{Cc}]/u.test(text)) throw new AgentError('invalid_name', 'Give the agent a name of up to 60 characters');
	return text;
}

/**
 * Create an invite. Returns { id, token, url, expiresAt }; the token is never
 * stored, so it can only be shown now.
 */
export async function createInvite(db, inviterUserId, { name = null, channel = 'link', destination = null } = {}) {
	const { count } = await db
		.from('agent_invites')
		.select('id', { count: 'exact', head: true })
		.eq('inviter_user_id', inviterUserId)
		.is('redeemed_at', null)
		.is('revoked_at', null)
		.gt('expires_at', new Date().toISOString());
	if ((count ?? 0) >= MAX_OPEN_INVITES) {
		throw new AgentError('too_many_invites', `You have ${MAX_OPEN_INVITES} open agent invites. Revoke some first.`, 429);
	}
	const token = newInviteToken();
	const { data, error } = await db
		.from('agent_invites')
		.insert({ token_hash: hashInviteToken(token), inviter_user_id: inviterUserId, agent_name: name, channel, destination })
		.select('id, expires_at')
		.single();
	if (error || !data) throw new AgentError('server_error', 'Could not create the invite', 500);
	return { id: data.id, token, url: inviteUrl(token), expiresAt: data.expires_at };
}

/** The invite behind a token if it can still be redeemed, else null. */
export async function openInvite(db, token) {
	const { data } = await db
		.from('agent_invites')
		.select('id, inviter_user_id, agent_name, expires_at, revoked_at, redeemed_at')
		.eq('token_hash', hashInviteToken(token))
		.maybeSingle();
	if (!data || data.revoked_at || data.redeemed_at || Date.parse(data.expires_at) <= Date.now()) return null;
	return data;
}

/**
 * Redeem an invite as a new agent account. `publicKey` is the agent's
 * ML-KEM-1024 public key (base64); its private key never leaves the agent.
 * Returns { authUserId, user, conversationId, operator }.
 */
export async function redeemInvite(db, token, { username, displayName, publicKey }) {
	if (!AGENT_USERNAME_RE.test(username ?? '')) throw new AgentError('invalid_username', 'Pick a username of 3-30 letters, digits or underscores');
	let keyBytes;
	try {
		keyBytes = Buffer.from(String(publicKey ?? ''), 'base64');
	} catch {
		keyBytes = Buffer.alloc(0);
	}
	if (keyBytes.length !== ML_KEM_1024_PUBLIC_KEY_BYTES) throw new AgentError('invalid_key', 'publicKey must be an ML-KEM-1024 public key (base64)');
	const name = cleanAgentName(displayName);

	const invite = await openInvite(db, token);
	if (!invite) throw new AgentError('invite_invalid', 'This invite is invalid, used, revoked or expired', 410);

	const { data: taken } = await db.from('users').select('id').ilike('username', username).maybeSingle();
	if (taken) throw new AgentError('username_taken', 'That username is taken', 409);

	// Claim the invite before creating anything: two redeemers cannot both win.
	const { data: claimed } = await db
		.from('agent_invites')
		.update({ redeemed_at: new Date().toISOString() })
		.eq('id', invite.id)
		.is('redeemed_at', null)
		.select('id');
	if (!claimed?.length) throw new AgentError('invite_invalid', 'This invite was just used', 410);

	let authUserId = null;
	const undo = async () => {
		if (authUserId) await db.auth.admin.deleteUser(authUserId).catch(() => {});
		await db.from('agent_invites').update({ redeemed_at: null, redeemed_by: null }).eq('id', invite.id);
	};

	try {
		const { data: created, error: authError } = await db.auth.admin.createUser({
			email: `agent-${randomUUID()}@agents.qrypt.chat`,
			email_confirm: true,
			user_metadata: { agent: true, operator_user_id: invite.inviter_user_id },
		});
		if (authError || !created?.user) throw new AgentError('server_error', 'Could not create the agent account', 500);
		authUserId = created.user.id;

		const { data: user, error: userError } = await db
			.from('users')
			.insert({
				auth_user_id: authUserId,
				phone_number: null,
				account_type: 'agent',
				operator_user_id: invite.inviter_user_id,
				username,
				display_name: name || invite.agent_name || username,
			})
			.select('id, username, display_name, account_type, operator_user_id')
			.single();
		if (userError || !user) {
			if (userError?.code === '23505') throw new AgentError('username_taken', 'That username is taken', 409);
			throw new AgentError('server_error', 'Could not create the agent account', 500);
		}

		const { error: keyError } = await db
			.from('user_public_keys')
			.insert({ user_id: authUserId, public_key: keyBytes.toString('base64'), key_type: 'ML-KEM-1024' });
		if (keyError) throw new AgentError('server_error', 'Could not store the agent key', 500);

		const { data: conversationId, error: convError } = await db.rpc('create_direct_conversation', {
			user1_id: invite.inviter_user_id,
			user2_id: user.id,
		});
		if (convError || !conversationId) throw new AgentError('server_error', 'Could not open the conversation', 500);

		await db.from('agent_invites').update({ redeemed_by: user.id }).eq('id', invite.id);

		const { data: operator } = await db
			.from('users')
			.select('id, username, display_name')
			.eq('id', invite.inviter_user_id)
			.single();
		return { authUserId, user, conversationId, operator };
	} catch (error) {
		await undo();
		throw error;
	}
}

/** The invite message for email and SMS. */
export function inviteMessage({ inviterName, agentName, url }) {
	const who = agentName ? `your agent "${agentName}"` : 'your AI agent';
	const subject = `${inviterName} invited ${agentName ? `"${agentName}"` : 'an AI agent'} to qrypt.chat`;
	const command = `npx -y @profullstack/qryptchat agent join "${url}"`;
	const text = [
		`${inviterName} wants to chat with ${who} on qrypt.chat, end-to-end encrypted (ML-KEM-1024).`,
		'',
		'Give the agent this command; it makes its own keys and joins:',
		'',
		`  ${command}`,
		'',
		`Then it can use qc listen / qc send, or run qc mcp as an MCP server. The link works once and expires in ${INVITE_TTL_DAYS} days.`,
		'',
		`Instructions: ${url}`,
	].join('\n');
	const sms = `${inviterName} invited ${agentName ? `"${agentName}"` : 'an AI agent'} to qrypt.chat. Have the agent run: ${command}`;
	return { subject, text, sms };
}
