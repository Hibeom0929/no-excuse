/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F7F5F0',
        ink: '#1B1B1F',
        campus: '#1F3D2B',
        campusLight: '#2F5940',
        gold: '#D9A441',
        stamp: '#C0392B',
        line: '#E3DECF',
      },
      fontFamily: {
        display: ['"Noto Sans KR"', 'sans-serif'],
        body: ['"Noto Sans KR"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 rgba(27,27,31,0.06), 0 8px 24px -12px rgba(27,27,31,0.18)',
      },
    },
  },
  plugins: [],
}
