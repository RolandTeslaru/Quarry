import { cn } from '../utils/cn'

export interface BaseIconProps extends React.SVGProps<SVGSVGElement> {
    ref?: React.Ref<SVGSVGElement>
    size?: number
}
export const BaseIcon = ({
    className,
    size = 24,
    viewBox = '0 0 24 24',
    children,
    fill = 'none',
    stroke = 'currentColor',
    strokeWidth = 1.5,
    ...props
}: BaseIconProps & { children?: React.ReactNode }) => {
    return (
        <svg
            xmlns='http://www.w3.org/2000/svg'
            width={size}
            height={size}
            viewBox={viewBox}
            fill={fill}
            stroke={fill === 'none' ? stroke : undefined}
            strokeWidth={fill === 'none' ? strokeWidth : undefined}
            strokeLinecap='round'
            strokeLinejoin='round'
            className={cn('shrink-0', className)} //  shrink-0 prevents icons from being squashed in flex containers
            {...props}
        >
            {children}
        </svg>
    )
}
BaseIcon.displayName = 'BaseIcon'
