import { cn } from '../utils/cn'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot='skeleton' className={cn('bg-secondary rounded-md animate-pulse', className)} {...props} />
}

export { Skeleton }
