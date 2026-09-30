import type { Config } from 'tailwindcss';
import { heroui } from '@heroui/react';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  darkMode: 'class',
  plugins: [
    heroui({
      themes: {
        light: {
          colors: {
            primary: { DEFAULT: '#255cca', foreground: '#ffffff' },
            secondary: { DEFAULT: '#255cca', foreground: '#ffffff' },
            background: '#f3f6fb',
            foreground: '#17283f',
            content1: '#ffffff',
            content2: '#f3f6fb',
            content3: '#edf2f8',
            content4: '#d6dfeb',
            divider: '#d6dfeb',
            focus: '#255cca',
            default: {
              50: '#f6f8fc', 100: '#edf2f8', 200: '#d6dfeb', 300: '#bac9dc',
              400: '#546780', 500: '#465a74', 600: '#354966', 700: '#253955',
              800: '#1b2e47', 900: '#122238', DEFAULT: '#d6dfeb', foreground: '#17283f',
            },
            success: { DEFAULT: '#176f42', foreground: '#ffffff' },
            warning: { DEFAULT: '#8a560a', foreground: '#ffffff' },
            danger: { DEFAULT: '#b82439', foreground: '#ffffff' },
          },
        },
        dark: {
          colors: {
            primary: { DEFAULT: '#8bb6ff', foreground: '#0d1a30' },
            secondary: { DEFAULT: '#8bb6ff', foreground: '#0d1a30' },
            background: '#0a1221',
            foreground: '#f1f5fc',
            content1: '#111e32',
            content2: '#19283e',
            content3: '#22344e',
            content4: '#2a3b53',
            divider: '#2a3b53',
            focus: '#8bb6ff',
            default: {
              50: '#111e32', 100: '#19283e', 200: '#2a3b53', 300: '#415570',
              400: '#a8b8cf', 500: '#a8b8cf', 600: '#c1cede', 700: '#d5dfec',
              800: '#e3eaf5', 900: '#f1f5fc', DEFAULT: '#2a3b53', foreground: '#f1f5fc',
            },
            success: { DEFAULT: '#86e2b4', foreground: '#0d1a30' },
            warning: { DEFAULT: '#f3c873', foreground: '#0d1a30' },
            danger: { DEFAULT: '#ff91a1', foreground: '#0d1a30' },
          },
        },
      },
    }),
  ],
};
export default config;
