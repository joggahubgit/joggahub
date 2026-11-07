/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  // The web app is light-only; 'class' stops NativeWind from following the OS theme.
  darkMode: 'class',
  theme: {
    // Exact web (Tailwind v4) colours — see scripts/gen-palette.mjs.
    colors: require('./tailwind.palette.js'),
    // Type scale one step above the web's: the screens reuse the web's classes,
    // but web sizes read small on a phone. These match iOS text styles
    // (body 17, subheadline 15, footnote 13). [size, lineHeight]
    fontSize: {
      xs: ['13px', '18px'],
      sm: ['15px', '20px'],
      base: ['17px', '24px'],
      lg: ['19px', '26px'],
      xl: ['21px', '28px'],
      '2xl': ['25px', '32px'],
      '3xl': ['31px', '38px'],
      '4xl': ['37px', '42px'],
      '5xl': ['49px', '52px'],
    },
    extend: {
      fontFamily: {
        sans: ['Inter_400Regular'],
      },
    },
  },
  plugins: [],
};
