'use client';

import { useSyncExternalStore } from 'react';
import { resolveTheme, type Theme } from './theme';

let sessionTheme: Theme | null = null;

function getTheme(): Theme {
  let saved = sessionTheme;
  try { saved = localStorage.getItem('dashboard-theme') as Theme | null ?? saved; } catch {}
  return resolveTheme(saved, window.matchMedia('(prefers-color-scheme: light)').matches);
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
  root.style.colorScheme = theme;
  // Existing installed plugins may still depend on this class.
  document.body.classList.toggle('light-mode', theme === 'light');
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: light)');
  const update = () => { applyTheme(getTheme()); onChange(); };
  const onStorage = (event: StorageEvent) => {
    if (event.key === 'dashboard-theme' || event.key === null) {
      sessionTheme = null;
      update();
    }
  };
  update();
  window.addEventListener('storage', onStorage);
  window.addEventListener('dashboard-theme-change', update);
  media.addEventListener('change', update);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('dashboard-theme-change', update);
    media.removeEventListener('change', update);
  };
}

export function setTheme(theme: Theme) {
  sessionTheme = theme;
  try { localStorage.setItem('dashboard-theme', theme); } catch {}
  applyTheme(theme);
  window.dispatchEvent(new Event('dashboard-theme-change'));
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'dark' as const);
  return { theme, toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}
