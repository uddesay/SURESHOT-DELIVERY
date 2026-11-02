/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // Admin theming is driven by CSS variables on [data-theme]; no `dark:` variants needed.
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Segoe UI Variable Text"', '"Segoe UI"', 'Inter', 'system-ui', '-apple-system', 'Roboto', 'Arial', 'sans-serif'],
        display: ['"Segoe UI Variable Display"', '"Segoe UI"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"Cascadia Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        canvas: token('canvas'),
        surface: { DEFAULT: token('surface'), 2: token('surface-2'), 3: token('surface-3') },
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        ink: { DEFAULT: token('ink'), 2: token('ink-2') },
        muted: token('muted'),
        faint: token('faint'),
        brand: { DEFAULT: token('brand'), hover: token('brand-hover'), ink: token('brand-ink'), soft: token('brand-soft') },
        accent: { DEFAULT: token('accent'), ink: token('accent-ink') },
        sage: token('sage'),
        success: { DEFAULT: token('success'), soft: token('success-soft') },
        warning: { DEFAULT: token('warning'), soft: token('warning-soft') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft') },
        info: { DEFAULT: token('info'), soft: token('info-soft') },
        violet: { DEFAULT: token('violet'), soft: token('violet-soft') },
        // Legacy palette kept for the customer storefront bundle.
        primary: {
          50: '#e5eaf3', 100: '#c7d2e8', 200: '#9cafd4', 300: '#7b91bd', 400: '#5e74a0',
          500: '#485878', 600: '#2f3645', 700: '#262d3a', 800: '#1e2531', 900: '#161a24',
        },
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--c-shadow) / 0.04)',
        pop: '0 12px 32px -8px rgb(var(--c-shadow) / 0.18), 0 2px 6px rgb(var(--c-shadow) / 0.06)',
        drawer: '-16px 0 40px -12px rgb(var(--c-shadow) / 0.22)',
      },
      borderRadius: { xl: '0.75rem', '2xl': '1rem' },
      transitionDuration: { DEFAULT: '180ms' },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'pop-in': { from: { opacity: 0, transform: 'translateY(4px) scale(.98)' }, to: { opacity: 1, transform: 'none' } },
        'slide-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        'slide-up': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'pop-in': 'pop-in 180ms cubic-bezier(.2,.8,.2,1)',
        'slide-in': 'slide-in 220ms cubic-bezier(.2,.8,.2,1)',
        'slide-up': 'slide-up 200ms cubic-bezier(.2,.8,.2,1)',
      },
    },
  },
  plugins: [],
};
