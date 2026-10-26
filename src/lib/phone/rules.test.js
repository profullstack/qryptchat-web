import { describe, expect, it } from 'vitest';
import {
	billableSeconds,
	blockedReason,
	callAllowance,
	callLimitSeconds,
	dayStart,
	formatMoney,
	formatNumber,
	freeSecondsLeft,
	intlChargeMicros,
	normalizeNumber,
	parseNumber,
	startedMinutes,
	usCaChargeMicros,
} from './rules.js';

describe('phone numbers', () => {
	it('reads North American numbers without a country code and others with one', () => {
		for (const n of ['(408) 555-1234', '408.555.1234', '1-408-555-1234', '+1 408 555 1234', '4085551234']) expect(parseNumber(n)).toMatchObject({ e164: '+14085551234', country: 'US' });
		expect(parseNumber('+44 20 7946 0958')).toMatchObject({ e164: '+442079460958', country: 'GB' });
		expect(parseNumber('0044 20 7946 0958')).toMatchObject({ country: 'GB' });
		expect(parseNumber('+1 416 555 1234')).toMatchObject({ country: 'CA' });
		expect(parseNumber('+1 876 555 1234')?.country).toBe('JM');
		for (const n of ['555-0199', '', null, '+999 123']) expect(parseNumber(n)).toBeNull();
		expect(normalizeNumber('4085551234')).toBe('+14085551234');
		expect(normalizeNumber('+442079460958')).toBeNull();
	});

	it('blocks countries we have not opened, premium rate, 911 and fictional numbers', () => {
		expect(blockedReason(parseNumber('+1 876 555 1234'))).toMatch(/Jamaica/);
		expect(blockedReason(parseNumber('+44 909 879 0000'))).toMatch(/Premium/);
		expect(blockedReason(parseNumber('+1 900 555 1234'))).toMatch(/Premium/);
		expect(blockedReason(parseNumber('+1 408 911 1234'))).toMatch(/911/);
		expect(blockedReason(parseNumber('408-555-0123'))).toMatch(/fictional/);
		expect(blockedReason(null)).toMatch(/country code/);
		expect(blockedReason(parseNumber('+1 303 499 7111'))).toBe('');
		expect(blockedReason(parseNumber('+44 20 7946 0958'))).toBe('');
	});

	it('formats numbers', () => {
		expect(formatNumber('+14085551234')).toBe('(408) 555-1234');
		expect(formatNumber('+442079460958')).toBe('+44 20 7946 0958');
	});
});

describe('allowance and charges', () => {
	it('gives 10 free US/Canada minutes a day to signed-in accounts only', () => {
		expect(freeSecondsLeft({ usedTodaySeconds: 420 })).toBe(180);
		expect(freeSecondsLeft({ anonymous: true })).toBe(0);
		expect(callLimitSeconds({ usedTodaySeconds: 580 })).toBe(0);
	});

	it('adds what the balance pays for, at the worst-case rate', () => {
		// $1 buys 100 US minutes at 1 cent; 600 free seconds first; capped at an hour.
		expect(callAllowance({ usedTodaySeconds: 0, balanceMicros: 1_000_000 }, 'US')).toEqual({ limit: 3600, free: 600 });
		expect(callAllowance({ usedTodaySeconds: 600, balanceMicros: 50_000 }, 'US')).toEqual({ limit: 300, free: 0 });
		// Abroad there are no free minutes and a minute may cost up to 20.4 cents.
		expect(callAllowance({ usedTodaySeconds: 0, balanceMicros: 1_000_000 }, 'GB')).toEqual({ limit: 240, free: 0 });
		expect(callAllowance({ usedTodaySeconds: 0, balanceMicros: 100_000 }, 'GB')).toEqual({ limit: 0, free: 0 });
		expect(callAllowance({ anonymous: true, balanceMicros: 50_000 }, 'US')).toEqual({ limit: 300, free: 0 });
		expect(callAllowance({ operator: true }, 'GB')).toEqual({ limit: 3600, free: 3600 });
	});

	it('charges US/Canada per started paid minute and abroad twice the carrier cost', () => {
		expect(usCaChargeMicros(500, 600)).toBe(0);
		expect(usCaChargeMicros(661, 600)).toBe(20_000); // 61 paid seconds = 2 started minutes
		expect(usCaChargeMicros(30, 0)).toBe(10_000);
		expect(intlChargeMicros('0.0128')).toBe(25_600);
		expect(intlChargeMicros(null)).toBe(0);
		expect(formatMoney(1_234_567)).toBe('$1.23');
	});

	it('bills from answer to hang-up and resets at UTC midnight', () => {
		expect(billableSeconds('2026-10-26T12:39:57.481Z', '2026-10-26T12:40:30.041Z')).toBe(33);
		expect(startedMinutes(61)).toBe(2);
		expect(dayStart(new Date('2026-10-26T23:59:00-07:00'))).toBe('2026-10-27T00:00:00.000Z');
	});
});
