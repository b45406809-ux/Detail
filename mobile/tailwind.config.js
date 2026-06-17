/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./context/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        accent: "#3906d2",
        "accent-dark": "#27049c",
        "brand-lime": "#3906d2",
        "bg-dark": "#12121A",
        "card-dark": "#1E1E2A",
        "border-dark": "#2A2A3A",
      },
      fontFamily: {
        sans: ["PublicSans_400Regular"],
        "sans-medium": ["PublicSans_500Medium"],
        "sans-bold": ["PublicSans_700Bold"],
        "sans-black": ["PublicSans_900Black"],
        display: ["PublicSans_900Black"],
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.5rem",
      },
    },
  },
  plugins: [],
};
