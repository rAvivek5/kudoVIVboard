import type { Config } from 'tailwindcss';

/**
 * Tokens live in src/index.css as CSS variables so that dark mode is a single
 * class flip. Tailwind just references them.
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'rgb(var(--ink) / <alpha-value>)',
        paper: 'rgb(var(--paper) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        hype: 'rgb(var(--hype) / <alpha-value>)',
        zap: 'rgb(var(--zap) / <alpha-value>)',
        aqua: 'rgb(var(--aqua) / <alpha-value>)',
        violet: 'rgb(var(--violet) / <alpha-value>)',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Instrument Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { xl: '14px', '2xl': '20px', '3xl': '28px' },
      boxShadow: {
        pop: '4px 4px 0 rgb(var(--ink))',
        'pop-lg': '7px 7px 0 rgb(var(--ink))',
        'pop-sm': '2px 2px 0 rgb(var(--ink))',
      },
      keyframes: {
        'pop-in': {
          '0%': { opacity: '0', transform: 'translateY(10px) scale(.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        wobble: {
          '0%,100%': { transform: 'rotate(-1.5deg)' },
          '50%': { transform: 'rotate(1.5deg)' },
        },
      },
      animation: {
        'pop-in': 'pop-in .28s cubic-bezier(.2,.9,.3,1.3) both',
        shimmer: 'shimmer 1.6s infinite',
        wobble: 'wobble 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
