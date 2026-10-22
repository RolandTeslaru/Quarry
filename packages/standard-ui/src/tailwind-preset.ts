// The design half of the Tailwind config: theme, animations and plugins.
// Apps add their own `content` globs and list this in `presets`.
import tailwindcssForms from '@tailwindcss/forms'
import tailwindcssTypography from '@tailwindcss/typography'
import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'
import tailwindcssAnimate from 'tailwindcss-animate'

const preset: Config = {
    darkMode: 'class',
    important: false,
    theme: {
        container: {
            center: true,
            screens: {
                '2xl': '1400px',
                '3xl': '1500px',
            },
        },
        extend: {
            screens: {
                xl: '1200px',
                '2xl': '1400px',
                '3xl': '1500px',
            },
            keyframes: {
                'spin-slow': {
                    from: { transform: 'translate(-50%, -50%) rotate(0deg)' },
                    to: { transform: 'translate(-50%, -50%) rotate(360deg)' },
                },
                // A node set onto the canvas by a run: it pops in where the run reached for it,
                // travels across, then settles down onto its place. 2s matches ARRIVE_MS.
                'node-arrive': {
                    '0%': {
                        opacity: '0',
                        transform: 'translate(var(--arrive-x, -180px), var(--arrive-y, 200px)) scale(0)',
                        animationTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    },
                    '20%': {
                        opacity: '1',
                        transform: 'translate(var(--arrive-x, -180px), var(--arrive-y, 200px)) scale(1)',
                        animationTimingFunction: 'cubic-bezier(0.65, 0, 0.35, 1)',
                    },
                    '60%': {
                        opacity: '1',
                        transform: 'translate(0px, var(--arrive-y, 200px)) scale(1)',
                        animationTimingFunction: 'cubic-bezier(0.65, 0, 0.35, 1)',
                    },
                    '100%': {
                        opacity: '1',
                        transform: 'translate(0px, 0px) scale(1)',
                    },
                },
                neonPulse: {
                    '0%, 100%': {
                        boxShadow: '0 0 0 3px var(--node-ring), 0 0 8px currentColor, 0 0 16px currentColor',
                    },
                    '50%': {
                        boxShadow: '0 0 0 3px var(--node-ring), 0 0 12px currentColor, 0 0 24px currentColor',
                    },
                },
                // Accordion animations
                'accordion-down': {
                    from: { height: '0' },
                    to: { height: 'var(--radix-accordion-content-height)' },
                },
                'accordion-up': {
                    from: { height: 'var(--radix-accordion-content-height)' },
                    to: { height: '0' },
                },
                'pulse-pink': {
                    '0%, 100%': { backgroundColor: 'var(--accent-pink)' },
                    '50%': { backgroundColor: 'color-mix(in srgb, var(--accent-pink) 40%, transparent)' },
                },
                'border-ping': {
                    '0%, 100%': {
                        borderColor: 'var(--destructive)',
                        boxShadow: '0 0 6px 1px color-mix(in srgb, var(--destructive) 60%, transparent)',
                    },
                    '50%': {
                        borderColor: 'color-mix(in srgb, var(--destructive) 20%, transparent)',
                        boxShadow: 'none',
                    },
                },
                'bg-ping': {
                    '0%, 100%': {
                        backgroundColor: 'var(--destructive)',
                        boxShadow: '0 0 6px 1px color-mix(in srgb, var(--destructive) 60%, transparent)',
                    },
                    '50%': {
                        backgroundColor: 'color-mix(in srgb, var(--destructive) 20%, transparent)',
                        boxShadow: 'none',
                    },
                },
                'ping-fixed-50': {
                    '0%': {
                        width: '100%',
                        height: '100%',
                        opacity: '0.95',
                    },
                    '70%': {
                        width: 'calc(100% + 50px)',
                        height: 'calc(100% + 50px)',
                        opacity: '0.5',
                    },
                    '80%': {
                        width: 'calc(100% + 50px)',
                        height: 'calc(100% + 50px)',
                        opacity: '0.2',
                    },
                    '100%': {
                        width: 'calc(100% + 50px)',
                        height: 'calc(100% + 50px)',
                        opacity: '0',
                    },
                },
                'ping-fixed-10': {
                    '0%': {
                        inset: '0px',
                        opacity: '0.95',
                    },
                    '70%': {
                        inset: '-15px',
                        opacity: '0.5',
                    },
                    '80%': {
                        inset: '-15px',
                        opacity: '0.2',
                    },
                    '100%': {
                        inset: '-15px',
                        opacity: '0',
                    },
                },
            },
            animation: {
                neonPulse: 'neonPulse 1.1s ease-in-out infinite',
                // Accordion animations
                'accordion-down': 'accordion-down 0.2s ease-out',
                'accordion-up': 'accordion-up 0.2s ease-out',
                'pulse-pink': 'pulse-pink 2s linear infinite',
                'border-ping': 'border-ping 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'bg-ping': 'bg-ping 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'ping-fixed-50': 'ping-fixed-50 700ms linear infinite',
                'ping-fixed-10': 'ping-fixed-10 700ms linear infinite',
                'spin-slow': 'spin-slow 1.5s linear infinite',
                'node-arrive': 'node-arrive 2s linear',
                'sonar-sweep': 'spin-slow calc(var(--sonar-duration, 4) * 1s) linear infinite',
            },
            colors: {
                error: {
                    DEFAULT: 'var(--error)',
                    background: 'var(--error-background)',
                    foreground: 'var(--error-foreground)',
                },
                'info-background': 'var(--info-background)',
                'info-foreground': 'var(--info-foreground)',
                warning: {
                    DEFAULT: 'var(--warning)',
                    foreground: 'var(--warning-foreground)',
                    text: 'var(--warning-text)',
                },
                'success-background': 'var(--success-background)',
                'success-foreground': 'var(--success-foreground)',
                canvas: {
                    DEFAULT: 'var(--canvas)',
                    dot: 'var(--canvas-dot)',
                },
                selected: 'var(--selected)',
                border: 'var(--border)',
                input: 'var(--input)',
                'input-border': 'var(--input-border)',
                ring: 'var(--ring)',
                background: 'var(--background)',
                foreground: 'var(--foreground)',
                placeholder: 'var(--placeholder)',
                'placeholder-foreground': 'var(--placeholder-foreground)',
                primary: {
                    DEFAULT: 'var(--primary)',
                    foreground: 'var(--primary-foreground)',
                    hover: 'var(--primary-hover)',
                    accent: 'var(--primary-accent)',
                },
                secondary: {
                    DEFAULT: 'var(--secondary)',
                    foreground: 'var(--secondary-foreground)',
                    hover: 'var(--secondary-hover)',
                },
                destructive: {
                    DEFAULT: 'var(--destructive)',
                    foreground: 'var(--destructive-foreground)',
                },
                active: {
                    DEFAULT: 'var(--active)',
                    foreground: 'var(--active-foreground)',
                },
                muted: {
                    DEFAULT: 'var(--muted)',
                    foreground: 'var(--muted-foreground)',
                },
                accent: {
                    DEFAULT: 'var(--accent)',
                    foreground: 'var(--accent-foreground)',
                },
                popover: {
                    DEFAULT: 'var(--popover)',
                    foreground: 'var(--popover-foreground)',
                },
                'popover-border': 'var(--popover-border)',
                card: {
                    DEFAULT: 'var(--card)',
                    float: 'var(--card-float)',
                    foreground: 'var(--card-foreground)',
                },
                tooltip: {
                    DEFAULT: 'var(--tooltip)',
                    foreground: 'var(--tooltip-foreground)',
                },
            },
            borderRadius: {
                xs: 'var(--radius-xs)',
                sm: 'var(--radius-sm)',
                md: 'var(--radius-md)',
                lg: 'var(--radius-lg)',
                xl: 'var(--radius-xl)',
                '2xl': 'var(--radius-2xl)',
                '3xl': 'var(--radius-3xl)',
                '4xl': 'var(--radius-4xl)',
            },
            borderWidth: {
                1.75: '1.75px',
                1.5: '1.5px',
            },
            fontFamily: {
                sans: ['var(--font-sans)', ...defaultTheme.fontFamily.sans],
                mono: ['var(--font-mono)', ...defaultTheme.fontFamily.mono],
                chivo: ['var(--font-chivo)', ...defaultTheme.fontFamily.sans],
            },
            boxShadow: {
                selected: '0px 0px 8px 2px var(--tw-shadow-color)',
            },
            backdropBlur: {
                xs: '2px',
            },
            zIndex: {
                60: '60',
                70: '70',
                80: '80',
                90: '90',
                100: '100',
                999: '999',
            },
        },
    },

    plugins: [
        tailwindcssAnimate,
        tailwindcssForms({
            strategy: 'class', // only generate classes
        }),
        tailwindcssTypography,
    ],
}

export default preset
