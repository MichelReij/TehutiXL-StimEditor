import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
    root: "source",
    publicDir: resolve(__dirname, "source/img"),
    build: {
        outDir: "../dist",
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, "source/index.html"),
            },
        },
    },
    css: {
        preprocessorOptions: {
            scss: {
                api: "modern-compiler",
            },
        },
    },
    server: {
        port: 5173,
        open: true,
    },
});
