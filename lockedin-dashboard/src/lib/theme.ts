export type Theme = 'dark' | 'light';

export function resolveTheme(saved: string | null, prefersLight: boolean): Theme {
  return saved === 'light' || saved === 'dark' ? saved : prefersLight ? 'light' : 'dark';
}

// Runs before the first paint, so CSS and HeroUI always use the same theme.
export const themeInitScript = `(() => {
  let saved;
  try { saved = localStorage.getItem('dashboard-theme'); } catch {}
  const theme = saved === 'light' || saved === 'dark' ? saved : matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
})();`;
