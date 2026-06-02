import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock browser environment
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
});

// Mock fetch globally
global.fetch = vi.fn();

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [],
    get: () => null,
    set: vi.fn(),
  }),
}));

const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.getItem.mockClear();
  window.localStorage.setItem.mockClear();
  window.localStorage.removeItem.mockClear();
  window.localStorage.clear.mockClear();
  global.fetch.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

export const mockApiSuccess = (data) => {
  global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => data });
};

export const mockApiError = (error, status = 500) => {
  global.fetch.mockResolvedValueOnce({ ok: false, status, json: async () => ({ error }) });
};

export const mockNetworkError = () => {
  global.fetch.mockRejectedValueOnce(new Error('Network error'));
};

export const suppressConsole = () => {
  console.error = vi.fn();
  console.warn = vi.fn();
  console.log = vi.fn();
};

export const restoreConsole = () => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.log = originalConsoleLog;
};
