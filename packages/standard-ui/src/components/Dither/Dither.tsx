import { useEffect, useRef } from 'react'
import type { DitherCtx, DitherProps } from './createDitherCtx'

export type { DitherProps }

interface Props extends DitherProps {
    /** The Dither WebGL context to drive. Create it outside the component (e.g.
     * module-level) so the canvas + GPU resources survive remounts. */
    ctx: DitherCtx | null
}

/**
 * Thin React wrapper around a Dither WebGL context. Mounting only re-attaches
 * the provided ctx's persistent canvas + restarts its render loop, so remounting
 * never recreates any WebGL instances.
 */
export default function Dither({ ctx, ...props }: Props) {
    const ctnDom = useRef<HTMLDivElement>(null)

    // Keep the ctx props in sync without re-running the mount effect.
    useEffect(() => {
        if (!ctx) return
        ctx.setProps(props)
    }, [
        ctx,
        props.waveSpeed,
        props.waveFrequency,
        props.waveAmplitude,
        props.waveColor,
        props.waveColorVar,
        props.bgColor,
        props.bgColorVar,
        props.colorNum,
        props.pixelSize,
        props.disableAnimation,
        props.enableMouseInteraction,
        props.mouseRadius,
    ])

    useEffect(() => {
        const ctn = ctnDom.current
        if (!ctn || !ctx) return

        ctx.setProps(props)
        ctx.mount(ctn)

        return () => {
            ctx.unmount()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctx])

    if (!ctx) return null

    // Fills its box; the canvas is a block so no inline gap under it.
        return <div ref={ctnDom} className='relative size-full [&>canvas]:block' />
}
