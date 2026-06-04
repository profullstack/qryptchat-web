import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase.js';


export async function GET(request, { params } = {}) {
	try {
		const supabase = await createSupabaseServerClient();
		const { data: { session }, error } = await supabase.auth.getSession();
		
		if (error) {
			return NextResponse.json({ error: error.message }, { status: 401 });
		}
		
		return NextResponse.json({ session });
	} catch (error) {
		console.error('Auth session API error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}