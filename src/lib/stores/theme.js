import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Theme configuration
export const themes = {
	light: {
		name: 'Light',
		colors: {
			// Background colors
			'bg-primary': '#ffffff',
			'bg-secondary': '#f8fafc',
			'bg-tertiary': '#f1f5f9',
			'bg-accent': '#e2e8f0',
			
			// Text colors
			'text-primary': '#0f172a',
			'text-secondary': '#475569',
			'text-tertiary': '#64748b',
			'text-muted': '#94a3b8',
			
			// Border colors
			'border-primary': '#e2e8f0',
			'border-secondary': '#cbd5e1',
			
			// Brand colors
			'brand-primary': '#6366f1',
			'brand-secondary': '#8b5cf6',
			'brand-accent': '#06b6d4',
			
			// Status colors
			'success': '#10b981',
			'warning': '#f59e0b',
			'error': '#ef4444',
			'info': '#3b82f6'
		}
	},
	dark: {
		name: 'Dark',
		colors: {
			// Background colors
			'bg-primary': '#0f172a',
			'bg-secondary': '#1e293b',
			'bg-tertiary': '#334155',
			'bg-accent': '#475569',
			
			// Text colors
			'text-primary': '#f8fafc',
			'text-secondary': '#e2e8f0',
			'text-tertiary': '#cbd5e1',
			'text-muted': '#94a3b8',
			
			// Border colors
			'border-primary': '#334155',
			'border-secondary': '#475569',
			
			// Brand colors
			'brand-primary': '#818cf8',
			'brand-secondary': '#a78bfa',
			'brand-accent': '#22d3ee',
			
			// Status colors
			'success': '#34d399',
			'warning': '#fbbf24',
			'error': '#f87171',
			'info': '#60a5fa'
		}
	}
};

// Get initial theme from localStorage or system preference
function getInitialTheme() {
	if (!browser) return 'light';
	
	const stored = localStorage.getItem('qrypt-theme');
	if (stored && Object.prototype.hasOwnProperty.call(themes, stored)) {
		return stored;
	}
	
	// Check system preference
	if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
		return 'dark';
	}
	
	return 'light';
}

// Create theme store
export const currentTheme = writable(getInitialTheme());

// Theme utilities
export const themeUtils = {
	/**
	 * Set the current theme
	 * @param {string} themeName - Theme name ('light' or 'dark')
	 */
	setTheme(themeName) {
		if (!Object.prototype.hasOwnProperty.call(themes, themeName)) {
			console.warn(`Theme "${themeName}" not found`);
			return;
		}
		
		currentTheme.set(themeName);
		
		if (browser) {
			localStorage.setItem('qrypt-theme', themeName);
			this.applyTheme(themeName);
		}
	},
	
	/**
	 * Toggle between light and dark themes
	 */
	toggleTheme() {
		currentTheme.update(current => {
			const newTheme = current === 'light' ? 'dark' : 'light';
			if (browser) {
				localStorage.setItem('qrypt-theme', newTheme);
				this.applyTheme(newTheme);
			}
			return newTheme;
		});
	},
	
	/**
	 * Apply theme CSS custom properties to document root
	 * @param {string} themeName - Theme name
	 */
	applyTheme(themeName) {
		if (!browser || !Object.prototype.hasOwnProperty.call(themes, themeName)) return;
		
		const theme = themes[themeName];
		const root = document.documentElement;
		
		// Apply CSS custom properties with both prefixed and non-prefixed versions for compatibility
		Object.entries(theme.colors).forEach(([key, value]) => {
			root.style.setProperty(`--color-${key}`, value);
			root.style.setProperty(`--${key}`, value);
		});
		
		// Set data attribute for CSS selectors
		root.setAttribute('data-theme', themeName);
	},
	
	/**
	 * Get current theme colors
	 * @param {string} currentThemeName - Current theme name
	 * @returns {object} Theme colors
	 */
	getThemeColors(currentThemeName) {
		if (currentThemeName === 'light') return themes.light.colors;
		if (currentThemeName === 'dark') return themes.dark.colors;
		return themes.light.colors;
	}
};

// Initialize theme on client side
if (browser) {
	const initialTheme = getInitialTheme();
	themeUtils.applyTheme(initialTheme);
	
	// Listen for system theme changes
	const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
	mediaQuery.addEventListener('change', (e) => {
		// Only auto-switch if no theme is stored in localStorage
		if (!localStorage.getItem('qrypt-theme')) {
			const newTheme = e.matches ? 'dark' : 'light';
			currentTheme.set(newTheme);
			themeUtils.applyTheme(newTheme);
		}
	});
}