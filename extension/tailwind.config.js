/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: '#060a14',
        cyber: {
          DEFAULT: '#00e5a0',
          dim: '#00b37d',
          soft: 'rgba(0,229,160,0.06)',
          glow: 'rgba(0,229,160,0.15)',
        },
        amber: {
          DEFAULT: '#ffb347',
          dim: '#e09830',
          soft: 'rgba(255,179,71,0.06)',
          glow: 'rgba(255,179,71,0.15)',
        },
      },
      fontFamily: {
        sans: ['Bricolage Grotesque', 'DM Sans', 'system-ui', 'sans-serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'cyber-sm': '0 0 6px rgba(0,229,160,0.15)',
        'cyber': '0 0 12px rgba(0,229,160,0.15)',
        'cyber-lg': '0 0 20px rgba(0,229,160,0.2)',
        'cyber-xl': '0 0 40px rgba(0,229,160,0.15)',
      },
      keyframes: {
        'scan-pulse': {
          '0%': { strokeDashoffset: '0' },
          '100%': { strokeDashoffset: '-900' },
        },
        'scan-pulse-rev': {
          '0%': { strokeDashoffset: '-900' },
          '100%': { strokeDashoffset: '0' },
        },
        'glow-drift': {
          '0%': { transform: 'translate(0, 0)' },
          '100%': { transform: 'translate(10px, 8px)' },
        },
        'node-breathe': {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '0.8' },
        },
        'shield-expand': {
          '0%': { width: '20px', height: '20px', opacity: '0.6', borderColor: 'rgba(0,229,160,0.3)' },
          '70%': { opacity: '0.1' },
          '100%': { width: '500px', height: '500px', opacity: '0', borderColor: 'rgba(0,229,160,0.05)' },
        },
        'icon-glow': {
          '0%, 100%': { boxShadow: '0 0 10px rgba(0,229,160,0.15)' },
          '50%': { boxShadow: '0 0 20px rgba(0,229,160,0.3), inset 0 0 8px rgba(0,229,160,0.08)' },
        },
        'ring-pulse': {
          '0%, 100%': { r: '4', opacity: '0.3' },
          '50%': { r: '6', opacity: '0.6' },
        },
        'modal-enter': {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'backdrop-enter': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'badge-pop': {
          '0%': { opacity: '0', transform: 'scale(0.8)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'scan-slow': 'scan-pulse 18s linear infinite',
        'scan-med': 'scan-pulse 14s linear infinite',
        'scan-fast': 'scan-pulse 10s linear infinite',
        'scan-slow-rev': 'scan-pulse-rev 18s linear infinite',
        'scan-med-rev': 'scan-pulse-rev 16s linear infinite',
        'loop-slow': 'scan-pulse 24s linear infinite',
        'loop-med': 'scan-pulse 20s linear infinite',
        'glow-drift': 'glow-drift 12s ease-in-out infinite alternate',
        'node-breathe': 'node-breathe 5s ease-in-out infinite',
        'shield-expand': 'shield-expand 4s ease-out infinite',
        'icon-glow': 'icon-glow 3s ease-in-out infinite',
        'modal-enter': 'modal-enter 0.3s ease-out forwards',
        'backdrop-enter': 'backdrop-enter 0.2s ease-out forwards',
        'badge-pop': 'badge-pop 0.25s ease-out forwards',
      },
    },
  },
  plugins: [],
}
