const isVitest = !!process.env.VITEST;
const config = {
  plugins: isVitest ? [] : [require("@tailwindcss/postcss")],
};

export default config;
