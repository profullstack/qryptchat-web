import { describe, it, expect, beforeEach } from 'vitest';
import { useThemeStore, themeUtils, themes } from '../../src/lib/stores/theme.js';

describe('Theme Store (Zustand)', () => {
  beforeEach(() => {
    useThemeStore.setState({ currentTheme: 'light' });
    window.localStorage.getItem.mockReturnValue(null);
  });

  it('has light and dark themes', () => {
    expect(themes.light).toBeDefined();
    expect(themes.dark).toBeDefined();
  });

  it('starts with light theme by default', () => {
    expect(useThemeStore.getState().currentTheme).toBe('light');
  });

  it('switches to dark theme', () => {
    themeUtils.setTheme('dark');
    expect(useThemeStore.getState().currentTheme).toBe('dark');
  });

  it('applies theme CSS vars to document', () => {
    const spy = vi.spyOn(document.documentElement.style, 'setProperty').mockImplementation(() => {});
    themeUtils.applyTheme('dark');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('toggles between light and dark', () => {
    useThemeStore.setState({ currentTheme: 'light' });
    themeUtils.toggleTheme();
    expect(useThemeStore.getState().currentTheme).toBe('dark');
    themeUtils.toggleTheme();
    expect(useThemeStore.getState().currentTheme).toBe('light');
  });
});
