import { cva, type VariantProps } from 'class-variance-authority'

export const buttonVariants = cva(
    `relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap
    rounded-md text-sm font-medium outline-none select-none group/button
    transition-[color,background-color,border-color,opacity]
    focus-visible:border-(--button-focus) focus-visible:ring-[3px] focus-visible:ring-(--button-ring)
    aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20
    dark:aria-invalid:ring-destructive/40
    disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50
    data-[active=true]:ring-1 data-[active=true]:ring-inset data-[active=true]:ring-current/30
    [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4
    [--button-solid-fg:var(--button-fg)]
    [--button-neon-fg:var(--button-fg)]
    [--button-neon-bg:var(--button-bg)]
    [--button-neon-hover:var(--button-hover)]
    [--button-border:transparent]
    [--button-outline-border:color-mix(in_srgb,var(--button-fg)_40%,transparent)]
    [--button-subtle:color-mix(in_srgb,var(--button-fg)_15%,transparent)]
    [--button-focus:color-mix(in_srgb,var(--button-fg)_40%,transparent)]
    [--button-ring:color-mix(in_srgb,var(--button-fg)_30%,transparent)]`,
    {
        variants: {
            variant: {
                solid: `bg-(--button-bg) text-(--button-solid-fg) border-(--button-border)
                    hover:bg-(--button-hover) aria-expanded:bg-(--button-hover) shadow-sm shadow-black/10`,
                neon: `bg-(--button-neon-bg) text-(--button-neon-fg) border-transparent
                    hover:bg-(--button-neon-hover) aria-expanded:bg-(--button-neon-hover) shadow-none`,
                outlined: `bg-transparent text-(--button-fg) border border-(--button-outline-border)
                    hover:bg-(--button-subtle) aria-expanded:bg-(--button-subtle) shadow-none`,
                minimal: `bg-transparent text-(--button-fg) border-transparent
                    hover:bg-(--button-subtle) aria-expanded:bg-(--button-subtle) shadow-none`,
            },
            intent: {
                none: `[--button-fg:var(--foreground)]
                    [--button-bg:var(--surface)]
                    [--button-hover:color-mix(in_srgb,var(--surface)_90%,var(--foreground))]
                    [--button-border:var(--input-border)]
                    [--button-outline-border:var(--border)]
                    [--button-subtle:var(--muted)]
                    [--button-neon-bg:color-mix(in_srgb,var(--foreground)_8%,transparent)]
                    [--button-neon-hover:color-mix(in_srgb,var(--foreground)_15%,transparent)]`,
                primary: `[--button-fg:var(--primary)]
                    [--button-solid-fg:var(--primary-foreground)]
                    [--button-bg:var(--primary)]
                    [--button-hover:var(--primary-hover)]
                    [--button-border:var(--primary-accent)]
                    [--button-ring:var(--ring)]
                    [--button-neon-fg:var(--color-sky-700)]
                    [--button-neon-bg:color-mix(in_srgb,var(--color-sky-400)_20%,transparent)]
                    [--button-neon-hover:color-mix(in_srgb,var(--color-sky-400)_30%,transparent)]
                    dark:[--button-neon-fg:var(--color-sky-400)]
                    dark:[--button-neon-bg:color-mix(in_srgb,var(--color-sky-700)_20%,transparent)]
                    dark:[--button-neon-hover:color-mix(in_srgb,var(--color-sky-700)_30%,transparent)]`,
                success: `[--button-fg:var(--color-emerald-600)]
                    [--button-solid-fg:var(--color-white)]
                    [--button-bg:var(--color-emerald-600)]
                    [--button-hover:var(--color-emerald-700)]
                    [--button-border:var(--color-emerald-500)]
                    [--button-neon-fg:var(--color-emerald-700)]
                    [--button-neon-bg:color-mix(in_srgb,var(--color-emerald-400)_50%,transparent)]
                    [--button-neon-hover:color-mix(in_srgb,var(--color-emerald-400)_80%,transparent)]
                    dark:[--button-fg:var(--color-emerald-500)]
                    dark:[--button-bg:var(--color-emerald-700)]
                    dark:[--button-hover:var(--color-emerald-800)]
                    dark:[--button-border:var(--color-emerald-600)]
                    dark:[--button-neon-fg:var(--color-emerald-300)]
                    dark:[--button-neon-bg:color-mix(in_srgb,var(--color-emerald-700)_50%,transparent)]
                    dark:[--button-neon-hover:color-mix(in_srgb,var(--color-emerald-700)_80%,transparent)]`,
                warning: `[--button-fg:var(--color-amber-600)]
                    [--button-solid-fg:var(--color-amber-950)]
                    [--button-bg:var(--color-yellow-400)]
                    [--button-hover:var(--color-yellow-500)]
                    [--button-border:var(--color-yellow-500)]
                    [--button-neon-fg:var(--color-amber-900)]
                    [--button-neon-bg:color-mix(in_srgb,var(--color-yellow-400)_50%,transparent)]
                    [--button-neon-hover:var(--color-amber-200)]
                    dark:[--button-fg:var(--color-amber-400)]
                    dark:[--button-solid-fg:var(--color-yellow-950)]
                    dark:[--button-bg:var(--color-yellow-600)]
                    dark:[--button-hover:var(--color-yellow-500)]
                    dark:[--button-border:var(--color-yellow-500)]
                    dark:[--button-neon-fg:var(--color-yellow-100)]
                    dark:[--button-neon-bg:color-mix(in_srgb,var(--color-amber-400)_50%,transparent)]
                    dark:[--button-neon-hover:color-mix(in_srgb,var(--color-amber-400)_80%,transparent)]`,
                danger: `[--button-fg:var(--color-red-600)]
                    [--button-solid-fg:var(--color-white)]
                    [--button-bg:var(--color-red-600)]
                    [--button-hover:var(--color-red-700)]
                    [--button-border:var(--color-red-500)]
                    [--button-neon-fg:var(--color-red-700)]
                    [--button-neon-bg:color-mix(in_srgb,var(--color-red-400)_40%,transparent)]
                    [--button-neon-hover:color-mix(in_srgb,var(--color-red-400)_80%,transparent)]
                    dark:[--button-fg:var(--color-red-500)]
                    dark:[--button-bg:var(--color-red-800)]
                    dark:[--button-hover:var(--color-red-900)]
                    dark:[--button-border:var(--color-red-700)]
                    dark:[--button-neon-fg:var(--color-red-400)]
                    dark:[--button-neon-bg:color-mix(in_srgb,var(--color-red-900)_50%,transparent)]
                    dark:[--button-neon-hover:color-mix(in_srgb,var(--color-red-900)_80%,transparent)]`,
                accent: `[--button-fg:var(--accent-foreground)]
                    [--button-bg:color-mix(in_srgb,var(--accent)_10%,transparent)]
                    [--button-hover:color-mix(in_srgb,var(--accent)_20%,transparent)]
                    [--button-border:color-mix(in_srgb,var(--accent)_50%,transparent)]
                    dark:[--button-bg:color-mix(in_srgb,var(--accent)_20%,transparent)]
                    dark:[--button-hover:color-mix(in_srgb,var(--accent)_30%,transparent)]`,
                active: `[--button-fg:var(--color-sky-700)]
                    [--button-bg:color-mix(in_srgb,var(--color-sky-400)_20%,transparent)]
                    [--button-hover:color-mix(in_srgb,var(--color-sky-400)_30%,transparent)]
                    dark:[--button-fg:var(--color-sky-400)]
                    dark:[--button-bg:color-mix(in_srgb,var(--color-sky-700)_20%,transparent)]
                    dark:[--button-hover:color-mix(in_srgb,var(--color-sky-700)_30%,transparent)]`,
                ai: `[--button-fg:var(--port-LanguageModel-foreground)]
                    [--button-bg:color-mix(in_srgb,var(--port-LanguageModel)_20%,transparent)]
                    [--button-hover:color-mix(in_srgb,var(--port-LanguageModel)_32%,transparent)]`,
                message: `[--button-fg:var(--port-Message-foreground)]
                    [--button-bg:color-mix(in_srgb,var(--port-Message)_20%,transparent)]
                    [--button-hover:color-mix(in_srgb,var(--port-Message)_32%,transparent)]`,
            },
            size: {
                default: 'h-7 gap-1.5 px-2.5',
                xs: 'h-6 gap-1 px-2 text-xs [&_svg:not([class*=size-])]:size-3',
                sm: 'h-7 gap-1 px-2.5 text-[0.8rem] [&_svg:not([class*=size-])]:size-3.5',
                lg: 'h-8 gap-1.5 px-2.5',
                icon: 'size-8 p-0',
                'icon-xs': 'size-6 p-0',
                'icon-xxs': 'size-5 p-0 [&_svg:not([class*=size-])]:size-3.5',
                'icon-sm': 'size-7 p-0',
                'icon-lg': 'size-9 p-0 [&_svg:not([class*=size-])]:size-6',
            },
        },
        compoundVariants: [
            {
                variant: 'solid',
                intent: 'none',
                class: 'border',
            },
        ],
        defaultVariants: {
            variant: 'solid',
            intent: 'none',
            size: 'default',
        },
    },
)

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>
export type ButtonIntent = NonNullable<VariantProps<typeof buttonVariants>['intent']>
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>
