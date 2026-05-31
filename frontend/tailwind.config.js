/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './context/**/*.{js,jsx,ts,tsx}',
    './hooks/**/*.{js,jsx,ts,tsx}',
    './lib/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        tiktok: '#fe2c55',
        shopee: '#ee4d2d',
        sidebar: '#0f172a',
        brand: '#0026CC',
        brandHover: '#0020A8',
        brandAccent: '#4D8EFF',
      },
    },
  },
  plugins: [],
};
