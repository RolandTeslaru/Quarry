import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, root, '');

    return {
        plugins: [react(), tailwindcss()],
        envDir: root,
        resolve: { alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            '@quarry/shared': fileURLToPath(new URL('../shared', import.meta.url)),
        } },
        server: {
            port: 5173,
            strictPort: true,
            proxy: {
                '/api': { target: env.QUARRY_SERVER_URL || 'http://localhost:4000', changeOrigin: true },
                '/auth': {
                    target: env.GOTRUE_URL || 'http://localhost:9999',
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/auth/, ''),
                },
            },
        },
    };
});
