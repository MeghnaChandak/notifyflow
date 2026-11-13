import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";

// The API listens on VITE_API_TARGET (default http://localhost:8190) without the "/api" prefix,
// so the dev proxy strips it. ws: true lets the socket.io traffic (/api/ws/socket.io) through.
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const apiTarget = env.VITE_API_TARGET || "http://localhost:8190";

    return {
        plugins: [react()],
        server: {
            host: true,
            port: 3100,
            strictPort: false,
            proxy: {
                "/api": {
                    target: apiTarget,
                    changeOrigin: true,
                    ws: true,
                    rewrite: (path) => path.replace(/^\/api/, ""),
                },
            },
        },
    };
});
