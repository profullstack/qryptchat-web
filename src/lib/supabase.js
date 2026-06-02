import { createBrowserClient, createServerClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function createSupabaseClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });
}

export async function createSupabaseServerClient() {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {}
      },
    },
  });
}

export async function createSupabaseServerClientWithToken(token) {
  const client = await createSupabaseServerClient();
  if (token) {
    await client.auth.setSession({ access_token: token, refresh_token: '' });
  }
  return client;
}

export class SupabaseHelpers {
  constructor(supabase) {
    this.supabase = supabase;
  }

  async getUserProfile(userId) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  }

  async updateUserProfile(userId, updates) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select()
        .single();
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  }

  async getUserConversations(userId) {
    try {
      const { data, error } = await this.supabase.rpc('get_user_conversations', {
        user_uuid: userId,
      });
      return { data: data || [], error };
    } catch (error) {
      return { data: [], error };
    }
  }

  async sendMessage(messageData) {
    try {
      const { data, error } = await this.supabase
        .from('messages')
        .insert([messageData])
        .select()
        .single();
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  }

  async getMessages(conversationId, limit = 50, before = null) {
    try {
      let query = this.supabase
        .from('messages')
        .select(`*, sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url), reply_to:messages!messages_reply_to_id_fkey(id, encrypted_content, sender_id)`)
        .eq('conversation_id', conversationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (before) {
        const { data: beforeMessage } = await this.supabase
          .from('messages')
          .select('created_at')
          .eq('id', before)
          .single();
        if (beforeMessage) {
          query = query.lt('created_at', beforeMessage.created_at);
        }
      }

      const { data, error } = await query;
      return { data: data || [], error };
    } catch (error) {
      return { data: [], error };
    }
  }

  subscribeToConversation(conversationId, callbacks = {}) {
    return this.supabase
      .channel(`conversation:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => callbacks.onNewMessage?.(payload.new)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'typing_indicators', filter: `conversation_id=eq.${conversationId}` },
        (payload) => callbacks.onTypingChange?.(payload.new)
      )
      .subscribe();
  }
}

export const supabase = typeof window !== 'undefined' ? createSupabaseClient() : null;
export const supabaseHelpers = supabase ? new SupabaseHelpers(supabase) : null;
