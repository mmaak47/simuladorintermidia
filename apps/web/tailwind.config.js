/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#000000',
          1: '#0a0a0a',
          2: '#141414',
          3: '#1e1e1e',
        },
        accent: {
          DEFAULT: '#FE5C2B',
          hover: '#ff6c40',
          muted: 'rgba(254, 92, 43, 0.15)',
        },
      },
      fontFamily: {
        heading: ['Poppins', 'sans-serif'],
        body: ['Montserrat', 'sans-serif'],
      },
      fontSize: {
        h1: ['28px', { lineHeight: '1.2', fontWeight: '700' }],
        h2: ['22px', { lineHeight: '1.3', fontWeight: '600' }],
        body: ['14px', { lineHeight: '1.5' }],
        label: ['12px', { lineHeight: '1.4' }],
      },
      borderRadius: {
        panel: '14px',
      },
      boxShadow: {
        panel: '0px 10px 30px rgba(0, 0, 0, 0.4)',
        'panel-lg': '0px 16px 48px rgba(0, 0, 0, 0.5)',
      },
      backdropBlur: {
        panel: '16px',
      },
      transitionDuration: {
        DEFAULT: '180ms',
      },
      keyframes: {
        'impact-pulse': {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'impact-pulse': 'impact-pulse 0.4s ease-out',
      },
    },
  },
  plugins: [],
};
