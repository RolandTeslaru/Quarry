import { Renderer, Program, Mesh, Triangle, RenderTarget } from 'ogl'

// Fullscreen triangle — position is already in clip space, both passes derive
// their uv from gl_FragCoord so no uv attribute/varying is needed.
const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

// Pass 1: animated fbm wave field, rendered into an offscreen target.
const WAVE_FRAG = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uWaveSpeed;
uniform float uWaveFrequency;
uniform float uWaveAmplitude;
uniform vec3 uWaveColor;
uniform vec2 uMousePos;
uniform float uEnableMouseInteraction;
uniform float uMouseRadius;

out vec4 fragColor;

vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

float cnoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0,0.0,1.0,1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0,0.0,1.0,1.0);
  Pi = mod289(Pi);
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = fract(i * (1.0/41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g00,g00), dot(g01,g01), dot(g10,g10), dot(g11,g11)));
  g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fade_xy = fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  return 2.3 * mix(n_x.x, n_x.y, fade_xy.y);
}

const int OCTAVES = 4;
float fbm(vec2 p) {
  float value = 0.0;
  float amp = 1.0;
  float freq = uWaveFrequency;
  for (int i = 0; i < OCTAVES; i++) {
    value += amp * abs(cnoise(p));
    p *= freq;
    amp *= uWaveAmplitude;
  }
  return value;
}

float pattern(vec2 p) {
  vec2 p2 = p - uTime * uWaveSpeed;
  return fbm(p + fbm(p2));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  uv -= 0.5;
  uv.x *= uResolution.x / uResolution.y;
  float f = pattern(uv);
  if (uEnableMouseInteraction > 0.5) {
    vec2 mouseNDC = (uMousePos / uResolution - 0.5) * vec2(1.0, -1.0);
    mouseNDC.x *= uResolution.x / uResolution.y;
    float dist = length(uv - mouseNDC);
    float effect = 1.0 - smoothstep(0.0, uMouseRadius, dist);
    f -= 0.5 * effect;
  }
  // Output brightness only; the dither pass tints it. Dithering a single
  // scalar (instead of three channels) keeps the bands a pure hue — quantizing
  // R/G/B independently makes mid-range channels fringe (e.g. green speckle).
  fragColor = vec4(vec3(f), 1.0);
}
`

// Pass 2: Bayer-matrix ordered dithering over the wave target.
const DITHER_FRAG = `#version 300 es
precision highp float;

uniform sampler2D tMap;
uniform vec2 uResolution;
uniform float uColorNum;
uniform float uPixelSize;
uniform vec3 uWaveColor;
uniform vec3 uBgColor;

out vec4 fragColor;

const float bayerMatrix8x8[64] = float[64](
  0.0/64.0, 48.0/64.0, 12.0/64.0, 60.0/64.0,  3.0/64.0, 51.0/64.0, 15.0/64.0, 63.0/64.0,
  32.0/64.0,16.0/64.0, 44.0/64.0, 28.0/64.0, 35.0/64.0,19.0/64.0, 47.0/64.0, 31.0/64.0,
  8.0/64.0, 56.0/64.0,  4.0/64.0, 52.0/64.0, 11.0/64.0,59.0/64.0,  7.0/64.0, 55.0/64.0,
  40.0/64.0,24.0/64.0, 36.0/64.0, 20.0/64.0, 43.0/64.0,27.0/64.0, 39.0/64.0, 23.0/64.0,
  2.0/64.0, 50.0/64.0, 14.0/64.0, 62.0/64.0,  1.0/64.0,49.0/64.0, 13.0/64.0, 61.0/64.0,
  34.0/64.0,18.0/64.0, 46.0/64.0, 30.0/64.0, 33.0/64.0,17.0/64.0, 45.0/64.0, 29.0/64.0,
  10.0/64.0,58.0/64.0,  6.0/64.0, 54.0/64.0,  9.0/64.0,57.0/64.0,  5.0/64.0, 53.0/64.0,
  42.0/64.0,26.0/64.0, 38.0/64.0, 22.0/64.0, 41.0/64.0,25.0/64.0, 37.0/64.0, 21.0/64.0
);

