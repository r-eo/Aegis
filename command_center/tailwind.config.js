/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brutal: {
          dark: '#0f0f11',
          panel: '#1A1A1D',
          border: '#333333',
          green: '#22c55e',
          warning: '#eab308',
          critical: '#ef4444',
          text: '#eaeaea',
          muted: '#888888',
        }
      },
      fontFamily: {
        mono: ['"Courier New"', 'Courier', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
