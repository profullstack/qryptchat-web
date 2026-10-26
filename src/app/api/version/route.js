import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/version: the build this server is running. The app compares it with
 * the build it was loaded from (src/lib/app-update.js) to notice a deploy.
 */
export function GET() {
	return NextResponse.json({ buildId: process.env.NEXT_PUBLIC_BUILD_ID || null }, { headers: { 'Cache-Control': 'no-store' } });
}
