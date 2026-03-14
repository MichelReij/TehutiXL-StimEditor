import { defineConfig } from "vite";
import { resolve } from "path";
import fs from "fs/promises";
import path from "path";

// Vite plugin to handle API endpoints for data persistence
function dataApiPlugin() {
    const dataDir = resolve(__dirname, "source/data");

    return {
        name: "data-api",
        configureServer(server: any) {
            server.middlewares.use(async (req: any, res: any, next: any) => {
                // GET /api/tags
                if (req.url === "/api/tags" && req.method === "GET") {
                    try {
                        const filePath = path.join(dataDir, "tags.json");
                        const data = await fs.readFile(filePath, "utf-8");
                        res.setHeader("Content-Type", "application/json");
                        res.end(data);
                    } catch (error) {
                        res.statusCode = 404;
                        res.end(
                            JSON.stringify({ error: "Tags file not found" }),
                        );
                    }
                    return;
                }

                // POST /api/tags
                if (req.url === "/api/tags" && req.method === "POST") {
                    let body = "";
                    req.on("data", (chunk: any) => (body += chunk));
                    req.on("end", async () => {
                        try {
                            const filePath = path.join(dataDir, "tags.json");
                            await fs.mkdir(dataDir, { recursive: true });
                            await fs.writeFile(filePath, body, "utf-8");
                            res.setHeader("Content-Type", "application/json");
                            res.end(JSON.stringify({ success: true }));
                        } catch (error) {
                            res.statusCode = 500;
                            res.end(
                                JSON.stringify({
                                    error: "Failed to save tags",
                                }),
                            );
                        }
                    });
                    return;
                }

                // GET /api/stimuli
                if (req.url === "/api/stimuli" && req.method === "GET") {
                    try {
                        const filePath = path.join(dataDir, "stimuli.json");
                        const data = await fs.readFile(filePath, "utf-8");
                        res.setHeader("Content-Type", "application/json");
                        res.end(data);
                    } catch (error) {
                        res.statusCode = 404;
                        res.end(
                            JSON.stringify({ error: "Stimuli file not found" }),
                        );
                    }
                    return;
                }

                // POST /api/stimuli
                if (req.url === "/api/stimuli" && req.method === "POST") {
                    let body = "";
                    req.on("data", (chunk: any) => (body += chunk));
                    req.on("end", async () => {
                        try {
                            const filePath = path.join(dataDir, "stimuli.json");
                            await fs.mkdir(dataDir, { recursive: true });
                            await fs.writeFile(filePath, body, "utf-8");
                            res.setHeader("Content-Type", "application/json");
                            res.end(JSON.stringify({ success: true }));
                        } catch (error) {
                            res.statusCode = 500;
                            res.end(
                                JSON.stringify({
                                    error: "Failed to save stimuli",
                                }),
                            );
                        }
                    });
                    return;
                }

                // Generic helper for paths GET/POST
                const pathsRoutes: Record<string, string> = {
                    "/api/paths": "paths.json",
                    "/api/paths400": "paths400.json",
                    "/api/paths240": "paths240.json",
                };

                if (req.url && req.url in pathsRoutes && req.method === "GET") {
                    try {
                        const filePath = path.join(
                            dataDir,
                            pathsRoutes[req.url],
                        );
                        const data = await fs.readFile(filePath, "utf-8");
                        res.setHeader("Content-Type", "application/json");
                        res.end(data);
                    } catch (error) {
                        res.setHeader("Content-Type", "application/json");
                        res.end("[]");
                    }
                    return;
                }

                if (
                    req.url &&
                    req.url in pathsRoutes &&
                    req.method === "POST"
                ) {
                    const jsonFile = pathsRoutes[req.url];
                    let body = "";
                    req.on("data", (chunk: any) => (body += chunk));
                    req.on("end", async () => {
                        try {
                            const filePath = path.join(dataDir, jsonFile);
                            await fs.mkdir(dataDir, { recursive: true });
                            await fs.writeFile(filePath, body, "utf-8");
                            res.setHeader("Content-Type", "application/json");
                            res.end(JSON.stringify({ success: true }));
                        } catch (error) {
                            res.statusCode = 500;
                            res.end(
                                JSON.stringify({
                                    error: `Failed to save ${jsonFile}`,
                                }),
                            );
                        }
                    });
                    return;
                }

                next();
            });
        },
    };
}

export default defineConfig({
    root: "source",
    publicDir: resolve(__dirname, "source/img"),
    plugins: [dataApiPlugin()],
    server: {
        port: 5173,
        strictPort: true,
        open: true,
    },
    build: {
        outDir: "../dist",
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, "source/index.html"),
                paths: resolve(__dirname, "source/paths.html"),
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
});
