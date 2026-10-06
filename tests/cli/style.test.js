import { describe, expect, it } from 'vitest';
import { setIconMode, icon } from '@profullstack/hqtui';
import { em, mark, ok, who } from '../../src/cli/style.js';

describe('qc output style', () => {
	it('prefixes lines with OpenIcon glyphs from hqtui', () => {
		setIconMode('unicode');
		expect(mark('check-circle')).toBe(`${icon('check-circle')} `);
		expect(ok('done')).toBe(`${icon('check-circle')} done`);
		expect(mark('no-such-icon-at-all')).toBe('');
	});

	it('turns :shortcodes: into OpenEmoji characters', () => {
		expect(em('ship it :rocket:')).toBe('ship it 🚀');
	});

	it('shows people and agents with their emoji, handle and pronouns', () => {
		setIconMode('ascii');
		expect(who({ username: 'chovy', display_name: 'Anthony', emoji: '🔭', pronouns: 'he/him' })).toBe('🔭 Anthony @chovy (he/him)');
		expect(who({ username: 'riotcoder', display_name: 'riotcoder', account_type: 'agent' })).toBe('🤖 riotcoder');
		expect(who({ username: 'ada', display_name: 'Ada' })).toBe(`${mark('user')}Ada @ada`);
	});
});
