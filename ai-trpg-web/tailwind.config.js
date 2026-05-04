/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* ═══ Ink & Paper — the dominant story ═══ */
        void:            'hsl(220, 20%, 4%)',
        abyss:           'hsl(220, 18%, 7%)',
        obsidian: {
          DEFAULT:       'hsl(220, 16%, 11%)',
          light:         'hsl(220, 15%, 14%)',
        },
        slate: {
          DEFAULT:       'hsl(220, 14%, 16%)',
          light:         'hsl(220, 12%, 22%)',
        },
        ash:             'hsl(220, 10%, 30%)',
        fog:             'hsl(220, 8%, 50%)',

        parchment: {
          50:            'hsl(38, 50%, 95%)',
          100:           'hsl(38, 50%, 88%)',
          200:           'hsl(38, 45%, 82%)',
          300:           'hsl(38, 40%, 78%)',
          400:           'hsl(38, 35%, 68%)',
          500:           'hsl(38, 30%, 60%)',
          600:           'hsl(38, 25%, 55%)',
          700:           'hsl(38, 22%, 42%)',
          800:           'hsl(38, 20%, 30%)',
          900:           'hsl(38, 18%, 18%)',
        },

        /* ═══ Eldritch — the otherworldly glow ═══ */
        eldritch: {
          50:            'hsl(165, 50%, 90%)',
          100:           'hsl(165, 50%, 78%)',
          200:           'hsl(165, 55%, 65%)',
          300:           'hsl(165, 60%, 50%)',
          400:           'hsl(165, 70%, 45%)',
          500:           'hsl(165, 60%, 35%)',
          600:           'hsl(165, 55%, 28%)',
          700:           'hsl(165, 45%, 22%)',
          800:           'hsl(165, 40%, 15%)',
          900:           'hsl(165, 35%, 10%)',
          mist:          'hsla(165, 60%, 35%, 0.12)',
        },

        /* ═══ Blood — damage, danger ═══ */
        blood: {
          50:            'hsl(0, 60%, 92%)',
          100:           'hsl(0, 55%, 82%)',
          200:           'hsl(0, 60%, 65%)',
          300:           'hsl(0, 65%, 50%)',
          400:           'hsl(0, 70%, 45%)',
          500:           'hsl(0, 65%, 35%)',
          600:           'hsl(0, 60%, 28%)',
          700:           'hsl(0, 55%, 22%)',
          800:           'hsl(0, 50%, 15%)',
          900:           'hsl(0, 45%, 10%)',
        },

        /* ═══ Sanity — the mind fractures ═══ */
        sanity: {
          50:            'hsl(260, 50%, 92%)',
          100:           'hsl(260, 45%, 80%)',
          200:           'hsl(260, 50%, 68%)',
          300:           'hsl(260, 55%, 58%)',
          400:           'hsl(260, 60%, 55%)',
          500:           'hsl(260, 50%, 45%)',
          600:           'hsl(260, 45%, 35%)',
          700:           'hsl(260, 40%, 25%)',
          800:           'hsl(260, 35%, 18%)',
          900:           'hsl(260, 30%, 12%)',
        },

        /* ═══ Ritual Gold — candlelight, brass ═══ */
        ritual: {
          50:            'hsl(42, 70%, 92%)',
          100:           'hsl(42, 65%, 80%)',
          200:           'hsl(42, 68%, 68%)',
          300:           'hsl(42, 70%, 58%)',
          400:           'hsl(42, 70%, 50%)',
          500:           'hsl(42, 65%, 42%)',
          600:           'hsl(42, 55%, 32%)',
          700:           'hsl(42, 50%, 24%)',
          800:           'hsl(42, 45%, 16%)',
          900:           'hsl(42, 40%, 10%)',
        },

        /* ═══ Mana — magic, mystery ═══ */
        mana: {
          50:            'hsl(210, 55%, 92%)',
          100:           'hsl(210, 50%, 78%)',
          200:           'hsl(210, 55%, 65%)',
          300:           'hsl(210, 60%, 55%)',
          400:           'hsl(210, 60%, 45%)',
          500:           'hsl(210, 55%, 38%)',
          600:           'hsl(210, 50%, 30%)',
          700:           'hsl(210, 45%, 22%)',
          800:           'hsl(210, 40%, 15%)',
          900:           'hsl(210, 35%, 10%)',
        },

        /* ═══ Keep gray aliases for backward compat ═══ */
        cthulhu: {
          200:           'hsl(165, 55%, 65%)',
          300:           'hsl(165, 60%, 50%)',
          400:           'hsl(165, 70%, 45%)',
          600:           'hsl(165, 55%, 28%)',
          700:           'hsl(165, 45%, 22%)',
          800:           'hsl(165, 40%, 15%)',
          900:           'hsl(165, 35%, 10%)',
        },
      },

      fontFamily: {
        display: ['"Cinzel Decorative"', 'Georgia', '"Noto Serif SC"', '"STZhongsong"', '"SimSun"', 'serif'],
        serif:   ['"Crimson Text"', 'Georgia', '"Noto Serif SC"', '"Songti SC"', '"SimSun"', '"华文宋体"', 'serif'],
        body:    ['"Fira Sans"', '"Noto Sans SC"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
        mono:    ['"Fira Code"', 'Consolas', 'Monaco', '"Andale Mono"', '"Ubuntu Mono"', 'monospace'],
      },

      animation: {
        'pulse-slow':   'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'flicker':      'flicker 3s ease-in-out infinite alternate',
        'fade-in':      'fadeIn 0.5s ease-out',
        'slide-up':     'slideUp 0.3s ease-out',
        'glow-pulse':   'glowPulse 2.5s ease-in-out infinite',
        'ink-spread':   'inkSpread 0.6s ease-out',
        'sigil-spin':   'sigilSpin 2s linear infinite',
        'breathe':      'breathe 4s ease-in-out infinite',
      },

      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.82' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 8px hsla(165, 60%, 35%, 0.2)' },
          '50%':      { boxShadow: '0 0 20px hsla(165, 60%, 35%, 0.45)' },
        },
        inkSpread: {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        sigilSpin: {
          from: { transform: 'rotate(0deg)' },
          to:   { transform: 'rotate(360deg)' },
        },
        breathe: {
          '0%, 100%': { opacity: '0.6' },
          '50%':      { opacity: '1' },
        },
      },

      boxShadow: {
        'eldritch':     '0 0 15px hsla(165, 60%, 35%, 0.25), inset 0 0 30px hsla(165, 60%, 35%, 0.05)',
        'eldritch-lg':  '0 0 30px hsla(165, 60%, 35%, 0.35), inset 0 0 60px hsla(165, 60%, 35%, 0.08)',
        'blood':        '0 0 12px hsla(0, 65%, 35%, 0.3)',
        'blood-pulse':  '0 0 20px hsla(0, 70%, 45%, 0.5)',
        'sanity':       '0 0 12px hsla(260, 50%, 45%, 0.3)',
        'ritual':       '0 0 12px hsla(42, 70%, 50%, 0.3)',
        'mana':         '0 0 12px hsla(210, 60%, 45%, 0.3)',
        'ink':          '0 1px 3px hsla(220, 20%, 4%, 0.6), 0 0 0 1px hsla(220, 14%, 16%, 0.6)',
        'ink-lg':       '0 4px 16px hsla(220, 20%, 4%, 0.5), 0 0 0 1px hsla(220, 14%, 16%, 0.5)',
        'inner-glow':   'inset 0 0 40px hsla(165, 60%, 35%, 0.04)',
      },
    },
  },
  plugins: [],
}
