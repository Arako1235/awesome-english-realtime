import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#fbf4e8",
        ink: "#2d2a26",
        run: "#4f83a6",
        grow: "#3d9b72",
        build: "#8065b3",
        idea: "#d9932e"
      },
      boxShadow: {
        soft: "0 16px 40px rgba(60, 48, 38, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
