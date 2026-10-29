/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  // The web app is light-only; 'class' stops NativeWind from following the OS theme.
  darkMode: 'class',
  theme: {
    // Exact web (Tailwind v4) colours — see scripts/gen-palette.mjs.
    colors: require('./tailwind.palette.js'),
    extend: {
      fontFamily: {
        sans: ['Inter_400Regular'],
      },
    },
  },
  plugins: [],
};
