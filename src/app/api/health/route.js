import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/service-role.js';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

/**
 * Health check for status.profullstack.com: one cheap PostgREST HEAD query,
 * capped at 3s. Never echoes the error, so nothing about the setup leaks.
 */
export async function GET() {
	try {
		const { error } = await getServiceRoleClient()
			.from('users')
			.select('id', { head: true })
			.limit(1)
			.abortSignal(AbortSignal.timeout(3000));
		if (error) throw error;
		return NextResponse.json({ status: 'ok', db: 'ok' }, { headers });
	} catch {
		return NextResponse.json({ status: 'error', db: 'down' }, { status: 503, headers });
	}
}
