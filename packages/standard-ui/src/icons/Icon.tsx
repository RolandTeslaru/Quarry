import { Spinner } from '../foundations/spinner'
import { cn } from '../utils/cn'
import { useIconPaths } from './useIconPaths'
import type { IconProps, PathIconName } from './types'

export function Icon(props: IconProps) {
    if (props.name === 'spinner')
        return <SpinnerIcon {...props} />

    return <PathIcon {...props} name={props.name} />
}

function SpinnerIcon({ name: _, size = 16, title, className, ...props }: IconProps) {
    return (
        <Spinner
            width={size}
            height={size}
            role='status'
            aria-label={title}
            className={cn('shrink-0', className)}
            elementClassName='fill-current'
            {...props}
        />
    )
}

function PathIcon({ name, size = 16, title, className, ...props }: IconProps & { name: PathIconName }) {
    const grid = size < 20 ? 16 : 20
    const { paths, failed } = useIconPaths(name, grid)
    const hasLabel = Boolean(title || props['aria-label'] || props['aria-labelledby'])
    let loadState = 'loading'

    if (failed) {
        loadState = 'error'
    } else if (paths) {
        loadState = 'loaded'
    }

    return (
        <svg
            xmlns='http://www.w3.org/2000/svg'
            width={size}
            height={size}
            viewBox={`0 0 ${grid} ${grid}`}
            fill='currentColor'
            aria-hidden={hasLabel ? undefined : true}
            role={hasLabel ? 'img' : undefined}
            data-icon={name}
            data-load-state={loadState}
            className={cn('shrink-0', className)}
            {...props}
        >
            {title && <title>{title}</title>}
            {paths?.map((path, index) => <path key={index} d={path} fillRule='evenodd' />)}
        </svg>
    )
}

export { Icon as LazyIcon }
