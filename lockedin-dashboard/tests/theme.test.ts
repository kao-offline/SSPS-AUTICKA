import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';
import { resolveTheme, themeInitScript } from '../src/lib/theme';

test.each([
  ['dark', true, 'dark'],
  ['light', false, 'light'],
  [null, true, 'light'],
  [null, false, 'dark'],
  ['invalid', false, 'dark'],
] as const)('saved %s with system light=%s selects %s before paint and after hydration', (saved, systemLight, expected) => {
  const classes = new Set<string>();
  const root = {
    dataset: {} as Record<string, string>,
    style: {} as Record<string, string>,
    classList: { toggle: (name: string, enabled: boolean) => enabled ? classes.add(name) : classes.delete(name) },
  };
  runInNewContext(themeInitScript, {
    localStorage: { getItem: () => saved },
    matchMedia: () => ({ matches: systemLight }),
    document: { documentElement: root },
  });
  expect(resolveTheme(saved, systemLight)).toBe(expected);
  expect(root.dataset.theme).toBe(expected);
  expect(root.style.colorScheme).toBe(expected);
  expect(classes).toEqual(new Set([expected]));
});
