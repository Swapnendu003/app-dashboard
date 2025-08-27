/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      gridTemplateColumns: {
        '53': 'repeat(53, minmax(0, 1fr))',
      },
      keyframes: {
        'slide-down': {
          '0%': { transform: 'translateY(-100%) translateX(-50%)', opacity: 0 },
          '100%': { transform: 'translateY(0) translateX(-50%)', opacity: 1 },
        },
      },
      animation: {
        'slide-down': 'slide-down 0.3s ease-out forwards',
      },
    },
  },
  plugins: [],
}
