import { describe, expect, it } from 'vitest';
import { emoji, parseOpenProfile, pronouns, web, accounts, section } from '@profullstack/openprofile';
import { cleanDisplayName, cleanEmoji, cleanPronouns, cleanWebsite, PUBLIC_PROFILE_COLUMNS, toOpenAgent, toOpenProfile } from './fields.js';

describe('profile fields', () => {
	it('emoji: exactly one emoji grapheme, empty clears', () => {
		expect(cleanEmoji(' 🔭 ')).toEqual({ value: '🔭' });
		expect(cleanEmoji('👩🏽‍💻')).toEqual({ value: '👩🏽‍💻' });
		expect(cleanEmoji('🏳️‍🌈')).toEqual({ value: '🏳️‍🌈' });
		expect(cleanEmoji('🇺🇸')).toEqual({ value: '🇺🇸' });
		expect(cleanEmoji('')).toEqual({ value: null });
		expect(cleanEmoji('ab')).toHaveProperty('error');
		expect(cleanEmoji('🔭🔭')).toHaveProperty('error');
		expect(cleanEmoji('<script>')).toHaveProperty('error');
	});

	it('display name: trimmed, collapsed, 1-50 characters, no control characters, empty keeps current', () => {
		expect(cleanDisplayName('  Daniel   B ')).toEqual({ value: 'Daniel B' });
		expect(cleanDisplayName('Zoë 🔭')).toEqual({ value: 'Zoë 🔭' });
		expect(cleanDisplayName('a\u0000b\nc')).toEqual({ value: 'a b c' });
		expect(cleanDisplayName('\u202Eevil')).toEqual({ value: 'evil' });
		expect(cleanDisplayName('é'.repeat(50))).toEqual({ value: 'é'.repeat(50) });
		expect(cleanDisplayName('')).toEqual({ value: null });
		expect(cleanDisplayName(null)).toEqual({ value: null });
		expect(cleanDisplayName('x'.repeat(51))).toHaveProperty('error');
		expect(cleanDisplayName('<script>')).toHaveProperty('error');
		expect(cleanDisplayName(1)).toHaveProperty('error');
	});

	it('pronouns: as written, trimmed, bounded, no markup', () => {
		expect(cleanPronouns(' she/they ')).toEqual({ value: 'she/they' });
		expect(cleanPronouns('ask   me')).toEqual({ value: 'ask me' });
		expect(cleanPronouns('')).toEqual({ value: null });
		expect(cleanPronouns('a'.repeat(41))).toHaveProperty('error');
		expect(cleanPronouns('she<br>her')).toHaveProperty('error');
	});

	it('website: http(s) only, bare domains get https', () => {
		expect(cleanWebsite('ada.example')).toEqual({ value: 'https://ada.example/' });
		expect(cleanWebsite('http://ada.example/blog')).toEqual({ value: 'http://ada.example/blog' });
		expect(cleanWebsite('javascript:alert(1)')).toHaveProperty('error');
		expect(cleanWebsite('localhost')).toHaveProperty('error');
		expect(cleanWebsite('')).toEqual({ value: null });
	});

	it('the public column list never includes private columns', () => {
		expect(PUBLIC_PROFILE_COLUMNS).not.toMatch(/phone|salt|auth_user_id|\*/);
		expect(PUBLIC_PROFILE_COLUMNS).toMatch(/emoji/);
		expect(PUBLIC_PROFILE_COLUMNS).toMatch(/pronouns/);
		expect(PUBLIC_PROFILE_COLUMNS).toMatch(/website/);
	});

	it('serves a profile as OpenProfile.md that the package reads back', () => {
		const md = toOpenProfile({ username: 'ada', display_name: 'Ada Lovelace', emoji: '🔭', pronouns: 'she/her', website: 'https://ada.example/', avatar_url: null, bio: 'Writes about engines.\nMore.' });
		const doc = parseOpenProfile(md);
		expect(doc.name).toBe('Ada Lovelace');
		expect(emoji(doc)).toBe('🔭');
		expect(pronouns(doc)).toBe('she/her');
		expect(web(doc)).toBe('https://ada.example/');
		expect(doc.headline).toBe('Writes about engines.');
		expect(accounts(doc)[0].url).toBe('https://qrypt.chat/u/ada');
		expect(md).not.toMatch(/Avatar/);
	});

	it('leaves unset fields out rather than writing them empty', () => {
		const doc = parseOpenProfile(toOpenProfile({ username: 'bob', display_name: null }));
		expect(doc.name).toBe('bob');
		expect(pronouns(doc)).toBeNull();
		expect(emoji(doc)).toBeNull();
	});

	it('an owner lists their agents; an agent links its OpenAgent descriptor', () => {
		const owner = parseOpenProfile(toOpenProfile({ username: 'chovy', display_name: 'Anthony' }, null, [{ username: 'riotcoder', display_name: 'riotcoder' }, { username: 'cha0spunk', display_name: null }]));
		const body = section(owner, 'agents')?.body ?? '';
		expect(body).toContain('https://qrypt.chat/u/riotcoder/openagent.json');
		expect(body).toContain('[cha0spunk](https://qrypt.chat/u/cha0spunk)');
		const md = toOpenProfile({ username: 'riotcoder', display_name: 'riotcoder', account_type: 'agent' }, { username: 'chovy', display_name: 'Anthony' });
		expect(md).toContain('https://qrypt.chat/u/riotcoder/openagent.json');
		expect(md).toMatch(/owner and operator/);
		expect(toOpenProfile({ username: 'ada', display_name: 'Ada' })).not.toMatch(/OpenAgent|## Agents/);
	});

	it('OpenAgent: the logicsrc.agent 0.1 fields only, owner by did', () => {
		const doc = toOpenAgent({ username: 'Riotcoder', display_name: 'riotcoder', bio: 'Ships code.\nMore.' }, { username: 'chovy' });
		expect(doc).toMatchObject({ type: 'logicsrc.agent', version: '0.1', did: 'riotcoder.qrypt.chat', owner_did: 'chovy.qrypt.chat', description: 'Ships code.' });
		expect(Object.keys(doc).sort()).toEqual(['description', 'did', 'name', 'owner_did', 'permissions_requested', 'polling_mode', 'public', 'skills', 'supported_task_types', 'type', 'version']);
		expect(doc.skills.length).toBeGreaterThan(0);
		for (const did of [doc.did, doc.owner_did]) expect(did).toMatch(/^[a-z0-9][a-z0-9._-]*\.[a-z0-9][a-z0-9._-]*$/);
	});
});
