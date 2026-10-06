import { describe, expect, it } from 'vitest';
import { emoji, parseOpenProfile, pronouns, web, accounts } from '@profullstack/openprofile';
import { cleanEmoji, cleanPronouns, cleanWebsite, PUBLIC_PROFILE_COLUMNS, toOpenProfile } from './fields.js';

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
});
