import { describe, expect, it } from 'vitest';
import { billableSeconds, blockedReason, callLimitSeconds, dayStart, formatNumber, freeSecondsLeft, normalizeNumber, startedMinutes } from './rules.js';

describe('phone rules', () => {
	it('normalizes the ways people type North American numbers', () => {
		for (const n of ['(408) 555-0199', '408.555.0199', '1-408-555-0199', '+1 408 555 0199', '4085550199']) expect(normalizeNumber(n)).toBe('+14085550199');
		for (const n of ['555-0199', '+44 20 7946 0958', '011-408-555-0199', '(108) 555-0199', '408-155-0199', '', null]) expect(normalizeNumber(n)).toBeNull();
	});

	it('blocks 911 and other service codes, premium rate and fictional numbers', () => {
		expect(blockedReason(normalizeNumber('911'))).toMatch(/not a US/);
		expect(blockedReason('+19115550100')).toMatch(/911/);
		expect(blockedReason('+14089110000')).toMatch(/911/);
		expect(blockedReason('+19005551234')).toMatch(/Premium/);
		expect(blockedReason('+14089761234')).toMatch(/Premium/);
		expect(blockedReason('+14085550123')).toMatch(/fictional/);
		expect(blockedReason('+13034997111')).toBe('');
	});

	it('gives signed-in people 10 free minutes a day, anonymous none, operators an hour per call', () => {
		expect(freeSecondsLeft({ usedTodaySeconds: 0 })).toBe(600);
		expect(freeSecondsLeft({ usedTodaySeconds: 420 })).toBe(180);
		expect(freeSecondsLeft({ usedTodaySeconds: 900 })).toBe(0);
		expect(freeSecondsLeft({ anonymous: true, usedTodaySeconds: 0 })).toBe(0);
		expect(freeSecondsLeft({ operator: true, usedTodaySeconds: 99999 })).toBe(3600);
		expect(callLimitSeconds({ usedTodaySeconds: 580 })).toBe(0); // 20 s left: under Telnyx's 30 s minimum
		expect(callLimitSeconds({ usedTodaySeconds: 500 })).toBe(100);
	});

	it('bills from answer to hang-up, rounding up', () => {
		expect(billableSeconds('2026-10-26T12:39:57.481Z', '2026-10-26T12:40:30.041Z')).toBe(33);
		expect(billableSeconds(null, '2026-10-26T12:40:30Z')).toBe(0);
		expect(startedMinutes(33)).toBe(1);
		expect(startedMinutes(61)).toBe(2);
		expect(startedMinutes(0)).toBe(0);
	});

	it('resets at UTC midnight and formats numbers', () => {
		expect(dayStart(new Date('2026-10-26T23:59:00-07:00'))).toBe('2026-10-27T00:00:00.000Z');
		expect(formatNumber('+14085550199')).toBe('(408) 555-0199');
	});
});
