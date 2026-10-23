import { memo, useSyncExternalStore, type CSSProperties } from 'react'
import { Toaster, toast } from 'sonner'
import { Spinner } from '../../foundations/spinner'
import { Icon } from '../../icons'
import { SDK } from '../SDKManager'

// From PretzelGraph's NotificationSDK: sonner's toasts, styled from the palette's status colours.

/**
 * Toasts for the whole app. Mount `UIOverlay` once (the root route); then call
 * `NotificationSDK.toast(...)` anywhere — `.success`, `.info`, `.warning`,
 * `.error`, `.loading`, `.promise`, or any React content.
 */
@SDK('Notification')
export class NotificationSDKImpl {

    public readonly toast = toast

    public readonly UIOverlay = memo(() => {
        const theme = useDocumentTheme()

        return (
            <Toaster
                theme={theme}
                position='top-center'
                richColors
                icons={{
                    success: <Icon name='tick-circle' size={20} />,
                    info:    <Icon name='info-sign' size={20} />,
                    warning: <Icon name='warning-sign' size={20} />,
                    error:   <Icon name='error' size={20} />,
                    loading: <Spinner className='size-5' />,
                }}
                style={TOASTER_COLORS}
                toastOptions={{
                    style: { boxShadow: '0 5px 20px 1px rgb(0 0 0 / 0.3)' },
                }}
            />
        )
    })
}

export const NotificationSDK = SDK.get<NotificationSDKImpl>('Notification')

// sonner's colour variables, mapped to the palette (styles.css: --popover, --success-background, …).
const TOASTER_COLORS = {
    '--normal-bg':     'var(--popover)',
    '--normal-text':   'var(--popover-foreground)',
    '--normal-border': 'var(--border)',
    '--border-radius': 'var(--radius-xl)',

    '--success-bg':     'var(--success-background)',
    '--success-text':   'var(--success-foreground)',
    '--success-border': 'color-mix(in srgb, var(--success-foreground) 30%, var(--success-background))',

    '--warning-bg':     'var(--warning-background)',
    '--warning-text':   'var(--warning-foreground)',
    '--warning-border': 'color-mix(in srgb, var(--warning-foreground) 30%, var(--warning-background))',

    '--error-bg':     'var(--error-background)',
    '--error-text':   'var(--error-foreground)',
    '--error-border': 'color-mix(in srgb, var(--error-foreground) 30%, var(--error-background))',

    '--info-bg':     'var(--info-background)',
    '--info-text':   'var(--info-foreground)',
    '--info-border': 'color-mix(in srgb, var(--info-foreground) 30%, var(--info-background))',

    '--toast-icon-margin-end': '10px',
} as CSSProperties

/** The page's theme, read from `.dark` on <html> (whoever sets it — the workspace shell's theme select). */
function useDocumentTheme(): 'light' | 'dark' {
    return useSyncExternalStore(subscribeToThemeClass, readThemeClass, () => 'light')
}

function readThemeClass(): 'light' | 'dark' {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function subscribeToThemeClass(onChange: () => void): () => void {
    const observer = new MutationObserver(onChange)

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    return () => observer.disconnect()
}
