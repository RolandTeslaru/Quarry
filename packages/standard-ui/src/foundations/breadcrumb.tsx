import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { SystemIcons } from '../icons'
import { cn } from '../utils/cn'

namespace BreadcrumbComponents {
    export type Root = React.ComponentProps<'nav'>
    export type List = React.ComponentProps<'ol'>
    export type Item = React.ComponentProps<'li'>
    export type Link = React.ComponentProps<'a'> & {
        asChild?: boolean
    }
    export type Page = React.ComponentProps<'span'>
    export type Separator = React.ComponentProps<'li'>
    export type Ellipsis = React.ComponentProps<'span'>
}

function Root(props: BreadcrumbComponents.Root) {
    return <nav aria-label='breadcrumb' data-slot='breadcrumb' {...props} />
}

function List({ className, ...props }: BreadcrumbComponents.List) {
    return (
        <ol
            data-slot='breadcrumb-list'
            className={cn(
                'text-muted-foreground flex flex-wrap items-center gap-1.5 wrap-break-word text-sm sm:gap-2.5',
                className,
            )}
            {...props}
        />
    )
}

function Item({ className, ...props }: BreadcrumbComponents.Item) {
    return <li data-slot='breadcrumb-item' className={cn('inline-flex items-center gap-1.5', className)} {...props} />
}

function Link({ asChild, className, ...props }: BreadcrumbComponents.Link) {
    const Comp = asChild ? Slot : 'a'

    return (
        <Comp
            data-slot='breadcrumb-link'
            className={cn('transition-colors hover:text-foreground', className)}
            {...props}
        />
    )
}

function Page({ className, ...props }: BreadcrumbComponents.Page) {
    return (
        <span
            data-slot='breadcrumb-page'
            role='link'
            aria-disabled='true'
            aria-current='page'
            className={cn('text-foreground font-normal', className)}
            {...props}
        />
    )
}

function Separator({ children, className, ...props }: BreadcrumbComponents.Separator) {
    return (
        <li
            data-slot='breadcrumb-separator'
            role='presentation'
            aria-hidden='true'
            className={cn('[&>svg]:size-3.5', className)}
            {...props}
        >
            {children ?? <SystemIcons.ChevronRight />}
        </li>
    )
}

function Ellipsis({ className, ...props }: BreadcrumbComponents.Ellipsis) {
    return (
        <span
            data-slot='breadcrumb-ellipsis'
            role='presentation'
            aria-hidden='true'
            className={cn('flex size-9 items-center justify-center', className)}
            {...props}
        >
            <SystemIcons.Ellipsis className='size-4' />
            <span className='sr-only'>More</span>
        </span>
    )
}

export const Breadcrumb = {
    Root,
    List,
    Item,
    Link,
    Page,
    Separator,
    Ellipsis,
}
