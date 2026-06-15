/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0a0c10',
          900: '#0e1117',
          850: '#141821',
          800: '#1a1f2b',
          700: '#252b3a',
          600: '#323a4d'
        },
        glass: {
          accent: '#7c9cff',
          accent2: '#5ee0c0',
          warm: '#ffb86b',
          add: '#2ea043',
          del: '#f85149'
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'pulse-trace': { '0%,100%': { opacity: '0.35' }, '50%': { opacity: '1' } }
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'pulse-trace': 'pulse-trace 1.4s ease-in-out infinite'
      }
    }
  },
  plugins: []
}
