import { create } from 'zustand';
import { createSupabaseClient } from '@/lib/supabase.js';
import { messages } from './messages.js';
import { keyManager } from '@/lib/crypto/key-manager.js';
import { keySyncService } from '@/lib/crypto/key-sync-service.js';

export const useAuthStore = create((set, get) => ({
  user: null,
  loading: true,

  async init() {
    if (typeof window === 'undefined') return;
    set({ loading: true });
    try {
      const storedUser = localStorage.getItem('qrypt_user');
      const storedSession = localStorage.getItem('qrypt_session');
      if (storedUser && storedSession) {
        const user = JSON.parse(storedUser);
        const session = JSON.parse(storedSession);
        if (session.access_token && session.expires_at) {
          const expiresAt = new Date(session.expires_at * 1000);
          if (expiresAt > new Date()) {
            set({ user, loading: false });
            setTimeout(async () => {
              try { await keySyncService.autoSyncOnLogin(); } catch {}
            }, 100);
            return;
          } else if (session.refresh_token) {
            const refreshResult = await get().refreshSession(session.refresh_token);
            if (refreshResult.success) {
              set({ user, loading: false });
              setTimeout(async () => {
                try { await keySyncService.autoSyncOnLogin(); } catch {}
              }, 100);
              return;
            }
          }
        }
        localStorage.removeItem('qrypt_user');
        localStorage.removeItem('qrypt_session');
      }
      set({ loading: false });
    } catch {
      localStorage.removeItem('qrypt_user');
      localStorage.removeItem('qrypt_session');
      set({ loading: false });
    }
  },

  async refreshSession(refreshToken) {
    try {
      const supabase = createSupabaseClient();
      const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) return { success: false, error: error?.message };
      if (typeof window !== 'undefined') {
        localStorage.setItem('qrypt_session', JSON.stringify(data.session));
      }
      return { success: true, session: data.session };
    } catch {
      return { success: false, error: 'Failed to refresh session' };
    }
  },

  async getCurrentSession() {
    if (typeof window === 'undefined') return { error: 'Not in browser' };
    try {
      const storedSession = localStorage.getItem('qrypt_session');
      if (!storedSession) return { error: 'No session found' };
      const session = JSON.parse(storedSession);
      if (session.access_token && session.expires_at) {
        if (new Date(session.expires_at * 1000) > new Date()) return { session };
        if (session.refresh_token) {
          const result = await get().refreshSession(session.refresh_token);
          if (result.success) return { session: result.session };
          return { error: 'Session expired and refresh failed' };
        }
      }
      return { error: 'Session expired' };
    } catch {
      return { error: 'Failed to get session' };
    }
  },

  async sendSMS(phoneNumber) {
    set({ loading: true });
    messages.clear();
    try {
      const headers = { 'Content-Type': 'application/json' };
      const sessionResult = await get().getCurrentSession();
      if (sessionResult.session?.access_token) {
        headers['Authorization'] = `Bearer ${sessionResult.session.access_token}`;
      }
      const response = await fetch('/api/auth/send-sms', {
        method: 'POST',
        headers,
        body: JSON.stringify({ phoneNumber }),
      });
      const data = await response.json();
      set({ loading: false });
      if (!response.ok) {
        messages.error(data.error || 'Failed to send SMS');
        return { success: false, error: data.error };
      }
      messages.success('Verification code sent successfully!');
      return { success: true };
    } catch {
      set({ loading: false });
      messages.error('Failed to send SMS. Please try again.');
      return { success: false, error: 'Failed to send SMS' };
    }
  },

  async verifySMS(phoneNumber, verificationCode, username, displayName) {
    set({ loading: true });
    messages.clear();
    try {
      const headers = { 'Content-Type': 'application/json' };
      const sessionResult = await get().getCurrentSession();
      if (sessionResult.session?.access_token) {
        headers['Authorization'] = `Bearer ${sessionResult.session.access_token}`;
      }
      const useSession = !!(sessionResult.session && username);
      const requestBody = { phoneNumber, verificationCode };
      if (useSession) {
        requestBody.username = username;
        requestBody.displayName = displayName;
        requestBody.useSession = true;
      }
      const response = await fetch('/api/auth/verify-sms', {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });
      const data = await response.json();
      if (data.requiresUsername) {
        if (data.session) localStorage.setItem('qrypt_session', JSON.stringify(data.session));
        set({ loading: false });
        return { success: false, requiresUsername: true, session: data.session, message: data.message };
      }
      if (!response.ok) {
        messages.error(data.error || 'Failed to verify code');
        set({ loading: false });
        return { success: false, error: data.error, session: data.session };
      }
      const { user, session, isNewUser } = data;
      localStorage.setItem('qrypt_user', JSON.stringify(user));
      if (session) localStorage.setItem('qrypt_session', JSON.stringify(session));
      if (isNewUser) messages.success('Account created! Welcome to QryptChat!');
      else messages.success('Welcome back!');
      set({ user, loading: false });
      setTimeout(async () => {
        try { await keySyncService.autoSyncOnLogin(); } catch {}
      }, 100);
      return { success: true, user, isNewUser, session };
    } catch {
      set({ loading: false });
      messages.error('Failed to verify code. Please try again.');
      return { success: false, error: 'Failed to verify code' };
    }
  },

  async logout() {
    set({ loading: true });
    try {
      const supabase = createSupabaseClient();
      await supabase.auth.signOut();
    } catch {}
    localStorage.removeItem('qrypt_user');
    localStorage.removeItem('qrypt_session');
    set({ user: null, loading: false });
  },

  clearMessages() {
    messages.clear();
  },

  updateUser(updates) {
    const { user } = get();
    if (!user) return;
    const updatedUser = { ...user, ...updates };
    localStorage.setItem('qrypt_user', JSON.stringify(updatedUser));
    set({ user: updatedUser });
  },
}));

// Initialize on client
if (typeof window !== 'undefined') {
  useAuthStore.getState().init();
}

// Legacy singleton compat for files that import `auth` directly
export const auth = {
  init: () => useAuthStore.getState().init(),
  sendSMS: (...args) => useAuthStore.getState().sendSMS(...args),
  verifySMS: (...args) => useAuthStore.getState().verifySMS(...args),
  logout: () => useAuthStore.getState().logout(),
  getCurrentSession: () => useAuthStore.getState().getCurrentSession(),
  refreshSession: (...args) => useAuthStore.getState().refreshSession(...args),
  updateUser: (...args) => useAuthStore.getState().updateUser(...args),
  clearMessages: () => useAuthStore.getState().clearMessages(),
};

// Legacy derived compat
export const user = { subscribe: (fn) => useAuthStore.subscribe((s) => fn(s.user)) };
export const isAuthenticated = { subscribe: (fn) => useAuthStore.subscribe((s) => fn(!!s.user)) };
export const isLoading = { subscribe: (fn) => useAuthStore.subscribe((s) => fn(s.loading)) };
