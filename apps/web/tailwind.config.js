/** @type {import('tailwindcss').Config} */
export default {
  content: {
    relative: true,
    files: [
      './index.html',
      './App.tsx',
      './index.tsx',
      './components/**/*.{js,ts,jsx,tsx}',
      './contexts/**/*.{js,ts,jsx,tsx}',
      './features/**/*.{js,ts,jsx,tsx}',
      './hooks/**/*.{js,ts,jsx,tsx}',
      './pages/**/*.{js,ts,jsx,tsx}',
    ],
  },
  theme: {
    extend: {
      colors: {
        // ProInspect brand palette, derived from the logo mark:
        // navy roofline + dark clipboard/ink + teal magnifier accent.
        brand: {
          50: '#f5f6f8',
          100: '#e6e9ee',
          200: '#c8cfda',
          300: '#a0adbf',
          400: '#687d9a',
          500: '#314d74',
          600: '#042656',
          700: '#032048',
          800: '#031b3c',
          900: '#02152e',
          950: '#020f22',
        },
        accent: {
          50: '#f6fafb',
          100: '#e9f3f4',
          200: '#cee5e7',
          300: '#aad2d6',
          400: '#79b8be',
          500: '#489ea6',
          600: '#208992',
          700: '#1b737b',
          800: '#166066',
          900: '#114a4f',
          950: '#0d373a',
        },
        ink: {
          50: '#f4f5f6',
          100: '#e7e9eb',
          200: '#c6cbcf',
          300: '#9ba3aa',
          400: '#5f6a72',
          500: '#3a444b',
          600: '#28323a',
          700: '#20292c',
          800: '#1a2226',
          900: '#141a1d',
          950: '#0d1113',
        },
      },
    },
  },
  plugins: [],
};
