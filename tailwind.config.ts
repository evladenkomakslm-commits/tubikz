import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    // Override breakpoints — phones (even wide ones in landscape, Z Fold open,
    // tablets in portrait) should keep the single-pane mobile UI. Only true
    // tablets-in-landscape and laptops/desktops get the side-by-side layout.
    screens: {
      sm: '640px',
      md: '1024px', // raised from 768px so big phones don't trip into desktop UI
      lg: '1280px',
      xl: '1536px',
    },
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0a0a0b',
          subtle: '#111113',
          panel: '#16161a',
          elevated: '#1c1c22',
          hover: '#22222a',
        },
        border: {
          DEFAULT: '#26262e',
          subtle: '#1e1e26',
        },
        text: {
          DEFAULT: '#ededf0',
          muted: '#8a8a96',
          subtle: '#5a5a66',
        },
        // Accent colours read CSS variables so the user can pick a theme
        // at runtime — see lib/theme.ts. Stored as RGB triplets so the
        // standard `bg-accent/20` opacity syntax keeps working.
        accent: {
          DEFAULT: 'rgb(var(--accent-rgb) / <alpha-value>)',
          hover: 'rgb(var(--accent-hover-rgb) / <alpha-value>)',
          soft: 'rgb(var(--accent-rgb) / 0.125)',
        },
        success: '#3ecf8e',
        danger: '#ff5c5c',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Inter', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'typing': 'typing 1.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        typing: {
          '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '30%': { transform: 'translateY(-4px)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
