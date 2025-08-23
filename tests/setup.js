/**
 * @fileoverview Test setup configuration for Vitest
 * Sets up global test environment, mocks, and utilities
 */

import '@testing-library/jest-dom';
import { vi } from 'vitest';

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

// Mock SvelteKit environment
vi.mock('$app/environment', () => ({
	browser: true,
	dev: true,
}));

// Mock SvelteKit stores
vi.mock('$app/stores', () => ({
	page: {
		subscribe: vi.fn(),
	},
	navigating: {
		subscribe: vi.fn(),
	},
}));

// Setup console mocking for cleaner test output
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

beforeEach(() => {
	// Reset all mocks before each test
	vi.clearAllMocks();
	
	// Reset localStorage mock
	window.localStorage.getItem.mockClear();
	window.localStorage.setItem.mockClear();
	window.localStorage.removeItem.mockClear();
	window.localStorage.clear.mockClear();
	
	// Reset fetch mock
	global.fetch.mockClear();
});

afterEach(() => {
	// Clean up after each test
	vi.restoreAllMocks();
});

// Helper function to mock successful API responses
export const mockApiSuccess = (data) => {
	global.fetch.mockResolvedValueOnce({
		ok: true,
		status: 200,
		json: async () => data,
	});
};

// Helper function to mock API errors
export const mockApiError = (error, status = 500) => {
	global.fetch.mockResolvedValueOnce({
		ok: false,
		status,
		json: async () => ({ error }),
	});
};

// Helper function to mock network errors
export const mockNetworkError = () => {
	global.fetch.mockRejectedValueOnce(new Error('Network error'));
};

// Helper to suppress console output during tests
export const suppressConsole = () => {
	console.error = vi.fn();
	console.warn = vi.fn();
	console.log = vi.fn();
};

// Helper to restore console output
export const restoreConsole = () => {
	console.error = originalConsoleError;
	console.warn = originalConsoleWarn;
	console.log = originalConsoleLog;
};