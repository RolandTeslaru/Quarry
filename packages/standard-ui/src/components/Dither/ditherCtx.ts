import { createDitherCtx } from './createDitherCtx'

function isWebGL2Available(): boolean {
    if (typeof document === 'undefined' || typeof WebGL2RenderingContext === 'undefined') {
        return false
    }

    try {
        const canvas = document.createElement('canvas')
        const gl = canvas.getContext('webgl2')
        if (!gl) return false

        // The probe should not consume one of the browser's limited WebGL contexts.
        gl.getExtension('WEBGL_lose_context')?.loseContext()
        return true
    } catch {
        return false
    }
}

/**
 * Shared module-level Dither WebGL context. Created once and reused wherever the
 * dither background is shown, so the canvas + GPU resources survive remounts and
 * route changes instead of being recreated. A single ctx owns one canvas and can
 * only be mounted in one place at a time — fine since these backgrounds are never
 * visible simultaneously.
 *
 * The shaders use GLSL 300 ES, so WebGL2 support is required. Unsupported
 * browsers receive `null` before OGL is allowed to create a renderer.
 */
export const ditherCtx = isWebGL2Available() ? createDitherCtx() : null
