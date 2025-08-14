/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Custom color variables for the design system
        'bg-primary': 'rgb(var(--bg-primary))',
        'bg-secondary': 'rgb(var(--bg-secondary))',
        'bg-tertiary': 'rgb(var(--bg-tertiary))',
        'fg-primary': 'rgb(var(--fg-primary))',
        'fg-secondary': 'rgb(var(--fg-secondary))',
        'fg-tertiary': 'rgb(var(--fg-tertiary))',
        'accent-primary': 'rgb(var(--accent-primary))',
        'accent-secondary': 'rgb(var(--accent-secondary))',
        'border-primary': 'rgb(var(--border-primary))',
        'border-secondary': 'rgb(var(--border-secondary))',
      },
      fontFamily: {
        'inter': ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'xl': '16px',
        '2xl': '20px',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      animation: {
        'pulse-slow': 'pulse 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

