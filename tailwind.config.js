/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        cream: {
          50: "#FAF7F2",
          100: "#F5F0EA", // Primary warm cream requested
          200: "#EDE7DF",
          300: "#E3DBD1",
          400: "#D3C8BA",
        },
        charcoal: {
          750: "#362F2B",
          800: "#2B2420", // Requested assistant message bubble
          850: "#1C1714",
          900: "#161311",
          950: "#0F0D0C", // Dark left sidebar
        },
        warmtaupe: {
          base: "#C7BEB5", // Soft warm taupe/mauve outer shell
          subtle: "#DDD6CE",
          dark: "#8D8278",
          mauve: "#B8ACA3",
        },
        warmorange: {
          50: "#FFF7ED",
          100: "#FFEDD5",
          400: "#FB923C",
          500: "#F97316",
          600: "#EA580C",
        },
      },
      fontFamily: {
        serif: ["var(--font-fraunces)", "Fraunces", "Georgia", "Cambria", "Times New Roman", "serif"],
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};
