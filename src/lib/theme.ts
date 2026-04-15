import { getSetting, setSetting } from './db';

export type ThemeName = 'dark' | 'light' | 'nord' | 'dracula' | 'solarized-dark' | 'solarized-light' | 'monokai' | 'github';
export type AccentColor = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'teal';

export const THEMES: { id: ThemeName; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'nord', label: 'Nord' },
  { id: 'dracula', label: 'Dracula' },
  { id: 'solarized-dark', label: 'Solarized Dark' },
  { id: 'solarized-light', label: 'Solarized Light' },
  { id: 'monokai', label: 'Monokai' },
  { id: 'github', label: 'GitHub' },
];

export const ACCENTS: { id: AccentColor; label: string; color: string }[] = [
  { id: 'blue', label: 'Blue', color: '#4d78ff' },
  { id: 'purple', label: 'Purple', color: '#8b5cf6' },
  { id: 'green', label: 'Green', color: '#22c55e' },
  { id: 'orange', label: 'Orange', color: '#f97316' },
  { id: 'pink', label: 'Pink', color: '#ec4899' },
  { id: 'teal', label: 'Teal', color: '#14b8a6' },
];

let currentTheme: ThemeName = 'dark';
let currentAccent: AccentColor = 'blue';

export function applyTheme(theme: ThemeName): void {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
}

export function applyAccent(accent: AccentColor): void {
  currentAccent = accent;
  if (accent === 'blue') {
    document.documentElement.removeAttribute('data-accent');
  } else {
    document.documentElement.setAttribute('data-accent', accent);
  }
}

export function getTheme(): ThemeName { return currentTheme; }
export function getAccent(): AccentColor { return currentAccent; }

export async function loadThemeFromSettings(): Promise<void> {
  const themePref = await getSetting('theme');
  const accentPref = await getSetting('accent');

  // Check system preference for auto
  if (!themePref || themePref === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  } else {
    applyTheme(themePref as ThemeName);
  }

  applyAccent((accentPref as AccentColor) || 'blue');
}

export async function saveTheme(theme: ThemeName): Promise<void> {
  applyTheme(theme);
  await setSetting('theme', theme);
}

export async function saveAccent(accent: AccentColor): Promise<void> {
  applyAccent(accent);
  await setSetting('accent', accent);
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async (e) => {
  const themePref = await getSetting('theme');
  if (!themePref || themePref === 'auto') {
    applyTheme(e.matches ? 'dark' : 'light');
  }
});
