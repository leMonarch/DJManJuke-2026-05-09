/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#8B5CF6',
        secondary: '#22D3EE',
        accent: '#FBBF24',
        dark: '#0F172A',
      },
    },
  },
  plugins: [],
};


