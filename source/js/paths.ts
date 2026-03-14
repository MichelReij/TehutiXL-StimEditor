// ================================================================== //
//                                                                    //
// Tehuti StimEditor – Paths page                                     //
//                                                                    //
// Lets the user compose activation paths by clicking excitation (EP) //
// images on a brain scan. Paths are saved to data/paths.json.       //
//                                                                    //
// ================================================================== //

import "../css/main.scss";
import { ExcitationPosition, Path } from "./types";

// ------------------------------------------------------------------ //
// State                                                               //
// ------------------------------------------------------------------ //

let paths: Path[] = [];
let selectedPathId: number | null = null;

/** Map from EP numeric id → positions for both sizes */
let excitationPositions: {
    [key: number]: { exc400: ExcitationPosition; exc240: ExcitationPosition };
} = {};

// ------------------------------------------------------------------ //
// Pixel-level hit testing (skip transparent areas of EP PNGs)        //
// ------------------------------------------------------------------ //

interface EpAlphaData {
    width: number;
    height: number;
    data: Uint8ClampedArray;
}
const epAlphaCache = new Map<string, EpAlphaData>();

function loadEpAlpha(filename: string): Promise<EpAlphaData | null> {
    if (epAlphaCache.has(filename))
        return Promise.resolve(epAlphaCache.get(filename)!);
    return new Promise((resolve) => {
        const probe = new Image();
        probe.onload = () => {
            const c = document.createElement("canvas");
            c.width = probe.naturalWidth;
            c.height = probe.naturalHeight;
            const ctx = c.getContext("2d");
            if (!ctx) {
                resolve(null);
                return;
            }
            ctx.drawImage(probe, 0, 0);
            try {
                const d = ctx.getImageData(0, 0, c.width, c.height);
                const entry: EpAlphaData = {
                    width: c.width,
                    height: c.height,
                    data: d.data,
                };
                epAlphaCache.set(filename, entry);
                resolve(entry);
            } catch {
                resolve(null);
            }
        };
        probe.onerror = () => resolve(null);
        // Use blue variant for alpha sampling (same shape as yellow)
        probe.src = `/exc400/blue/${filename}`;
    });
}

function isTransparentAt(
    alpha: EpAlphaData,
    imgEl: HTMLImageElement,
    clientX: number,
    clientY: number,
): boolean {
    const rect = imgEl.getBoundingClientRect();
    const px = Math.floor((clientX - rect.left) * (alpha.width / rect.width));
    const py = Math.floor((clientY - rect.top) * (alpha.height / rect.height));
    if (px < 0 || py < 0 || px >= alpha.width || py >= alpha.height)
        return true;
    return alpha.data[(py * alpha.width + px) * 4 + 3] < 10;
}

// ------------------------------------------------------------------ //
// CSV / position loading (identical logic to main.ts)                //
// ------------------------------------------------------------------ //

function parsePositionLine(
    line: string,
): { id: number; position: ExcitationPosition } | null {
    const parts = line.trim().split(",");
    if (parts.length !== 5) return null;

    const match = parts[0].match(/exc_(\d+)\.png/);
    if (!match) return null;

    const id = parseInt(match[1], 10);
    const x = parseInt(parts[1], 10);
    const y = parseInt(parts[2], 10);
    const width = parseInt(parts[3], 10);
    const height = parseInt(parts[4], 10);

    if (isNaN(id) || isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
        return null;
    }

    return { id, position: { x, y, width, height } };
}

async function loadExcitationPositions(): Promise<void> {
    try {
        const timestamp = Date.now();
        const [response400, response240] = await Promise.all([
            fetch(`/exc400/positions.csv?v=${timestamp}`),
            fetch(`/exc240/positions.csv?v=${timestamp}`),
        ]);

        const csv400 = await response400.text();
        const csv240 = await response240.text();

        const lines400 = csv400.split("\n").slice(1);
        const lines240 = csv240.split("\n").slice(1);

        lines400.forEach((line, index) => {
            const parsed400 = parsePositionLine(line);
            if (!parsed400) return;

            const parsed240 = parsePositionLine(lines240[index]);
            if (!parsed240 || parsed240.id !== parsed400.id) {
                console.warn(`Mismatch in CSV files at line ${index + 2}`);
                return;
            }

            excitationPositions[parsed400.id] = {
                exc400: parsed400.position,
                exc240: parsed240.position,
            };
        });

        console.log(
            `✅ Loaded ${Object.keys(excitationPositions).length} excitation positions`,
        );
    } catch (error) {
        console.error("❌ Failed to load excitation positions:", error);
    }
}

