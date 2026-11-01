import React, { memo } from 'react'

interface Props extends React.SVGProps<SVGSVGElement> {
    rectElementProps?: React.HTMLAttributes<SVGRectElement>
    elementClassName?: string
}

export const Spinner: React.FC<Props> = memo(({ rectElementProps, className = '', elementClassName, ...svgRest }) => {
    return (
        <svg
            className={className + ' overflow-visible'}
            width='24'
            height='24'
            viewBox='0 0 24 24'
            xmlns='http://www.w3.org/2000/svg'
            {...svgRest}
        >
            <style>{`
                .spinner_OSmW {
                    transform-origin: center;
                    animation: spinner_T6mA 0.75s steps(12) infinite;
                }

                @keyframes spinner_T6mA {
                    to {
                        transform: rotate(360deg);
                    }
                }
            `}</style>
            <g className={`${elementClassName} spinner_OSmW  dark:fill-white`}>
                <rect x='11' y='1' width='2' height='5' opacity='.14' rx='1' {...rectElementProps} />
                <rect
                    x='11'
                    y='1'
                    width='2'
                    height='5'
                    transform='rotate(30 12 12)'
                    opacity='.29'
                    rx='1'
                    {...rectElementProps}
                />
                <rect
                    x='11'
                    y='1'
                    width='2'
                    height='5'
                    transform='rotate(60 12 12)'
                    opacity='.43'
                    rx='1'
                    {...rectElementProps}
                />
                <rect
                    x='11'
                    y='1'
                    width='2'
                    height='5'
                    transform='rotate(90 12 12)'
                    opacity='.57'
                    rx='1'
                    {...rectElementProps}
                />
                <rect
                    x='11'
                    y='1'
                    width='2'
                    height='5'
                    transform='rotate(120 12 12)'
                    opacity='.71'
                    rx='1'
                    {...rectElementProps}
                />
                <rect
                    x='11'
                    y='1'
                    width='2'
                    height='5'
                    transform='rotate(150 12 12)'
                    opacity='.86'
                    rx='1'
                    {...rectElementProps}
                />
                <rect x='11' y='1' width='2' height='5' transform='rotate(180 12 12)' rx='1' {...rectElementProps} />
            </g>
        </svg>
    )
})
