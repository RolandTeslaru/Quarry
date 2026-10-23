import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

const WORKSPACE_ROOT = fileURLToPath(new URL('../../', import.meta.url))

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, WORKSPACE_ROOT, '')

    const proxy = {
        '/api': {
            target: env.QUARRY_SERVER_URL || 'http://localhost:4000',
            changeOrigin: true,
        },

        // The realtime socket (RealtimeSDK ↔ the server's RealtimeGateway).
        '/socket': {
            target: env.QUARRY_SERVER_URL || 'http://localhost:4000',
            ws:     true,
        },

        '/auth-api': {
            target: env.GOTRUE_URL || 'http://localhost:9999',
            changeOrigin: true,
            rewrite: (path: string) => path.replace(/^\/auth-api/, ''),
        },
    }

    return {
        plugins: [
            tanstackRouter({
                target:             'react',
                autoCodeSplitting:  true,
                // The shell's routes plus each app's own (src/apps/<app>/routes), mounted at /<app>.
                virtualRouteConfig: './src/routes.config.ts',
            }),
            // Babel (dev, Fast Refresh) must parse the SDKs' @SDK decorators like TypeScript's
            // experimentalDecorators: legacy decorators, with class fields compiled loosely to match.
            react({
                babel: {
                    plugins: [
                        ['@babel/plugin-proposal-decorators', { legacy: true }],
                        ['@babel/plugin-proposal-class-properties', { loose: true }],
                    ],
                },
            }),
            tailwindcss(),
        ],
        envDir: WORKSPACE_ROOT,

        resolve: {
            dedupe: ['react', 'react-dom'],
            alias: {
                '@': fileURLToPath(new URL('./src', import.meta.url)),
                '@quarry/shared': fileURLToPath(new URL('../shared', import.meta.url)),
            },
        },

        server: {
            port: 5173,
            strictPort: true,

            proxy,
        },

        preview: {
            proxy,
        },
    }
})
