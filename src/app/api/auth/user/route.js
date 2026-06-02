import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase.js';


export async function GET(request, { params } = {}) {
	try {
		const supabase = createSupabaseServerClient();
		const { data: { user }, error } = await supabase.auth.getUser();
		
		if (error) {
			return NextResponse.json({ error: error.message }, { status: 401 });
		}
		
		return NextResponse.json({ user });
	} catch (error) {
		console.error('Auth user API error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}