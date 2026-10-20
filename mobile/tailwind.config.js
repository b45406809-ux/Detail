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
        // Brand — sampled directly from the Detail logo (#3906D1)
        accent: "#3906D2",
        "accent-dark": "#27049C",
        "accent-light": "#6B4FF0",
        brand: {
          50: "#F0EDFE",
          100: "#DDD5FD",
          200: "#BCAAFB",
          300: "#9580F7",
          400: "#7357F2",
          500: "#3906D2",
          600: "#2F05B0",
          700: "#27049C",
          800: "#1E0378",
          900: "#150256",
        },
        "brand-lime": "#3906d2",
        ink: "#0F0B2E",
        "bg-dark": "#0D0A24",
        "card-dark": "#17133A",
        "border-dark": "#2A2456",
        success: "#0FB77A",
        warning: "#F5A524",
        danger: "#E5484D",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(57, 6, 210, 0.15)",
      },
      fontFamily: {
        sans: ["DMSans_400Regular"],
        "sans-medium": ["DMSans_500Medium"],
        "sans-bold": ["DMSans_700Bold"],
        "sans-black": ["DMSans_700Bold"],
        display: ["Manrope_800ExtraBold"],
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.5rem",
      },
    },
  },
  plugins: [],
};