float dither(vec2 uv, float lum) {
  vec2 scaledCoord = floor(uv * uResolution / uPixelSize);
  int x = int(mod(scaledCoord.x, 8.0));
  int y = int(mod(scaledCoord.y, 8.0));
  float threshold = bayerMatrix8x8[y * 8 + x] - 0.25;
  float stepv = 1.0 / (uColorNum - 1.0);
  lum += threshold * stepv;
  float bias = 0.2;
  lum = clamp(lum - bias, 0.0, 1.0);
  return floor(lum * (uColorNum - 1.0) + 0.5) / (uColorNum - 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  vec2 normalizedPixelSize = uPixelSize / uResolution;
  vec2 uvPixel = normalizedPixelSize * floor(uv / normalizedPixelSize);
  float lum = texture(tMap, uvPixel).r;
  float d = dither(uv, lum);
  fragColor = vec4(mix(uBgColor, uWaveColor, d), 1.0);
}
`

/**
 * Resolves a CSS custom property to a normalized [r,g,b] triple. A throwaway
 * element resolves `var()` (in whatever source format — oklch/hex/theme()), then
 * a canvas 2D context rasterizes that string to sRGB bytes. The canvas step is
 * essential: `getComputedStyle().color` can serialize back as `oklch(...)`, so
 * parsing it numerically would mistake lightness/chroma/hue for r/g/b.
 */
function cssVarToRgb(varName: string): [number, number, number] | null {
    const el = document.createElement('span')
    el.style.color = `var(${varName})`
    el.style.display = 'none'
    document.body.appendChild(el)
    const computed = getComputedStyle(el).color
    document.body.removeChild(el)

    const ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#000'
    ctx.fillStyle = computed // invalid strings leave it at #000
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return [r / 255, g / 255, b / 255]
}

export interface DitherProps {
    waveSpeed?: number
    waveFrequency?: number
    waveAmplitude?: number
    /** "High" wave colour as a normalized RGB array, e.g. [0.97, 0.45, 0.08]. */
    waveColor?: [number, number, number]
    /** CSS custom property to source the wave colour from, e.g. "--primary".
     * Resolved on mount; takes precedence over `waveColor` when set. */
    waveColorVar?: string
    /** "Low" colour the dither fades to (defaults to black). */
    bgColor?: [number, number, number]
    /** CSS custom property to source the low colour from. Takes precedence over
     * `bgColor` when set. */
    bgColorVar?: string
    colorNum?: number
    pixelSize?: number
    disableAnimation?: boolean
    enableMouseInteraction?: boolean
    mouseRadius?: number
}

export interface DitherCtx {
    /** The persistent WebGL canvas — reattach this on every mount. */
    readonly canvas: HTMLCanvasElement
    /** Append the canvas to `container`, size it, and start the render loop. */
    mount: (container: HTMLElement) => void
    /** Detach the canvas and pause the render loop. Keeps WebGL resources alive. */
    unmount: () => void
    /** Update animation props live. */
    setProps: (props: DitherProps) => void
    /** Permanently tear down the WebGL context — only call when truly disposing. */
    destroy: () => void
}

const DEFAULTS: Required<Omit<DitherProps, 'waveColorVar' | 'bgColorVar'>> = {
    waveSpeed: 0.05,
    waveFrequency: 3,
    waveAmplitude: 0.3,
    waveColor: [0.5, 0.5, 0.5],
    bgColor: [0, 0, 0],
    colorNum: 4,
    pixelSize: 2,
    disableAnimation: false,
    enableMouseInteraction: true,
    mouseRadius: 1,
}

/**
 * Creates a self-contained Dither WebGL context that owns the renderer, the
 * wave + dither programs, an offscreen render target and the render loop. It
 * lives outside the React lifecycle so the canvas and GPU resources survive
 * component remounts.
 *
 * The effect is two passes: (1) an animated fbm wave field rendered into an
 * offscreen target, then (2) a fullscreen Bayer-matrix dither over that target
 * drawn to the canvas — the OGL equivalent of the r3f EffectComposer chain.
 */
export function createDitherCtx(initialProps: DitherProps = {}): DitherCtx {
    let props: DitherProps = { ...initialProps }
    const get = <K extends keyof typeof DEFAULTS>(k: K): NonNullable<DitherProps[K]> =>
        (props[k] ?? DEFAULTS[k]) as NonNullable<DitherProps[K]>

    // Colours resolved from their CSS vars on mount; override the literal props.
    let varColor: [number, number, number] | null = null
    let varBgColor: [number, number, number] | null = null

    // No antialias: a fullscreen dither pass has no geometry edges, so MSAA only
    // wastes a multisampled buffer.
    const renderer = new Renderer({ antialias: false, depth: false })
    const gl = renderer.gl
    gl.clearColor(0, 0, 0, 1)
    gl.canvas.style.width = '100%'
    gl.canvas.style.height = '100%'

    // Wave pass renders at this fraction of canvas res; the dither pass upscales
    // it. Lower = cheaper fbm, hidden by dithering + any backdrop blur.
    const WAVE_SCALE = 0.5

    const waveGeometry = new Triangle(gl)
    const ditherGeometry = new Triangle(gl)

    const target = new RenderTarget(gl, { width: 1, height: 1, depth: false })

    const waveProgram = new Program(gl, {
        vertex: VERT,
        fragment: WAVE_FRAG,
        depthTest: false,
        depthWrite: false,
        uniforms: {
            uResolution: { value: [1, 1] },
            uTime: { value: 0 },
            uWaveSpeed: { value: get('waveSpeed') },
            uWaveFrequency: { value: get('waveFrequency') },
            uWaveAmplitude: { value: get('waveAmplitude') },
            uMousePos: { value: [0, 0] },
            uEnableMouseInteraction: { value: get('enableMouseInteraction') ? 1 : 0 },
            uMouseRadius: { value: get('mouseRadius') },
        },
    })

    const ditherProgram = new Program(gl, {
        vertex: VERT,
        fragment: DITHER_FRAG,
        depthTest: false,
        depthWrite: false,
        uniforms: {
            tMap: { value: target.texture },
            uResolution: { value: [1, 1] },
            uColorNum: { value: get('colorNum') },
            uPixelSize: { value: get('pixelSize') },
            uWaveColor: { value: get('waveColor') },
            uBgColor: { value: get('bgColor') },
        },
    })

    const waveMesh = new Mesh(gl, { geometry: waveGeometry, program: waveProgram })
    const ditherMesh = new Mesh(gl, { geometry: ditherGeometry, program: ditherProgram })

    let container: HTMLElement | null = null
    let animateId = 0
    let running = false
    let resizeObserver: ResizeObserver | null = null
    let themeObserver: MutationObserver | null = null
    let intersectionObserver: IntersectionObserver | null = null
    // Scrolled into view: only then (and with the tab visible) does the loop run.
    let inView = true

    // "Reduce motion" (the OS setting): one still frame, no loop.
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const animated = () => !get('disableAnimation') && !reducedMotion.matches

    // The colours from their CSS vars — on mount, when a var name changes, and on a
    // theme switch (`.dark` on <html>), so a tint always matches what's on screen.
    function resolveColors() {
        varColor = props.waveColorVar ? cssVarToRgb(props.waveColorVar) : null
        varBgColor = props.bgColorVar ? cssVarToRgb(props.bgColorVar) : null
    }
    let resizeId = 0
    let renderedWidth = 0
    let renderedHeight = 0
    const mouse: [number, number] = [0, 0]

    const handlePointerMove = (e: PointerEvent) => {
        if (!get('enableMouseInteraction')) return
        const rect = gl.canvas.getBoundingClientRect()
        const dpr = renderer.dpr
        mouse[0] = (e.clientX - rect.left) * dpr
        mouse[1] = (e.clientY - rect.top) * dpr
    }

    // Slow wave ⇒ 30fps is indistinguishable from 60/120 but ~half the GPU work.
    const FRAME_INTERVAL = 1000 / 30
    let lastFrame = 0

    const drawFrame = (t: number) => {
        const wu = waveProgram.uniforms
        if (!get('disableAnimation')) {
            wu.uTime.value = t * 0.001
        }
        wu.uWaveSpeed.value = get('waveSpeed')
        wu.uWaveFrequency.value = get('waveFrequency')
        wu.uWaveAmplitude.value = get('waveAmplitude')
        wu.uEnableMouseInteraction.value = get('enableMouseInteraction') ? 1 : 0
        wu.uMouseRadius.value = get('mouseRadius')
        wu.uMousePos.value = mouse

        ditherProgram.uniforms.uColorNum.value = get('colorNum')
        ditherProgram.uniforms.uPixelSize.value = get('pixelSize')
        ditherProgram.uniforms.uWaveColor.value = varColor ?? get('waveColor')
        ditherProgram.uniforms.uBgColor.value = varBgColor ?? get('bgColor')

        // Pass 1 → offscreen target, Pass 2 → screen.
        renderer.render({ scene: waveMesh, target })
        renderer.render({ scene: ditherMesh })
    }

    function resizeAndDraw(t: number): boolean {
        if (!container) return false

        const width = Math.max(1, Math.round(container.clientWidth))
        const height = Math.max(1, Math.round(container.clientHeight))
        if (width === renderedWidth && height === renderedHeight) return false

        renderedWidth = width
        renderedHeight = height
        renderer.setSize(width, height)

        // OGL's setSize writes fixed pixel CSS dimensions. Restore fluid sizing so
        // the existing frame follows the container until the next backing-store
        // resize is committed.
        gl.canvas.style.width = '100%'
        gl.canvas.style.height = '100%'

        // Dither pass runs at full canvas res (for crisp pixelSize/Bayer blocks)…
        ditherProgram.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height]
        // …but the expensive fbm wave pass renders into a downscaled target and is
        // bilinearly upscaled when sampled, so the noise runs on 1/4 the pixels.
        const waveWidth = Math.max(1, Math.round(gl.canvas.width * WAVE_SCALE))
        const waveHeight = Math.max(1, Math.round(gl.canvas.height * WAVE_SCALE))
        waveProgram.uniforms.uResolution.value = [waveWidth, waveHeight]
        target.setSize(waveWidth, waveHeight)
        ditherProgram.uniforms.tMap.value = target.texture

        // Changing canvas.width/height clears the WebGL drawing buffer. Redraw in
        // the same animation frame instead of leaving a black canvas until the
        // throttled 30fps loop happens to run again.
        lastFrame = t
        drawFrame(t)
        return true
    }

    function scheduleResize() {
        if (resizeId) return
        resizeId = requestAnimationFrame((t) => {
            resizeId = 0
            resizeAndDraw(t)
        })
    }

    function cancelScheduledResize() {
        if (!resizeId) return
        cancelAnimationFrame(resizeId)
        resizeId = 0
    }

    const update = (t: number) => {
        animateId = requestAnimationFrame(update)
        if (resizeId) return
        if (t - lastFrame < FRAME_INTERVAL) return
        // Carry the remainder so vsync quantization doesn't stretch the interval
        // (naive reset yields 24fps on a 120Hz display instead of 30).
        lastFrame = t - ((t - lastFrame) % FRAME_INTERVAL)
        drawFrame(t)
    }

    function start() {
        if (running || !animated() || !inView || document.hidden) return
        running = true
        animateId = requestAnimationFrame(update)
    }

    function stop() {
        running = false
        cancelAnimationFrame(animateId)
    }

    // Pause the loop entirely while the tab is hidden; resume on return (only if
    // still mounted to a container).
    const handleVisibility = () => {
        if (document.hidden) stop()
        else if (container) start()
    }

    // A still frame with the current props — when the loop isn't running to draw one.
    const drawStill = () => {
        if (!container) return
        const now = performance.now()
        lastFrame = now
        drawFrame(now)
    }

    const handleMotionChange = () => {
        if (animated()) start()
        else {
            stop()
            drawStill()
        }
    }

    return {
        canvas: gl.canvas,

        mount(nextContainer) {
            if (container && gl.canvas.parentNode === container) {
                container.removeChild(gl.canvas)
            }
            container = nextContainer
            nextContainer.appendChild(gl.canvas)

            resolveColors()

            gl.canvas.addEventListener('pointermove', handlePointerMove)
            document.addEventListener('visibilitychange', handleVisibility)
            reducedMotion.addEventListener('change', handleMotionChange)

            themeObserver?.disconnect()
            themeObserver = new MutationObserver(() => {
                resolveColors()
                if (!running) drawStill()
            })
            themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

            intersectionObserver?.disconnect()
            intersectionObserver = new IntersectionObserver(([entry]) => {
                inView = entry?.isIntersecting ?? true
                if (inView) start()
                else stop()
            })
            intersectionObserver.observe(nextContainer)

            resizeObserver?.disconnect()
            resizeObserver = new ResizeObserver(() => scheduleResize())
            resizeObserver.observe(nextContainer)

            const now = performance.now()
            if (!resizeAndDraw(now)) {
                lastFrame = now
                drawFrame(now)
            }
            start()
        },

        unmount() {
            stop()
            cancelScheduledResize()
            gl.canvas.removeEventListener('pointermove', handlePointerMove)
            document.removeEventListener('visibilitychange', handleVisibility)
            reducedMotion.removeEventListener('change', handleMotionChange)
            resizeObserver?.disconnect()
            resizeObserver = null
            themeObserver?.disconnect()
            themeObserver = null
            intersectionObserver?.disconnect()
            intersectionObserver = null
            inView = true
            if (container && gl.canvas.parentNode === container) {
                container.removeChild(gl.canvas)
            }
            container = null
        },

        setProps(next) {
            const colorsChanged = next.waveColorVar !== props.waveColorVar || next.bgColorVar !== props.bgColorVar

            props = { ...props, ...next }

            if (!container) return

            if (colorsChanged) resolveColors()

            // Animation switched on or off; and without a loop, a new still frame shows the change.
            if (animated()) start()
            else {
                stop()
                drawStill()
            }
        },

        destroy() {
            stop()
            cancelScheduledResize()
            gl.canvas.removeEventListener('pointermove', handlePointerMove)
            document.removeEventListener('visibilitychange', handleVisibility)
            reducedMotion.removeEventListener('change', handleMotionChange)
            resizeObserver?.disconnect()
            resizeObserver = null
            themeObserver?.disconnect()
            themeObserver = null
            intersectionObserver?.disconnect()
            intersectionObserver = null
            inView = true
            if (container && gl.canvas.parentNode === container) {
                container.removeChild(gl.canvas)
            }
            container = null
            gl.getExtension('WEBGL_lose_context')?.loseContext()
        },
    }
}
