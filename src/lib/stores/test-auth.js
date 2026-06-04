// Test authentication store for development/testing purposes

const mockUser = {
  id: 'test-user-123',
  username: 'testuser',
  displayName: 'Test User',
  phone: '+15551234567',
  avatarUrl: null,
  createdAt: new Date().toISOString(),
};

let _user = null;
let _authenticated = false;
const _subs = new Set();

function notify() {
  _subs.forEach((fn) => fn({ user: _user, isAuthenticated: _authenticated }));
}

export const testUserStore = {
  subscribe(fn) {
    _subs.add(fn);
    fn({ user: _user, isAuthenticated: _authenticated });
    return () => _subs.delete(fn);
  },
};

export const testAuth = {
  async login() {
    _user = mockUser;
    _authenticated = true;
    notify();
    return { success: true };
  },
  async logout() {
    _user = null;
    _authenticated = false;
    notify();
    return { success: true };
  },
  async initialize() {
    _user = mockUser;
    _authenticated = true;
    notify();
  },
};
