export const menuContentClasses = `
    standard-popup-motion bg-popover/90 text-popover-foreground z-50 min-w-[8rem] flex flex-col rounded-lg
    border border-popover-border p-1 shadow-xl backdrop-blur-md dark:shadow-black/30 light:shadow-neutral-950/30
`

export const menuItemClasses = `
    focus:bg-secondary cursor-pointer border border-transparent focus:text-secondary-foreground
    data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:text-destructive
    data-[variant=destructive]:*:[svg]:text-destructive
    not-data-[variant=destructive]:focus:**:text-secondary-foreground gap-1.5 rounded-sm px-1.5 py-1 text-sm
    [&_svg:not([class*='size-'])]:size-4 relative flex items-center outline-hidden select-none
    data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none
    [&_svg]:shrink-0 [&_svg]:text-accent-foreground/80
`

export const menuCheckableItemClasses = `
    not-data-[state=checked]:focus:bg-secondary border border-transparent
    not-data-[state=checked]:focus:text-secondary-foreground data-[state=checked]:bg-primary/15
    data-[state=checked]:text-foreground data-[state=checked]:**:text-foreground relative flex cursor-default
    items-center gap-2 rounded-sm py-1 pr-2 pl-8 text-sm outline-hidden select-none
    data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0
    [&_svg:not([class*='size-'])]:size-4 [&_svg]:text-accent-foreground/50
`

export const menuSubTriggerClasses = `
    focus:bg-secondary focus:text-secondary-foreground border border-transparent data-[state=open]:bg-secondary
    data-[state=open]:text-secondary-foreground
    not-data-[variant=destructive]:focus:**:text-secondary-foreground gap-1.5 rounded-sm px-1.5 py-1 text-sm
    [&_svg:not([class*='size-'])]:size-4 flex cursor-default items-center outline-hidden select-none
    data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:text-accent-foreground/50
`

export const menuSubContentClasses = `
    bg-popover/80 text-popover-foreground z-50 min-w-[8rem] data-[state=open]:animate-in
    data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
    data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2
    data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2
    data-[side=top]:slide-in-from-bottom-2 backdrop-blur-md overflow-hidden rounded-lg border
    border-popover-border p-1 shadow-lg
`

export const menuLabelClasses = `
    text-muted-foreground px-1.5 py-1 text-xs font-medium data-[inset]:pl-8
`

export const menuSeparatorClasses = `
    bg-border w-[calc(100%-0.5rem)] mx-auto my-1 h-px
`

export const menuShortcutClasses = `
    text-muted-foreground ml-auto text-xs tracking-widest
`
