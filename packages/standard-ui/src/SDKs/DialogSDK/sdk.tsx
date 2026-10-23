import React, { memo } from 'react'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { enableMapSet } from 'immer'
import type { IconName } from '../../icons'
import { createDialogSDKActions, type DialogSDKActions } from './actions'
import { dialogSelectors, type DialogSDKSelectors } from './selectors'
import { Template, UnstyledTemplate, SplitTemplate, TripleSplitTemplate } from './ui/templates'
import { AlertTemplate } from './ui/AlertTemplate'
import { TabsTemplate } from './ui/TabsTemplate'
import { SDK } from '../SDKManager'

enableMapSet()

@SDK('Dialog')
export class DialogSDKImpl {

    public readonly EXIT_ANIMATION_MS = 400

    public readonly useStore = create<DialogSDK.State>()(
        immer(() => ({
            dialogs: new Map<string, DialogSDK.Entry>(),
            selectors: dialogSelectors,
        })),
    )

    public readonly selectors = dialogSelectors

    private readonly runtime = createDialogSDKActions(this)

    public readonly actions = this.runtime.actions

    public readonly Template = Template

    public readonly AlertTemplate = AlertTemplate

    public readonly UnstyledTemplate = UnstyledTemplate

    public readonly SplitTemplate = SplitTemplate

    public readonly TripleSplitTemplate = TripleSplitTemplate

    public readonly TabsTemplate = TabsTemplate

    public readonly UIOverlay: DialogSDK.UILayer = memo(() => {
        const dialogs = this.useStore((state) => state.dialogs)
        const dialogsSize = dialogs.size

        return (
            <>
                {Array.from(dialogs).map(([dialogId, entry], index) => {
                    const blockTransparency = dialogsSize - index > 1
                    const surfaceStyle: DialogSDK.SurfaceStyle = {
                        filter: `brightness(${1 / (dialogsSize - index)})`,
                        transition: 'filter 400ms ease-in-out',
                        animationName: entry.isOpen ? 'dialog-fade-in' : 'dialog-fade-out',
                        animationDuration: '150ms',
                        animationTimingFunction: 'ease-in-out',
                        animationDelay: entry.isOpen ? '300ms' : '0ms',
                        animationFillMode: 'both',
                        ...(blockTransparency && {
                            '--material-opacity': '100%',
                            backdropFilter: 'none',
                        }),
                    }

                    return (
                        <React.Fragment key={dialogId}>
                            {entry.renderer({
                                entry,
                                dialogsSize,
                                index,
                                blockTransparency,
                                surfaceStyle,
                            })}
                        </React.Fragment>
                    )
                })}
            </>
        )
    })

    public get state() { return this.useStore.getState() }

    public get subscribe() { return this.useStore.subscribe }

    public get setState() { return this.useStore.setState }

    public cleanup(): void {
        this.runtime.cleanup()
    }
}

export const DialogSDK = SDK.get<DialogSDKImpl>('Dialog')

export namespace DialogSDK {

    export type State = {
        dialogs: Map<string, Entry>
        selectors: DialogSDKSelectors
    }
    export type Selectors = DialogSDKSelectors
    export type Actions = DialogSDKActions

    export type Icon = IconName | React.FC<React.SVGProps<SVGSVGElement>>

    export type SurfaceStyle = React.CSSProperties & { '--material-opacity'?: string }

    export type UILayer = React.FC

    export type Entry = {
        dialogId: string
        isOpen: boolean
        renderer: Renderer
    }
    export type Renderer = (props: TemplateProps) => React.ReactNode

    export interface AlertTemplateProps extends TemplateProps {
        type?: 'default' | 'warning' | 'danger' | 'accent'
        cancelLabel?: React.ReactNode
        approveLabel?: React.ReactNode

        approveDisabled?: boolean
    }

    export interface TemplateProps {
        className?: string
        children?: React.ReactNode
        entry: Omit<Entry, 'renderer'>
        dialogsSize: number
        index: number

        blockTransparency: boolean

        surfaceStyle: SurfaceStyle
        dismissible?: boolean
        onCancel?: (
            event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
            entry: Omit<Entry, 'renderer'>,
            dialogsSize: number,
            index: number,
        ) => void
        onApprove?: (
            event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
            entry: Omit<Entry, 'renderer'>,
            dialogsSize: number,
            index: number,
        ) => void
    }

    export type Template = React.FC<TemplateProps>
    export type AlertTemplate = React.FC<AlertTemplateProps>
    export type UnstyledTemplate = React.FC<TemplateProps>
    export type SplitTemplate = React.FC<SplitTemplate.Props> & {
        Header: SplitTemplate.Header
        Icon: SplitTemplate.Icon
        Title: SplitTemplate.Title
        Description: SplitTemplate.Description
    }
    export namespace SplitTemplate {

        export type Props = TemplateProps & {
            sidebarRenderer: () => React.ReactNode
            sidebarClassName?: string
            contentClassName?: string
        }
        export type Header = React.FC<{ children: React.ReactNode }>
        export type Icon = React.FC<{
            icon: DialogSDK.Icon
            size?: 'default' | 'lg'
        }>
        export type Title = React.FC<{ children: React.ReactNode }>
        export type Description = React.FC<{ children: React.ReactNode }>
    }
    export type TripleSplitTemplate = React.FC<
        TemplateProps & {
            leftSidebarRenderer: () => React.ReactNode
            rightSidebarRenderer: () => React.ReactNode
            leftSidebarClassName?: string
            rightSidebarClassName?: string
            contentClassName?: string
        }
    >

    export namespace TabsTemplate {

        export interface Item {
            id: string
            label: string
            icon: DialogSDK.Icon

            tone?: 'default' | 'destructive'
            panel: React.ReactNode
        }

        export type Empty = {
            icon?: React.ReactNode
            title: string
            description: string
        }
    }

    export type TabsTemplate = React.FC<
        TemplateProps & {
            sidebarClassName?: string
            contentClassName?: string
            defaultValue?: string
            items: TabsTemplate.Item[]
            empty?: TabsTemplate.Empty

            sidebarBottomRenderer?: () => React.ReactNode
            header?: {
                icon: DialogSDK.Icon
                title: string
            }
        }
    >
}
