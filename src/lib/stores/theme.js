import { create } from 'zustand';

export const themes = {
  light: {
    name: 'Light',
    colors: {
      'bg-primary': '#ffffff',
      'bg-secondary': '#f8fafc',
      'bg-tertiary': '#f1f5f9',
      'bg-accent': '#e2e8f0',
      'text-primary': '#0f172a',
      'text-secondary': '#475569',
      'text-tertiary': '#64748b',
      'text-muted': '#94a3b8',
      'border-primary': '#e2e8f0',
      'border-secondary': '#cbd5e1',
      'brand-primary': '#6366f1',
      'brand-secondary': '#8b5cf6',
      'brand-accent': '#06b6d4',
      'success': '#10b981',
      'warning': '#f59e0b',
      'error': '#ef4444',
      'info': '#3b82f6',
    },
  },
  dark: {
    name: 'Dark',
    colors: {
      'bg-primary': '#0f172a',
      'bg-secondary': '#1e293b',
      'bg-tertiary': '#334155',
      'bg-accent': '#475569',
      'text-primary': '#f8fafc',
      'text-secondary': '#e2e8f0',
      'text-tertiary': '#cbd5e1',
      'text-muted': '#94a3b8',
      'border-primary': '#334155',
      'border-secondary': '#475569',
      'brand-primary': '#818cf8',
      'brand-secondary': '#a78bfa',
      'brand-accent': '#22d3ee',
      'success': '#34d399',
      'warning': '#fbbf24',
      'error': '#f87171',
      'info': '#60a5fa',
    },
  },
};

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('qrypt-theme');
  if (stored && themes[stored]) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const themeUtils = {
  applyTheme(themeName) {
    if (typeof window === 'undefined' || !themes[themeName]) return;
    const theme = themes[themeName];
    const root = document.documentElement;
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
      root.style.setProperty(`--${key}`, value);
    });
    root.setAttribute('data-theme', themeName);
  },

  setTheme(themeName) {
    if (!themes[themeName]) return;
    useThemeStore.setState({ currentTheme: themeName });
    if (typeof window !== 'undefined') {
      localStorage.setItem('qrypt-theme', themeName);
      this.applyTheme(themeName);
    }
  },

  toggleTheme() {
    const current = useThemeStore.getState().currentTheme;
    const next = current === 'light' ? 'dark' : 'light';
    this.setTheme(next);
  },
};

// Always start with 'light' so server and client initial renders match.
// ClientLayout's useEffect applies the stored/preferred theme after mount.
export const useThemeStore = create(() => ({
  currentTheme: 'light',
}));