// ------------------------------------------------------------------ //
// API persistence                                                     //
// ------------------------------------------------------------------ //

async function loadPaths(): Promise<void> {
    try {
        const response = await fetch("/api/paths");
        if (response.ok) {
            const data = await response.json();
            paths = Array.isArray(data) ? data : [];
            console.log(`✅ Paths loaded: ${paths.length}`);
        }
    } catch (error) {
        console.error("❌ Failed to load paths:", error);
        paths = [];
    }
}

async function savePaths(): Promise<void> {
    try {
        await fetch("/api/paths", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(paths, null, 2),
        });
    } catch (error) {
        console.error("❌ Failed to save paths:", error);
    }
}

// ------------------------------------------------------------------ //
// Path management                                                     //
// ------------------------------------------------------------------ //

function addPath(): void {
    const newId =
        paths.length > 0 ? Math.max(...paths.map((p) => p.id)) + 1 : 1;
    const newPath: Path = { id: newId, steps: [] };
    paths.push(newPath);
    savePaths();
    renderPathsList();
    selectPath(newId);
}

function deletePath(id: number): void {
    paths = paths.filter((p) => p.id !== id);
    if (selectedPathId === id) {
        selectedPathId = paths.length > 0 ? paths[paths.length - 1].id : null;
    }
    savePaths();
    renderPathsList();
    renderCanvas();
    renderStepsList();
}

function selectPath(id: number): void {
    selectedPathId = id;
    renderPathsList();
    renderCanvas();
    renderStepsList();
    updateEditorVisibility();
}

/** Toggle an EP in the currently selected path */
function toggleEpInPath(epFilename: string): void {
    if (selectedPathId === null) return;

    const path = paths.find((p) => p.id === selectedPathId);
    if (!path) return;

    const idx = path.steps.indexOf(epFilename);
    if (idx === -1) {
        path.steps.push(epFilename);
    } else {
        path.steps.splice(idx, 1);
    }

    savePaths();
    renderCanvas();
    renderStepsList();

    // Sync step count badge in left panel
    const badge = document.querySelector(
        `#pathNav_${selectedPathId} .path-step-count`,
    );
    if (badge) badge.textContent = path.steps.length.toString();
}

function clearPathSteps(): void {
    if (selectedPathId === null) return;
    const path = paths.find((p) => p.id === selectedPathId);
    if (!path) return;
    path.steps = [];
    savePaths();
    renderCanvas();
    renderStepsList();

    const badge = document.querySelector(
        `#pathNav_${selectedPathId} .path-step-count`,
    );
    if (badge) badge.textContent = "0";
}

// ------------------------------------------------------------------ //
// Rendering                                                           //
// ------------------------------------------------------------------ //

function renderPathsList(): void {
    const list = document.getElementById("pathsList");
    if (!list) return;

    list.innerHTML = "";

    paths.forEach((path) => {
        const row = document.createElement("div");
        row.id = `pathNav_${path.id}`;
        row.className =
            "path-nav-elem" + (path.id === selectedPathId ? " selected" : "");

        const nameSpan = document.createElement("span");
        nameSpan.className = "path-name";
        nameSpan.textContent = `Pad ${path.id}`;

        const countBadge = document.createElement("span");
        countBadge.className = "path-step-count";
        countBadge.textContent = path.steps.length.toString();

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-path-btn";
        deleteBtn.textContent = "✕";
        deleteBtn.title = "Verwijder pad";
        deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (confirm(`Pad ${path.id} verwijderen?`)) {
                deletePath(path.id);
            }
        });

        row.appendChild(nameSpan);
        row.appendChild(countBadge);
        row.appendChild(deleteBtn);

        row.addEventListener("click", () => selectPath(path.id));
        list.appendChild(row);
    });
}

