import type { ComponentProps, ReactNode } from 'react'
import { Dither, ditherCtx } from '@quarry/standard-ui/components/Dither'
import { cn } from '@quarry/standard-ui/utils/cn'
import { Glyph } from './glyph/Glyph'
import { useApp } from './layout'

// An app's home screen — its route without a rid (`/<app>`, routes/index.tsx),
// inside the app's App.Root. Like an iPad app's document browser: the app's
// tinted dither fills the whole screen; its name sits large over it, beside its
// logo; below, a frosted panel holds the sections.
//
//   <App.Home.Root>
//       <App.Home.Header>
//           <App.Home.Logo />
//           <App.Home.PreTitle />
//           <App.Home.Title />
//           <App.Home.TitleDescription />
//       </App.Home.Header>
//       <App.Home.Content>
//           <App.Home.Toolbar>…</App.Home.Toolbar>
//           <App.Home.Section actions={…} title='All datasets'>…</App.Home.Section>
//       </App.Home.Content>
//   </App.Home.Root>
//
// Logo, Title and TitleDescription show the app's own (App.useApp) unless given children.

/** The whole screen — every column of the app's grid — over the app's dither. */
function Root({ className, children, ...props }: ComponentProps<'div'>) {
    const app = useApp()
    const look = app.home

    return (
        <div
            data-slot='app-home'
            className={cn('relative isolate flex min-h-0 flex-col overflow-hidden [grid-area:1/1/-1/-1]', className)}
            {...props}
        >
            {look && (
                <div aria-hidden className='pointer-events-none absolute inset-0 -z-10'>
                    {/* One WebGL context for every home: only one is on screen; it moves with the page. */}
                    <Dither
                        ctx={ditherCtx}
                        waveColorVar={look.tint}
                        bgColorVar='--surface'
                        waveSpeed={look.wave?.speed}
                        waveFrequency={look.wave?.frequency}
                        waveAmplitude={look.wave?.amplitude}
                        colorNum={look.wave?.steps ?? 5.5}
                        enableMouseInteraction={false}
                    />
                </div>
            )}

            {children}
        </div>
    )
}

/**
 * The top, frosted like the panel and as wide: logo beside the title and its
 * description.
 * A grid — each part places itself by area, so any can be left out.
 */
function Header({ className, ...props }: ComponentProps<'header'>) {
    return (
        <header
            data-slot='app-home-header'
            className={cn(
                `mx-auto mt-24 mb-8 grid w-full max-w-4xl shrink-0 items-center gap-x-6 gap-y-1 rounded-2xl border p-6
                bg-(--surface)/65 shadow-lg backdrop-blur-2xl
                grid-cols-[auto_minmax(0,1fr)]
                [grid-template-areas:'logo_pretitle'_'logo_title'_'logo_description']`,
                className,
            )}
            {...props}
        />
    )
}

interface LogoProps {
    /** Defaults to the app's glyph. */
    children?: ReactNode
}

/** The app's glyph, moderately big, beside the title. */
function Logo({ children }: LogoProps) {
    const app = useApp()

    return (
        <div data-slot='app-home-logo' className='[grid-area:logo] self-center'>
            {children ?? <Glyph glyph={app.glyph} size={88} className='shadow-sm' />}
        </div>
    )
}

/** A small line above the name: "Welcome to" unless given children. */
function PreTitle({ className, children, ...props }: ComponentProps<'p'>) {
    return (
        <p
            data-slot='app-home-pre-title'
            className={cn('self-end text-lg font-medium text-muted-foreground [grid-area:pretitle]', className)}
            {...props}
        >
            {children ?? 'Welcome to'}
        </p>
    )
}

/** The app's name, large. */
function Title({ className, children, ...props }: ComponentProps<'h1'>) {
    const app = useApp()

    return (
        <h1
            data-slot='app-home-title'
            className={cn('self-end text-5xl font-semibold tracking-tight text-foreground [grid-area:title]', className)}
            {...props}
        >
            {children ?? app.label}
        </h1>
    )
}

/** What the app is for, under its name. */
function TitleDescription({ className, children, ...props }: ComponentProps<'p'>) {
    const app = useApp()

    return (
        <p
            data-slot='app-home-title-description'
            className={cn('max-w-2xl self-start text-base text-muted-foreground [grid-area:description]', className)}
            {...props}
        >
            {children ?? app.description}
        </p>
    )
}

/** The app's main actions ("New dataset"), at the right of a section's title row or the toolbar. */
function Actions({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot='app-home-actions'
            className={cn('ml-auto flex shrink-0 items-center gap-2', className)}
            {...props}
        />
    )
}

/** The frosted panel below the header: the dither blurred behind it. Scrolls on its own. */
function Content({ className, ...props }: ComponentProps<'main'>) {
    return (
        <main
            data-slot='app-home-content'
            className={cn(
                `mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-auto rounded-t-2xl border border-b-0
                bg-(--surface)/65 shadow-lg backdrop-blur-2xl`,
                className,
            )}
            {...props}
        />
    )
}

/** A bar across the top of the panel — tabs, a search — that stays put as the panel scrolls. */
function Toolbar({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot='app-home-toolbar'
            className={cn('sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b px-6 py-3', className)}
            {...props}
        />
    )
}

interface SectionProps extends Omit<ComponentProps<'section'>, 'title'> {
    title: ReactNode
    /** A note beside the title: "12 you can see". */
    meta?:    ReactNode
    /** The section's actions — the home's main ones on its first section — at the right of its title row. */
    actions?: ReactNode
}

/** One block of the panel: a titled list or table — "Recently opened", "All datasets". */
function Section({ title, meta, actions, className, children, ...props }: SectionProps) {
    return (
        <section data-slot='app-home-section' className={cn('px-6 py-5', className)} {...props}>
            <div className='mb-3 flex min-h-8 items-center gap-2'>
                <h2 className='text-sm font-semibold text-foreground'>{title}</h2>
                {meta && <span className='text-xs text-muted-foreground'>{meta}</span>}
                {actions && <Actions>{actions}</Actions>}
            </div>
            {children}
        </section>
    )
}

export const Home = {
    Root,
    Header,
    Logo,
    PreTitle,
    Title,
    TitleDescription,
    Actions,
    Content,
    Toolbar,
    Section,
}