function renderCanvas(): void {
    const canvas = document.getElementById("epCanvas");
    if (!canvas) return;

    // Remove existing EP images (keep MRI background) and old click handler
    canvas.querySelectorAll(".ep-image").forEach((el) => el.remove());
    canvas.replaceWith(canvas.cloneNode(false)); // strip old listeners
    const freshCanvas = document.getElementById("epCanvas")!;
    // Re-append the MRI background
    const mri = document.getElementById("mriBackground");
    if (mri) freshCanvas.appendChild(mri);

    const selectedPath =
        selectedPathId !== null
            ? paths.find((p) => p.id === selectedPathId)
            : null;

    const epIds = Object.keys(excitationPositions).map(Number);

    epIds.forEach((epId) => {
        const pos = excitationPositions[epId]?.exc400;
        if (!pos) return;

        const filename = `exc_${String(epId).padStart(3, "0")}.png`;
        const isSelected = selectedPath?.steps.includes(filename) ?? false;

        const img = document.createElement("img");
        img.className = "ep-image";
        img.src = isSelected
            ? `/exc400/yellow/${filename}`
            : `/exc400/blue/${filename}`;
        img.dataset.filename = filename;
        img.style.position = "absolute";
        img.style.left = `${pos.x}px`;
        img.style.top = `${pos.y}px`;
        img.style.width = `${pos.width}px`;
        img.style.height = `${pos.height}px`;
        // pointer-events none: the canvas handles all clicks
        img.style.pointerEvents = "none";
        img.title = filename;
        img.draggable = false;

        freshCanvas.appendChild(img);
    });

    // Single canvas-level click handler: walk all EP images at the click point
    // and pick the first one whose pixel is non-transparent.
    if (selectedPathId !== null) {
        freshCanvas.style.cursor = "pointer";
        freshCanvas.addEventListener("click", async (e: MouseEvent) => {
            const epImages = Array.from(
                freshCanvas.querySelectorAll<HTMLImageElement>(".ep-image"),
            );
            // Sort by z-index descending (last appended = highest z) so we
            // test topmost visually-painted EP first.
            epImages.reverse();

            for (const img of epImages) {
                const filename = img.dataset.filename!;
                const alpha = await loadEpAlpha(filename);
                if (!alpha) continue;
                if (!isTransparentAt(alpha, img, e.clientX, e.clientY)) {
                    toggleEpInPath(filename);
                    return;
                }
            }
        });
    } else {
        freshCanvas.style.cursor = "default";
    }
}

function renderStepsList(): void {
    const titleEl = document.getElementById("pathStepsTitle");
    const listEl = document.getElementById("stepsList");
    const clearBtn = document.getElementById("clearStepsButton");
    if (!listEl || !titleEl) return;

    listEl.innerHTML = "";

    if (selectedPathId === null) {
        titleEl.textContent = "Geen pad geselecteerd";
        if (clearBtn) clearBtn.style.display = "none";
        return;
    }

    const path = paths.find((p) => p.id === selectedPathId);
    if (!path) return;

    titleEl.textContent = `Pad ${path.id} – ${path.steps.length} stap(pen)`;
    if (clearBtn) clearBtn.style.display = path.steps.length > 0 ? "" : "none";

    path.steps.forEach((filename, index) => {
        const li = document.createElement("li");

        const label = document.createElement("span");
        label.className = "step-label";
        label.textContent = `${index + 1}. ${filename}`;

        const removeBtn = document.createElement("button");
        removeBtn.className = "remove-step-btn";
        removeBtn.textContent = "✕";
        removeBtn.title = "Verwijder stap";
        removeBtn.addEventListener("click", () => {
            const p = paths.find((pp) => pp.id === selectedPathId);
            if (p) {
                p.steps.splice(index, 1);
                savePaths();
                renderCanvas();
                renderStepsList();
                const badge = document.querySelector(
                    `#pathNav_${selectedPathId} .path-step-count`,
                );
                if (badge) badge.textContent = p.steps.length.toString();
            }
        });

        li.appendChild(label);
        li.appendChild(removeBtn);
        listEl.appendChild(li);
    });
}

function updateEditorVisibility(): void {
    const noPathMsg = document.getElementById("noPathSelected");
    if (noPathMsg)
        noPathMsg.style.display = selectedPathId !== null ? "none" : "";
}

// ------------------------------------------------------------------ //
// Init                                                                //
// ------------------------------------------------------------------ //

async function init(): Promise<void> {
    await loadExcitationPositions();
    await loadPaths();

    renderPathsList();
    renderCanvas();
    renderStepsList();
    updateEditorVisibility();
}

// ------------------------------------------------------------------ //
// Expose handlers to global scope (for HTML onclick)                 //
// ------------------------------------------------------------------ //
const w = window as any;
w.addPath = addPath;
w.clearPathSteps = clearPathSteps;

// Start
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
