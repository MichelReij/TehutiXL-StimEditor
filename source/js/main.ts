// ================================================================== //
//                                                                    //
//                                                                    //
//                                                                    //
// Imports and Types                                                  //
//                                                                    //
// ================================================================== //

import "../css/main.scss";
import {
    ExcitationData,
    LayerData,
    Layer,
    Tag,
    Stimulus,
    DataExport,
    SerializedTag,
    WindowWithHandlers,
} from "./types";

// Globals vars
let tags: Tag[] = [];
let stimuli: Stimulus[] = [];
let selectedFilterTags: number[] = []; // Tag IDs selected for filtering stimuli
let showMask: boolean = true; // Remember mask visibility preference across tag switches
// 11-point intensity scale (0-10)
const intensityPalette: readonly string[] = [
    "#FAE073", // 0 - low intensity (light yellow)
    "#F8C34B", // 1
    "#F7A72B", // 2
    "#F58924", // 3
    "#F26839", // 4
    "#E04E5D", // 5
    "#CB376E", // 6
    "#B22375", // 7
    "#971574", // 8
    "#7B106D", // 9
    "#5D1161", // 10 - high intensity (dark purple)
];

// Example usage of writeTags to store some tags
const joyLayers: LayerData[] = [
    {
        layerId: 0,
        excitationData: [
            { x: 0, y: 0, intensity: 10, size: 3 },
            { x: 5, y: 3, intensity: 7, size: 5 },
            { x: -5, y: 1, intensity: 5, size: 3 },
            { x: -5, y: -3, intensity: 3, size: 6 },
        ],
    },
    {
        layerId: 1,
        excitationData: [
            { x: 0, y: 0, intensity: 10, size: 3 },
            { x: 5, y: 3, intensity: 7, size: 5 },
            { x: -5, y: 1, intensity: 5, size: 3 },
            { x: -5, y: -3, intensity: 3, size: 6 },
        ],
    },
];

const exampleTags: Tag[] = [new Tag(1, "joy", 0, joyLayers)];

// Throttle function with resettable delay.
function throttle<F extends (...args: any[]) => void>(
    func: F,
    delay: number,
): F {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return function (this: any, ...args: Parameters<F>) {
        // If there's an existing timer, cancel it
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }

        // Set a new timer
        timeoutId = setTimeout(() => {
            func.apply(this, args);
            timeoutId = null;
        }, delay);
    } as F;
}

// ================================================================== //
//                                                                    //
//                                                                    //
//                                                                    //
// Auto-discover stimuli files                                        //
//                                                                    //
// ================================================================== //

/**
 * Automatically discover all image files in the stimuli folder
 * Uses Vite's import.meta.glob to get all jpg files at build time
 */
async function autoDiscoverStimuli(): Promise<void> {
    // Get all jpg files from the stimuli folder
    const imageModules = import.meta.glob("/assets/stimuli/*.jpg", {
        eager: true,
        query: "?url",
        import: "default",
    });

    // Extract filenames and sort alphabetically
    const filenames = Object.keys(imageModules)
        .map((path) => path.split("/").pop() || "")
        .filter((name) => name && name !== ".DS_Store")
        .sort((a, b) => a.localeCompare(b));

    // Load existing stimuli from API (photos format) or localStorage
    let existingStimuli: Stimulus[] = [];
    try {
        const response = await fetch("/api/stimuli");
        if (response.ok) {
            const photosData = JSON.parse(await response.text());
            // Convert photos format to internal Stimulus format
            if (photosData.photos) {
                existingStimuli = photosData.photos.map(
                    (photo: any, index: number) => ({
                        id: photo.id || index + 1, // Use stored ID or generate new one
                        file: photo.photo,
                        size: `sizeof(${photo.photo.replace(".jpg", "")})`,
                        tags: photo.tags || [],
                        description: photo.description || "",
                    }),
                );
                console.log("✅ Stimuli loaded from file");
            }
        } else {
            throw new Error("API not available");
        }
    } catch (error) {
        // Fallback to localStorage
        const stimJSON = localStorage.getItem("stimuli");
        existingStimuli = stimJSON ? JSON.parse(stimJSON) : [];
        if (stimJSON) {
            console.log("📦 Migrating stimuli from localStorage to file...");
        }
    }

    // Create a map of existing files
    const existingFiles = new Map(existingStimuli.map((s) => [s.file, s]));

    // Find highest existing ID
    let maxId = Math.max(0, ...existingStimuli.map((s) => s.id));

    // Process all discovered files
    const updatedStimuli: Stimulus[] = [];
    let hasChanges = false;

    for (const filename of filenames) {
        if (existingFiles.has(filename)) {
            // Keep existing stimulus
            updatedStimuli.push(existingFiles.get(filename)!);
            existingFiles.delete(filename);
        } else {
            // New file discovered - add it
            const baseName = filename.replace(".jpg", "");
            updatedStimuli.push({
                id: ++maxId,
                file: filename,
                size: `sizeof(${baseName})`,
                tags: [],
            });
            hasChanges = true;
            console.log(
                `🆕 Nieuwe stimulus toegevoegd: ${filename} (ID: ${maxId})`,
            );
        }
    }

    // Check for deleted files
    if (existingFiles.size > 0) {
        hasChanges = true;
        existingFiles.forEach((stimulus) => {
            console.log(
                `🗑️ Stimulus verwijderd (bestand bestaat niet meer): ${stimulus.file}`,
            );
        });
    }

    // Update global stimuli array and save if changes detected
    if (hasChanges || existingStimuli.length === 0) {
        stimuli = updatedStimuli;
        saveStimuli();
        console.log(
            `✅ Stimuli gesynchroniseerd: ${stimuli.length} bestanden (alfabetisch gesorteerd)`,
        );
    } else {
        stimuli = existingStimuli;
    }
}

// Function to initialize the application
async function init() {
    // Attempt to read tags from API (with localStorage fallback)
    await readTags();
    await autoDiscoverStimuli();
    // readStimuli is no longer needed - autoDiscoverStimuli handles everything
    console.log(
        "Initialized with",
        tags.length,
        "tags and",
        stimuli.length,
        "stimuli",
    );
    displayStimuli();
    displayTags();

    // Add global keyboard handlers
    document.addEventListener("keydown", (event: KeyboardEvent) => {
        // Check if focus is in an input or textarea
        const activeElement = document.activeElement;
        const isInputFocused =
            activeElement instanceof HTMLInputElement ||
            activeElement instanceof HTMLTextAreaElement;

        if (event.key === "Escape") {
            const imageZoom = document.getElementById(
                "imageZoom",
            ) as HTMLDivElement;
            if (imageZoom && imageZoom.style.display === "flex") {
                hideImageZoom();
            }
        }

        // Handle Shift+arrow keys for zoom navigation (when zoom is open)
        // Shift+Up/Down arrow keys work even when search input has focus
        const imageZoom = document.getElementById(
            "imageZoom",
        ) as HTMLDivElement;
        if (imageZoom && imageZoom.style.display === "flex" && event.shiftKey) {
            if (event.key === "ArrowUp") {
                event.preventDefault();
                showPrevZoomImage(
                    new MouseEvent("click") as unknown as MouseEvent,
                );
            } else if (event.key === "ArrowDown") {
                event.preventDefault();
                showNextZoomImage(
                    new MouseEvent("click") as unknown as MouseEvent,
                );
            }
        }

        // Handle A and Z keys for size adjustment (only when not typing in input/textarea)
        if (
            !isInputFocused &&
            selectedPointIndex !== null &&
            selectedLayerId !== null
        ) {
            const ta = document.getElementById(
                `textarea_layer_${selectedLayerId}`,
            ) as HTMLTextAreaElement;

            if (ta) {
                try {
                    const excitationData: ExcitationData[] = JSON.parse(
                        ta.value,
                    );
                    const point = excitationData[selectedPointIndex];

                    if (event.key.toLowerCase() === "a") {
                        // Increase size (max 7)
                        event.preventDefault();
                        const newSize = Math.min(point.size + 1, 7);
                        if (newSize !== point.size) {
                            updatePointProperty(
                                selectedLayerId,
                                selectedPointIndex,
                                "size",
                                String(newSize),
                            );
                            // Update the slider value
                            const slider = document.getElementById(
                                `size_${selectedLayerId}_${selectedPointIndex}`,
                            ) as HTMLInputElement;
                            if (slider) {
                                slider.value = String(newSize);
                            }
                        }
                    } else if (event.key.toLowerCase() === "z") {
                        // Decrease size (min 3)
                        event.preventDefault();
                        const newSize = Math.max(point.size - 1, 3);
                        if (newSize !== point.size) {
                            updatePointProperty(
                                selectedLayerId,
                                selectedPointIndex,
                                "size",
                                String(newSize),
                            );
                            // Update the slider value
                            const slider = document.getElementById(
                                `size_${selectedLayerId}_${selectedPointIndex}`,
                            ) as HTMLInputElement;
                            if (slider) {
                                slider.value = String(newSize);
                            }
                        }
                    } else if (event.key.toLowerCase() === "s") {
                        // Increase intensity (max 10)
                        event.preventDefault();
                        const newIntensity = Math.min(point.intensity + 1, 10);
                        if (newIntensity !== point.intensity) {
                            updatePointProperty(
                                selectedLayerId,
                                selectedPointIndex,
                                "intensity",
                                String(newIntensity),
                            );
                            // Update the slider value
                            const slider = document.getElementById(
                                `intensity_${selectedLayerId}_${selectedPointIndex}`,
                            ) as HTMLInputElement;
                            if (slider) {
                                slider.value = String(newIntensity);
                            }
                        }
                    } else if (event.key.toLowerCase() === "x") {
                        // Decrease intensity (min 0)
                        event.preventDefault();
                        const newIntensity = Math.max(point.intensity - 1, 0);
                        if (newIntensity !== point.intensity) {
                            updatePointProperty(
                                selectedLayerId,
                                selectedPointIndex,
                                "intensity",
                                String(newIntensity),
                            );
                            // Update the slider value
                            const slider = document.getElementById(
                                `intensity_${selectedLayerId}_${selectedPointIndex}`,
                            ) as HTMLInputElement;
                            if (slider) {
                                slider.value = String(newIntensity);
                            }
                        }
                    } else if (event.key.toLowerCase() === "q") {
                        // Add new excitation point
                        event.preventDefault();
                        addExcitationPoint(selectedLayerId);
                    } else if (
                        event.key.toLowerCase() === "w" ||
                        event.key === "Backspace"
                    ) {
                        // Delete selected excitation point (W or Backspace)
                        event.preventDefault();
                        deleteExcitationPoint(
                            selectedLayerId,
                            selectedPointIndex,
                        );
                    }
                } catch (error) {
                    console.error(
                        "Failed to update property via keyboard:",
                        error,
                    );
                }
            }
        }
    });
}

// ================================================================== //
//                                                                    //
//                                                                    //
//                                                                    //
// Everything around the stimuli images                               //
//                                                                    //
// ================================================================== //
function addStimuli() {
    const overlay = document.getElementById("overlayMask") as HTMLDivElement;
    if (overlay) {
        overlay.style.display = "block";

        const textarea = document.getElementById(
            "output",
        ) as HTMLTextAreaElement;
        if (textarea) {
            textarea.value = "";
            textarea.style.display = "block";
        }
    }
}

function handlePaste(event: Event) {
    const source = event.target as HTMLTextAreaElement;
    var raw: string = source.value.replace(/\{/g, "[").replace(/\}/g, "]");
    raw = raw.replace(/    (\w{4,}),/g, `  "$1",`);
    raw = raw.replace(/    (sizeof\(\w{4,}\)),/g, `  "$1",`);
    // alert(raw);
    var newStims: any;
    try {
        newStims = JSON.parse(raw); // Probeer de tekst te parsen als JSON
    } catch (e) {
        try {
            newStims = JSON.parse(`[${raw}]`);
        } catch (e) {
            alert(`${e}\n\n\n${raw}`);
        }
    }
    var baseIndex: number = 0;
    stimuli.forEach((st) => {
        baseIndex = st.id > baseIndex ? st.id : baseIndex;
    });
    // console.log(`baseIndex: ${baseIndex}`);

    console.log(`stimuli.length: ${stimuli.length}`);
    if (Array.isArray(newStims)) {
        // alert(JSON.stringify(newStims));
        newStims.forEach((stim) => {
            const found = stimuli.find((oldStim) => oldStim.file == stim[1]);
            if (!found) {
                alert(JSON.stringify(stim));
                stimuli.push({
                    id: ++baseIndex,
                    file: check4JpgExtension(stim[1]),
                    size: stim[2],
                    tags: [],
                });
            }
            console.log(`stimuli.length: ${stimuli.length}`);
        });

        saveStimuli();
        displayStimuli();
    }

    // console.log(`stimuli.length: ${stimuli.length}`);

    // alert(JSON.stringify(stimuli));
}

function displayStimuli() {
    console.log("displayStimuli called, stimuli count:", stimuli.length);
    const stimContainer = document.getElementById(
        "stimContainer",
    ) as HTMLDivElement;
    console.log("stimContainer element:", stimContainer);
    if (stimContainer) {
        stimContainer.innerHTML = "";

        // Get filtered stimuli based on selected filter tags
        const filteredStimuli = getFilteredStimuli();

        // Sort stimuli alphabetically by filename before displaying
        const sortedStimuli = [...filteredStimuli].sort((a, b) =>
            a.file.localeCompare(b.file),
        );

        sortedStimuli.forEach((stimulus) => {
            stimulus.file = check4JpgExtension(stimulus.file);

            const badgeClass =
                stimulus.tags.length === 0
                    ? "tag-count-badge zero-tags"
                    : "tag-count-badge";

            const { totalAdrenaline, titleText } =
                getStimulusTagSummary(stimulus);

            const description = stimulus.description || "";

            const stimElem = `<label>
       <input type="checkbox" id="stimCb_${
           stimulus.id
       }" onchange="handleStimChecked(event)">
        <span class="${badgeClass}">${stimulus.tags.length}</span>
        <span class="adrenaline-badge">${totalAdrenaline.toFixed(2)}</span>
        <img src="/assets/stimuli/${stimulus.file}" title="${titleText}" oncontextmenu="showImageZoom('/assets/stimuli/${stimulus.file}', ${stimulus.id}, event)">
        <textarea class="stim-description" id="stimDesc_${stimulus.id}" placeholder="Beschrijving..." onchange="handleDescriptionChange(event)">${description}</textarea>
        </label>`;
            stimContainer.insertAdjacentHTML("beforeend", stimElem);
        });
        saveStimuli();

        const filterInfo =
            selectedFilterTags.length > 0
                ? ` (gefilterd: ${sortedStimuli.length} van ${stimuli.length})`
                : "";
        console.log(
            `✅ Displayed ${sortedStimuli.length} stimuli (alfabetisch gesorteerd)${filterInfo}`,
        );

        // Update checkbox states based on currently selected tag
        setCheckStimuli();
    } else {
        console.error("❌ stimContainer element not found!");
    }
}

function getStimulusTagSummary(stimulus: Stimulus): {
    totalAdrenaline: number;
    titleText: string;
} {
    const totalAdrenaline = stimulus.tags.reduce((sum, tagId) => {
        const tag = tags.find((t) => t.id === tagId);
        return sum + (tag ? tag.adrenaline : 0);
    }, 0);

    const tagNames = stimulus.tags
        .map((tagId) => {
            const tag = tags.find((t) => t.id === tagId);
            return tag ? tag.name : "";
        })
        .filter((name) => name !== "")
        .join(", ");

    const titleText = tagNames
        ? `${tagNames} - adrenaline: ${totalAdrenaline.toFixed(2)} - ${stimulus.file}`
        : `adrenaline: ${totalAdrenaline.toFixed(2)} - ${stimulus.file}`;

    return { totalAdrenaline, titleText };
}

function updateStimulusBadges(stimulus: Stimulus) {
    const checkbox = document.getElementById(
        `stimCb_${stimulus.id}`,
    ) as HTMLInputElement;
    if (!checkbox) return;

    const badge = checkbox.parentElement?.querySelector(
        ".tag-count-badge",
    ) as HTMLSpanElement | null;
    if (badge) {
        badge.textContent = stimulus.tags.length.toString();
        if (stimulus.tags.length === 0) {
            badge.classList.add("zero-tags");
        } else {
            badge.classList.remove("zero-tags");
        }
    }

    const { totalAdrenaline, titleText } = getStimulusTagSummary(stimulus);
    const adrenalineBadge = checkbox.parentElement?.querySelector(
        ".adrenaline-badge",
    ) as HTMLSpanElement | null;
    if (adrenalineBadge) {
        adrenalineBadge.textContent = totalAdrenaline.toFixed(2);
    }

    const img = checkbox.parentElement?.querySelector("img");
    if (img) {
        img.setAttribute("title", titleText);
    }

    const editId = document.getElementById("editId") as HTMLInputElement;
    if (editId) {
        const currentTagId = parseInt(editId.value);
        if (!isNaN(currentTagId)) {
            checkbox.checked = stimulus.tags.includes(currentTagId);
        }
    }
}

function setCheckStimuli() {
    // checks and unchecks the stimuli when a new tag is select
    const editId = document.getElementById("editId") as HTMLInputElement;
    if (editId) {
        const tagId = parseInt(editId.value);
        if (!isNaN(tagId)) {
            stimuli.forEach((stim) => {
                const cb = document.getElementById(
                    "stimCb_" + stim.id,
                ) as HTMLInputElement;
                if (cb) {
                    cb.checked = stim.tags.includes(tagId);
                }
            });
        }
    }
}

// ================================================================== //
//                                                                    //
// Tag Filtering Functions                                            //
//                                                                    //
// ================================================================== //

/**
 * Handle changes to tag filter checkboxes
 */
function handleTagFilterChange(event: Event) {
    const checkbox = event.target as HTMLInputElement;
    const tagId = parseInt(checkbox.value);

    if (checkbox.checked) {
        // Add tag to filter
        if (!selectedFilterTags.includes(tagId)) {
            selectedFilterTags.push(tagId);
        }
    } else {
        // Remove tag from filter
        const index = selectedFilterTags.indexOf(tagId);
        if (index > -1) {
            selectedFilterTags.splice(index, 1);
        }
    }

    // Re-display stimuli with updated filter
    displayStimuli();
}

/**
 * Clear all tag filters
 */
function clearTagFilters() {
    selectedFilterTags = [];
    displayTags();
    displayStimuli();
}

/**
 * Get filtered stimuli based on selected filter tags
 * If no filters are selected, returns all stimuli
 * If filters are selected, returns stimuli that have ALL selected tags (AND logic)
 */
function getFilteredStimuli(): Stimulus[] {
    if (selectedFilterTags.length === 0) {
        return stimuli;
    }

    return stimuli.filter((stimulus) => {
        // Stimulus must have ALL selected filter tags
        return selectedFilterTags.every((tagId) =>
            stimulus.tags.includes(tagId),
        );
    });
}

function check4JpgExtension(file: string): string {
    return file.indexOf(".jpg") > 0 ? file : file + ".jpg";
}

/**
 * Clamp excitation point size to valid range (3-7)
 */
function clampExcitationSize(data: ExcitationData): ExcitationData {
    return {
        ...data,
        size: Math.max(3, Math.min(7, data.size)),
    };
}

/**
 * Clamp excitation point coordinates to stay within visible bounds
 * The visualizer is 400x400px with center at (200, 200)
 * Coordinates should stay roughly between -180 and +180 to remain visible
 */
function clampExcitationPosition(data: ExcitationData): ExcitationData {
    const maxCoord = 180;
    const minCoord = -180;
    return {
        ...data,
        x: Math.max(minCoord, Math.min(maxCoord, data.x)),
        y: Math.max(minCoord, Math.min(maxCoord, data.y)),
    };
}

/**
 * Generate random intensity and size ensuring intensity + size <= 11
 * Intensity: 0-10
 * Size: 3-7
 * Constraint: intensity + size <= 11
 */
function generateIntensityAndSize(): {
    intensity: number;
    size: number;
} {
    // Generate intensity first (0-10)
    const intensity = Math.floor(Math.random() * 11);
    // Calculate max size based on intensity constraint
    const maxSize = Math.min(7, 11 - intensity);
    const minSize = 3;
    // Generate size, but ensure it's valid
    const size = Math.max(
        minSize,
        Math.floor(Math.random() * (maxSize - minSize + 1)) + minSize,
    );
    return { intensity, size };
}

function showImageZoom(
    imageSrc: string,
    stimulusId: number,
    event: MouseEvent,
) {
    event.preventDefault();
    openZoomForStimulus(stimulusId, imageSrc);
}

function openZoomForStimulus(stimulusId: number, imageSrc?: string) {
    const overlay = document.getElementById("imageZoom") as HTMLDivElement;
    const img = document.getElementById("zoomedImage") as HTMLImageElement;
    const searchInput = document.getElementById(
        "zoomTagSearch",
    ) as HTMLInputElement;
    const descriptionTextarea = document.getElementById(
        "zoomDescription",
    ) as HTMLTextAreaElement;

    if (!overlay || !img) return;

    const stimulus = stimuli.find((s) => s.id === stimulusId);
    if (!stimulus) return;

    img.src = imageSrc || `/assets/stimuli/${stimulus.file}`;
    renderZoomTagList(stimulus);
    updateZoomAdrenaline(stimulus);
    renderZoomEPPreview(stimulus);

    // Sync zoom mask checkbox with global showMask preference
    const zoomMaskCheckbox = document.getElementById(
        "cbZoomMask",
    ) as HTMLInputElement;
    const zoomMaskImage = document.getElementById("zoomEpMask");
    if (zoomMaskCheckbox) {
        zoomMaskCheckbox.checked = showMask;
    }
    if (zoomMaskImage) {
        if (showMask) {
            zoomMaskImage.classList.add("show");
        } else {
            zoomMaskImage.classList.remove("show");
        }
    }

    // Load description
    if (descriptionTextarea) {
        descriptionTextarea.value = stimulus.description || "";
    }

    // Clear search field
    if (searchInput) {
        searchInput.value = "";
    }

    const sortedStimuli = getSortedStimuli();
    const currentIndex = sortedStimuli.findIndex((s) => s.id === stimulusId);
    overlay.setAttribute("data-stimulus-id", stimulusId.toString());
    overlay.setAttribute("data-stimulus-index", currentIndex.toString());
    overlay.style.display = "flex";

    // Focus search input for convenience
    if (searchInput) {
        setTimeout(() => searchInput.focus(), 100);
    }
}

function getSortedStimuli(): Stimulus[] {
    return [...stimuli].sort((a, b) => a.file.localeCompare(b.file));
}

function showPrevZoomImage(event: MouseEvent) {
    event.stopPropagation();
    showAdjacentZoomImage(-1);
}

function showNextZoomImage(event: MouseEvent) {
    event.stopPropagation();
    showAdjacentZoomImage(1);
}

function showAdjacentZoomImage(offset: number) {
    const overlay = document.getElementById("imageZoom") as HTMLDivElement;
    if (!overlay) return;

    // Save current description before navigating
    const descriptionTextarea = document.getElementById(
        "zoomDescription",
    ) as HTMLTextAreaElement;
    if (descriptionTextarea) {
        const currentId = parseInt(
            overlay.getAttribute("data-stimulus-id") || "",
        );
        const currentStimulus = stimuli.find((s) => s.id === currentId);
        if (
            currentStimulus &&
            currentStimulus.description !== descriptionTextarea.value
        ) {
            currentStimulus.description = descriptionTextarea.value;
            saveStimuli();

            // Update main view description if it exists
            const mainDescTextarea = document.getElementById(
                `stimDesc_${currentId}`,
            ) as HTMLTextAreaElement;
            if (mainDescTextarea) {
                mainDescTextarea.value = descriptionTextarea.value;
            }
        }
    }

    const sortedStimuli = getSortedStimuli();
    if (sortedStimuli.length === 0) return;

    const currentId = parseInt(overlay.getAttribute("data-stimulus-id") || "");
    const currentIndex = sortedStimuli.findIndex((s) => s.id === currentId);
    if (currentIndex === -1) return;

    const nextIndex =
        (currentIndex + offset + sortedStimuli.length) % sortedStimuli.length;
    const nextStimulus = sortedStimuli[nextIndex];
    openZoomForStimulus(nextStimulus.id);
}

function renderZoomTagList(stimulus: Stimulus) {
    const tagsContainer = document.getElementById(
        "zoomedImageTags",
    ) as HTMLDivElement;
    if (!tagsContainer) return;

    tagsContainer.innerHTML = "";
    if (tags.length === 0) {
        tagsContainer.innerHTML =
            '<div class="no-tags">Geen tags beschikbaar</div>';
        return;
    }

    // Sort tags alphabetically by name
    const sortedTags = [...tags].sort((a, b) => a.name.localeCompare(b.name));

    sortedTags.forEach((tag) => {
        const isActive = stimulus.tags.includes(tag.id);
        const tagButton = document.createElement("button");
        tagButton.type = "button";
        tagButton.className = isActive ? "zoom-tag is-active" : "zoom-tag";
        tagButton.textContent = tag.name;
        tagButton.addEventListener("click", (event) => {
            event.stopPropagation();
            toggleTagForZoom(stimulus.id, tag.id);
        });
        tagsContainer.appendChild(tagButton);
    });
}

function toggleTagForZoom(stimulusId: number, tagId: number) {
    const stimulus = stimuli.find((s) => s.id === stimulusId);
    if (!stimulus) return;

    if (stimulus.tags.includes(tagId)) {
        stimulus.tags = stimulus.tags.filter((t) => t !== tagId);
    } else {
        stimulus.tags.push(tagId);
    }

    saveStimuli();
    updateStimulusBadges(stimulus);
    renderZoomTagList(stimulus);
    updateZoomAdrenaline(stimulus);
    renderZoomEPPreview(stimulus);

    const editIdVal = document.getElementById("editId") as HTMLInputElement;
    if (editIdVal) {
        const currentTagId = parseInt(editIdVal.value);
        if (!isNaN(currentTagId)) {
            displayTags(currentTagId);
        }
    }

    // Return focus to search input after toggling tag
    const searchInput = document.getElementById(
        "zoomTagSearch",
    ) as HTMLInputElement;
    if (searchInput) {
        searchInput.focus();
    }
}

function handleZoomTagSearchKeydown(event: KeyboardEvent) {
    const searchInput = event.target as HTMLInputElement;
    const searchTerm = searchInput.value.toLowerCase().trim();

    if (event.key === "Enter") {
        event.preventDefault();
        const tagsContainer = document.getElementById(
            "zoomedImageTags",
        ) as HTMLDivElement;
        if (!tagsContainer) return;

        const buttons = tagsContainer.querySelectorAll(".zoom-tag");

        // If there are matching tags, click the first one
        if (buttons.length > 0) {
            (buttons[0] as HTMLButtonElement).click();
            searchInput.value = "";
            handleZoomTagFilter(new Event("input") as Event);
            return;
        }

        // No matches - check if user wants to create a new tag
        if (searchTerm && searchTerm.length > 0) {
            const confirmed = confirm(`Create new tag "${searchTerm}"?`);
            if (confirmed) {
                // Create new tag with the search term as name
                const newTag = createNewTag(searchTerm);

                // Apply the new tag to the current stimulus
                const overlay = document.getElementById(
                    "imageZoom",
                ) as HTMLDivElement;
                const currentId = parseInt(
                    overlay.getAttribute("data-stimulus-id") || "",
                );
                const stimulus = stimuli.find((s) => s.id === currentId);
                if (stimulus && !stimulus.tags.includes(newTag.id)) {
                    stimulus.tags.push(newTag.id);
                    saveStimuli();
                    updateStimulusBadges(stimulus);
                }

                // Refresh the zoom tag list
                if (stimulus) {
                    renderZoomTagList(stimulus);
                    updateZoomAdrenaline(stimulus);
                }

                // Update main screen tag list with new tag's photo count
                displayTags(newTag.id);

                searchInput.value = "";
                searchInput.focus();
            }
        }
        return;
    }

    if (event.key === "Escape") {
        searchInput.value = "";
        handleZoomTagFilter(new Event("input") as Event);
        return;
    }
}

function handleZoomTagFilter(event: Event) {
    const searchInput = event.target as HTMLInputElement;
    const searchTerm = searchInput.value.toLowerCase();

    // Filter and re-render tags
    const overlay = document.getElementById("imageZoom") as HTMLDivElement;
    const currentId = parseInt(overlay.getAttribute("data-stimulus-id") || "");
    const stimulus = stimuli.find((s) => s.id === currentId);
    if (!stimulus) return;

    const tagsContainer = document.getElementById(
        "zoomedImageTags",
    ) as HTMLDivElement;
    if (!tagsContainer) return;

    tagsContainer.innerHTML = "";
    if (tags.length === 0) {
        tagsContainer.innerHTML =
            '<div class="no-tags">Geen tags beschikbaar</div>';
        return;
    }

    // Sort tags alphabetically by name
    const sortedTags = [...tags].sort((a, b) => a.name.localeCompare(b.name));

    let matchCount = 0;
    let firstMatchButton: HTMLButtonElement | null = null;
    sortedTags.forEach((tag) => {
        const isMatch =
            tag.name.toLowerCase().startsWith(searchTerm) || searchTerm === "";
        if (!isMatch) return;

        const isActive = stimulus.tags.includes(tag.id);
        const tagButton = document.createElement("button");
        tagButton.type = "button";
        tagButton.className = isActive ? "zoom-tag is-active" : "zoom-tag";
        tagButton.textContent = tag.name;
        tagButton.addEventListener("click", (clickEvent) => {
            clickEvent.stopPropagation();
            toggleTagForZoom(stimulus.id, tag.id);
            const search = document.getElementById(
                "zoomTagSearch",
            ) as HTMLInputElement;
            if (search) {
                search.value = "";
                handleZoomTagFilter(new Event("input") as Event);
            }
        });
        tagsContainer.appendChild(tagButton);

        if (matchCount === 0) {
            firstMatchButton = tagButton;
        }
        matchCount++;
    });

    if (matchCount === 0) {
        tagsContainer.innerHTML =
            '<div class="no-tags">Geen tags gevonden</div>';
    } else if (matchCount === 1 && searchTerm.length > 0) {
        // Highlight the single matching tag (ready to add with Enter)
        if (firstMatchButton) {
            (firstMatchButton as HTMLButtonElement).classList.add(
                "ready-to-add",
            );
        }
    }
}

function updateZoomAdrenaline(stimulus: Stimulus) {
    const adrenalineDisplay = document.getElementById("zoomAdrenaline");
    if (!adrenalineDisplay) return;

    const totalAdrenaline = stimulus.tags.reduce((sum, tagId) => {
        const tag = tags.find((t) => t.id === tagId);
        return sum + (tag?.adrenaline || 0);
    }, 0);

    adrenalineDisplay.textContent = `Adrenaline: ${totalAdrenaline.toFixed(2)}`;
}

/**
 * Render all excitation points from all tags associated with a stimulus
 * in the zoom preview canvas
 */
function renderZoomEPPreview(stimulus: Stimulus) {
    const canvas = document.getElementById("zoomEpCanvas");
    if (!canvas) return;

    // Clear existing excitation points (but keep the mask image)
    const existingPoints = canvas.querySelectorAll(".excitation-point");
    existingPoints.forEach((point) => point.remove());

    // Get all tags for this stimulus
    const stimulusTags = stimulus.tags
        .map((tagId) => tags.find((t) => t.id === tagId))
        .filter((tag): tag is Tag => tag !== undefined);

    if (stimulusTags.length === 0) return;

    // Collect all excitation points from all layers of all tags
    const allPoints: Array<ExcitationData & { tagId: number }> = [];

    stimulusTags.forEach((tag) => {
        tag.layers.forEach((layer) => {
            layer.excitationData.forEach((ep) => {
                allPoints.push({ ...ep, tagId: tag.id });
            });
        });
    });

    // Sort by intensity (lower intensity rendered first, appears behind)
    allPoints.sort((a, b) => a.intensity - b.intensity);

    // Render each point
    allPoints.forEach((ep) => {
        // Limit size to maximum 7 for preview
        const previewSize = Math.min(ep.size, 7);
        const x = 200 + ep.x - previewSize;
        const y = 200 - ep.y - previewSize;
        const color = intensityPalette[ep.intensity];

        const pointDiv = document.createElement("div");
        pointDiv.className = "excitation-point";
        pointDiv.style.top = `${y}px`;
        pointDiv.style.left = `${x}px`;
        pointDiv.style.width = `${previewSize * 2}px`;
        pointDiv.style.height = `${previewSize * 2}px`;
        pointDiv.style.backgroundColor = color;

        canvas.appendChild(pointDiv);
    });
}

function removeTagFromZoomedPhoto(stimulusId: number, tagId: number) {
    const stimulus = stimuli.find((s) => s.id === stimulusId);
    if (stimulus) {
        stimulus.tags = stimulus.tags.filter((t) => t !== tagId);
        saveStimuli();
        updateStimulusBadges(stimulus);
        renderZoomTagList(stimulus);
        updateZoomAdrenaline(stimulus);
        renderZoomEPPreview(stimulus);

        const editIdVal = document.getElementById("editId") as HTMLInputElement;
        if (editIdVal) {
            const currentTagId = parseInt(editIdVal.value);
            if (!isNaN(currentTagId)) {
                displayTags(currentTagId);
            }
        }
    }
}

function hideImageZoom() {
    const overlay = document.getElementById("imageZoom") as HTMLDivElement;
    if (!overlay) return;

    // Save current description before closing
    const descriptionTextarea = document.getElementById(
        "zoomDescription",
    ) as HTMLTextAreaElement;
    if (descriptionTextarea) {
        const currentId = parseInt(
            overlay.getAttribute("data-stimulus-id") || "",
        );
        const currentStimulus = stimuli.find((s) => s.id === currentId);
        if (
            currentStimulus &&
            currentStimulus.description !== descriptionTextarea.value
        ) {
            currentStimulus.description = descriptionTextarea.value;
            saveStimuli();

            // Update main view description if it exists
            const mainDescTextarea = document.getElementById(
                `stimDesc_${currentId}`,
            ) as HTMLTextAreaElement;
            if (mainDescTextarea) {
                mainDescTextarea.value = descriptionTextarea.value;
            }
        }
    }

    overlay.style.display = "none";
}

function handleStimChecked(event: Event) {
    const input = event.target as HTMLInputElement;
    const editId = document.getElementById("editId") as HTMLInputElement;
    if (editId) {
        const tagId = parseInt(editId.value);
        if (!isNaN(tagId)) {
            const stimId = parseInt(input.id.split("_")[1]);
            // console.log(`stimId: ${stimId}, tagId: ${tagId}`);
            stimuli.forEach((stim) => {
                if (stim.id == stimId) {
                    // console.log("pre: ", stim.tags);
                    if (input.checked) {
                        if (!stim.tags.includes(tagId)) {
                            stim.tags.push(tagId);
                        }
                    } else {
                        // Remove the tag from this image
                        stim.tags = stim.tags.filter((tag) => tag !== tagId);
                    }
                    // console.log("post: ", stim.tags);

                    // Update the badge count and styling
                    const badge =
                        input.parentElement?.querySelector(".tag-count-badge");
                    if (badge) {
                        badge.textContent = stim.tags.length.toString();
                        // Add or remove zero-tags class based on count
                        if (stim.tags.length === 0) {
                            badge.classList.add("zero-tags");
                        } else {
                            badge.classList.remove("zero-tags");
                        }
                    }

                    updateStimulusBadges(stim);

                    // Update zoom view if currently displayed
                    const overlay = document.getElementById(
                        "imageZoom",
                    ) as HTMLDivElement;
                    const currentStimId =
                        overlay?.getAttribute("data-stimulus-id");
                    if (
                        currentStimId &&
                        parseInt(currentStimId) === stimId &&
                        overlay.style.display === "flex"
                    ) {
                        const zoomedImg = document.getElementById(
                            "zoomedImage",
                        ) as HTMLImageElement;
                        if (zoomedImg && zoomedImg.src) {
                            openZoomForStimulus(stimId, zoomedImg.src);
                        }
                    }
                }
            });

            saveStimuli();
            // Update tag list to reflect new photo counts
            displayTags(tagId);
        }
    }
}

function handleDescriptionChange(event: Event) {
    const textarea = event.target as HTMLTextAreaElement;
    const stimId = parseInt(textarea.id.split("_")[1]);

    const stimulus = stimuli.find((s) => s.id === stimId);
    if (stimulus) {
        stimulus.description = textarea.value;
        saveStimuli();
    }
}

function handleZoomDescriptionChange(event: Event) {
    const textarea = event.target as HTMLTextAreaElement;
    const overlay = document.getElementById("imageZoom") as HTMLDivElement;
    if (!overlay) return;

    const stimulusId = parseInt(overlay.getAttribute("data-stimulus-id") || "");
    const stimulus = stimuli.find((s) => s.id === stimulusId);
    if (stimulus) {
        stimulus.description = textarea.value;
        saveStimuli();

        // Update main view description if it exists
        const mainDescTextarea = document.getElementById(
            `stimDesc_${stimulusId}`,
        ) as HTMLTextAreaElement;
        if (mainDescTextarea) {
            mainDescTextarea.value = textarea.value;
        }
    }
}

// ================================================================== //
//                                                                    //
//                                                                    //
//                                                                    //
// Everything around the tags                                         //
//                                                                    //
// ================================================================== //

// Function to handle keyUp event
function handleKeyUp(event: KeyboardEvent) {
    // console.log(`Key pressed: ${event.key}`);
    const target = event.target as HTMLTextAreaElement;
    const id = parseInt(target.id.split("_")[2]);
    // console.log(id);
    // console.log(target.value);
    renderPoints(id, target.value);
}

// Apply throttling to the handleKeyUp function, with a delay of 600 milliseconds
const throttledKeyUpHandler = throttle(handleKeyUp, 300);

function displayTags(selectId: number = 1) {
    const tagsList = document.getElementById("tagsList");
    if (tagsList) {
        tagsList.innerHTML = ""; // Clear existing tags display

        // Sort tags alphabetically by name
        const sortedTags = [...tags].sort((a, b) =>
            a.name.localeCompare(b.name),
        );

        sortedTags.forEach((tag) => {
            // Count how many stimuli have this tag
            const photoCount = stimuli.filter((stim) =>
                stim.tags.includes(tag.id),
            ).length;

            const element = document.createElement("div") as HTMLDivElement;
            element.id = "tagNav_" + tag.id.toString();
            element.classList.add("tag-nav-elem");

            // Create checkbox for filtering
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.id = `tagFilter_${tag.id}`;
            checkbox.value = tag.id.toString();
            checkbox.checked = selectedFilterTags.includes(tag.id);
            checkbox.addEventListener("change", handleTagFilterChange);
            checkbox.addEventListener("click", (e) => e.stopPropagation());

            // Create span for tag name and count
            const tagNameSpan = document.createElement("span");
            tagNameSpan.classList.add("tag-name");
            tagNameSpan.textContent = `${tag.name} (${photoCount})`;

            // Add click handler to the element (not the checkbox)
            element.addEventListener("click", () => editTag(tag));

            element.appendChild(checkbox);
            element.appendChild(tagNameSpan);
            tagsList.appendChild(element);

            if (tag.id == selectId) {
                editTag(tag);
            }
        });
    }
}

function addTag() {
    createNewTag("new");
}

/**
 * Create a new tag with the specified name or "new" as default
 * Generates 6 random excitation points in a line formation with overlapping points
 */
function createNewTag(nameHint: string = "new") {
    // Create new tag with 6 excitation points forming a line
    const excitationData: ExcitationData[] = [];
    const maxTotalIntensity = 18;
    let remainingIntensityBudget = maxTotalIntensity;
    let previousDirection = Math.random() * 2 * Math.PI; // Initial random direction

    // Generate 6 points
    for (let i = 0; i < 6; i++) {
        // Generate intensity for this point
        const isLastPoint = i === 5;
        let intensity: number;

        if (i === 0) {
            // First point: random intensity (0-10), but leave room for others
            intensity = Math.floor(
                Math.random() * Math.min(11, remainingIntensityBudget - 5),
            );
        } else if (isLastPoint) {
            // Last point: use remaining budget or random if enough room
            intensity = Math.floor(
                Math.random() * Math.min(11, remainingIntensityBudget + 1),
            );
        } else {
            // Middle points: random but respect budget
            intensity = Math.floor(
                Math.random() *
                    Math.min(11, remainingIntensityBudget - (5 - i)),
            );
        }

        remainingIntensityBudget -= intensity;

        // Calculate size based on intensity constraint (intensity + size <= 11), max 5
        const maxSize = Math.min(5, 11 - intensity);
        const minSize = 3;
        const size = Math.max(
            minSize,
            Math.floor(Math.random() * (maxSize - minSize + 1)) + minSize,
        );

        let newPoint: ExcitationData;

        if (i === 0) {
            // First point: random position with radius between 120-170
            const angle = Math.random() * 2 * Math.PI;
            const radius = 120 + Math.random() * 50; // 120-170
            newPoint = {
                x: Math.round(radius * Math.cos(angle)),
                y: Math.round(radius * Math.sin(angle)),
                intensity,
                size,
            };
            previousDirection = angle; // Set initial direction
        } else {
            // Subsequent points: overlap 20-60% with previous point
            const prevPoint = excitationData[i - 1];

            // Calculate overlap distance
            // For 20-60% overlap: distance should be between 40-80% of combined radii
            const overlapFraction = 0.2 + Math.random() * 0.4; // 20-60%
            const combinedRadius = prevPoint.size + size;
            const distance = combinedRadius * (1 - overlapFraction);

            // Adjust direction to form a line (max 60 degrees change)
            const maxAngleChange = Math.PI / 3; // 60 degrees
            const angleChange = (Math.random() - 0.5) * 2 * maxAngleChange;
            const newDirection = previousDirection + angleChange;

            // Calculate new position
            let x = Math.round(prevPoint.x + distance * Math.cos(newDirection));
            let y = Math.round(prevPoint.y + distance * Math.sin(newDirection));

            // Ensure point stays within radius 170
            const currentRadius = Math.sqrt(x * x + y * y);
            if (currentRadius > 170) {
                const scale = 170 / currentRadius;
                x = Math.round(x * scale);
                y = Math.round(y * scale);
            }

            newPoint = {
                x,
                y,
                intensity,
                size,
            };

            // Check if new point overlaps with any previous points (except immediate predecessor)
            // If it does, try a different direction
            let attempts = 0;
            const maxAttempts = 10;
            while (attempts < maxAttempts) {
                let overlapsWithEarlier = false;

                // Check overlap with all points except the immediate predecessor
                for (let j = 0; j < i - 1; j++) {
                    const earlierPoint = excitationData[j];
                    const dx = newPoint.x - earlierPoint.x;
                    const dy = newPoint.y - earlierPoint.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const minDist = (newPoint.size + earlierPoint.size) * 0.8; // Allow 20% overlap as tolerance

                    if (dist < minDist) {
                        overlapsWithEarlier = true;
                        break;
                    }
                }

                if (!overlapsWithEarlier) {
                    break; // Good position found
                }

                // Try different angle
                attempts++;
                const tryAngleChange =
                    (Math.random() - 0.5) * 2 * maxAngleChange;
                const tryDirection = previousDirection + tryAngleChange;
                x = Math.round(prevPoint.x + distance * Math.cos(tryDirection));
                y = Math.round(prevPoint.y + distance * Math.sin(tryDirection));

                // Ensure within radius 170
                const tryRadius = Math.sqrt(x * x + y * y);
                if (tryRadius > 170) {
                    const scale = 170 / tryRadius;
                    x = Math.round(x * scale);
                    y = Math.round(y * scale);
                }

                newPoint = { x, y, intensity, size };
            }

            previousDirection = newDirection;
        }

        // Clamp position to visible bounds (-180 to +180)
        newPoint = clampExcitationPosition(newPoint);
        excitationData.push(newPoint);
    }

    // Sort by size (largest first) for better visibility
    excitationData.sort((a, b) => b.size - a.size);

    const defaultLayer: LayerData = {
        layerId: 17,
        excitationData,
    };
    const newTag = new Tag(tags.length + 1, nameHint, 0, [defaultLayer]);
    tags.push(newTag);
    saveTags();
    displayTags(newTag.id);

    // If called from main screen, focus and select the name field
    if (nameHint === "new") {
        setTimeout(() => {
            const editName = document.getElementById(
                "editName",
            ) as HTMLInputElement;
            if (editName) {
                editName.focus();
                editName.select();
            }
        }, 100);
    }

    return newTag;
}

function editTag(tag: Tag) {
    const editor = document.getElementById("tagEditor");
    const editId = document.getElementById("editId") as HTMLInputElement;
    const editName = document.getElementById("editName") as HTMLInputElement;
    const editAdrenaline = document.getElementById(
        "editAdrenaline",
    ) as HTMLInputElement;

    if (editor && editId && editName && editAdrenaline) {
        const navs: HTMLCollectionOf<Element> =
            document.getElementsByClassName("tag-nav-elem");
        if (navs) {
            for (let i = 0; i < navs.length; i++) {
                if (navs[i].id == "tagNav_" + tag.id) {
                    navs[i].classList.add("selected");
                } else {
                    navs[i].classList.remove("selected");
                }
            }
        }
        editor.style.display = "grid";

        editId.value = tag.id.toString();
        editName.value = tag.name;
        editAdrenaline.value = tag.adrenaline.toString();
        const adrenalineValue = document.getElementById("adrenalineValue");
        if (adrenalineValue) {
            adrenalineValue.textContent = tag.adrenaline.toFixed(2);
        }

        const layerContainer = document.getElementById("layerContainer");
        if (layerContainer) {
            layerContainer.innerHTML = ""; // Clear existing tags display
            // tag.getLayers().forEach((layer) => {
            // const layerId: number = layer.layerId;
            const layerId = 17;
            const layer = tag.getLayer(layerId);

            // Clamp excitation point sizes to valid range (3-7)
            const clampedExcitationData =
                layer.excitationData.map(clampExcitationSize);

            // Sort by size (largest first) for better visibility
            clampedExcitationData.sort((a, b) => b.size - a.size);

            const maskChecked = showMask ? "checked" : "";
            const maskClass = showMask ? "mri-mask show" : "mri-mask";

            layerContainer.insertAdjacentHTML(
                "beforeend",
                `
          <div class="layer" id="layer_${layerId}">
            <div class="visualizer-section">
              <div class="mask-control">
                <label><input type="checkbox" ${maskChecked} id="cbMask_${layerId}" onchange="handleMask(event)"> Show mask</label>
              </div>
              <div class="visualizer" id="vis_${layerId}">
                <img class="mri-background" src="/mri/mri_017.jpg" alt="MRI scan" draggable="false">
                <div class="point-container" id="pc_${layerId}"></div>
                <img id="mask_${layerId}" class="${maskClass}" src="/masks/mri_mask_017.gif" draggable="false">
              </div>
            </div>
            <div class="controls-section">
              <button onclick="addExcitationPoint(${layerId})">+ Add Point</button>
              <div id="pointsList_${layerId}" class="points-list"></div>
            </div>
            <div class="json-section">
              <label for="textarea_layer_${layerId}">JSON Data (x, y: -20 to +20 | intensity: 0-10 | size: 3-7)</label>
              <textarea id="textarea_layer_${layerId}" onkeyup="throttledKeyUpHandler(event)">${JSON.stringify(
                  clampedExcitationData,
              )
                  .replace(/},{/g, "},\n  {")
                  .replace(/\[{/g, "[\n  {")
                  .replace(/}\]/g, "}\n]")}</textarea>
            </div>
          </div>
        `,
            );

            renderPoints(layerId, JSON.stringify(clampedExcitationData));
            renderPointsList(layerId);

            // Select first excitation point by default
            if (clampedExcitationData.length > 0) {
                selectedPointIndex = 0;
                selectedLayerId = layerId;
                // Re-render to apply selection styling
                renderPoints(layerId, JSON.stringify(clampedExcitationData));
                renderPointsList(layerId);
            }
            // });
        }

        setCheckStimuli();
    } else {
        console.error("One or more editor elements are missing.");
    }
}

function handleNameChange(event: Event) {
    const input = event.target as HTMLInputElement;

    const tagIdInput = document.getElementById("editId") as HTMLInputElement;
    if (tagIdInput) {
        const tagId: Number = parseInt(tagIdInput.value);
        // Now we need to find the tag with the corresponding id
        tags.forEach((tag) => {
            if (tag.id === tagId) {
                tag.name = input.value;
            }
        });

        // Now change the name in the navlist too
        const navElem = document.getElementById(
            "tagNav_" + tagId,
        ) as HTMLDivElement;
        if (navElem) {
            navElem.textContent = input.value;
        }

        // And now save this for posterity
        saveTags();
    }
}

function handleAdrenalineChange(event: Event) {
    const input = event.target as HTMLInputElement;

    // Update the value label
    const adrenalineValue = document.getElementById("adrenalineValue");
    if (adrenalineValue) {
        adrenalineValue.textContent = parseFloat(input.value).toFixed(2);
    }

    const tagIdInput = document.getElementById("editId") as HTMLInputElement;
    if (tagIdInput) {
        const tagId: Number = parseInt(tagIdInput.value);
        // Now we need to find the tag with the corresponding id
        tags.forEach((tag) => {
            if (tag.id === tagId) {
                tag.adrenaline = parseFloat(input.value);
            }
        });

        // And now save this for posterity
        saveTags();
    }
}

function handleMask(event: Event) {
    const target = event.target as HTMLInputElement;
    const id = parseInt(target.id.split("_")[1]);
    const mask = document.getElementById("mask_" + id);

    // Update global mask visibility preference
    showMask = target.checked;

    if (mask) {
        if (target.checked) {
            mask.classList.add("show");
        } else {
            mask.classList.remove("show");
        }
    }
}

function handleZoomMask(event: Event) {
    const target = event.target as HTMLInputElement;
    const mask = document.getElementById("zoomEpMask");

    // Update global mask visibility preference
    showMask = target.checked;

    if (mask) {
        if (target.checked) {
            mask.classList.add("show");
        } else {
            mask.classList.remove("show");
        }
    }
}

function renderPoints(layerId: number, jsonStr: string) {
    // console.log(layerId);
    // console.log(jsonStr);
    const ta = document.getElementById(
        "textarea_layer_" + layerId,
    ) as HTMLTextAreaElement;

    const vis = document.getElementById("pc_" + layerId);
    if (vis) {
        try {
            const excitationData: ExcitationData[] = JSON.parse(jsonStr);

            // Clamp all sizes to valid range (3-7)
            const clampedData = excitationData.map(clampExcitationSize);

            vis.innerHTML = "";

            // Create array with original indices before sorting
            const indexedData = clampedData.map((epd, originalIndex) => ({
                ...epd,
                originalIndex,
            }));

            // Now sort on intensity
            indexedData.sort((a, b) => a.intensity - b.intensity);

            // Find max size for z-index calculation
            const maxSize = Math.max(...indexedData.map((epd) => epd.size), 7);

            // console.log("boe2");
            indexedData.forEach((epd) => {
                // Limit size to maximum 7 for display
                const displaySize = Math.min(epd.size, 7);
                const x = 200 + epd.x - displaySize;
                const y = 200 - epd.y - displaySize;
                const isSelected =
                    selectedPointIndex === epd.originalIndex &&
                    selectedLayerId === layerId;
                const zIndex = isSelected ? 200 : maxSize - epd.size;
                const opacity =
                    selectedPointIndex !== null &&
                    selectedLayerId === layerId &&
                    !isSelected
                        ? 0.9
                        : 1;

                vis.insertAdjacentHTML(
                    "beforeend",
                    `
          <div class="excitation-point"
               data-index="${epd.originalIndex}"
               data-layer="${layerId}"
               draggable="true"
               ondragstart="handleDragStart(event)"
               ondrag="handleDrag(event)"
               ondragend="handleDragEnd(event)"
               onclick="selectExcitationPoint(event)"
               style="
            top:${y}px;
            left:${x}px;
            width:${displaySize * 2}px;
            height:${displaySize * 2}px;
            background-color: ${intensityPalette[epd.intensity]};
            cursor: move;
            z-index: ${zIndex};
            opacity: ${opacity};
          "></div>
`,
                ); //
            });

            if (ta) {
                ta.classList.remove("error");
            }

            // Now write this to the tags collection
            // First we need to find the tag id of the current tag
            const tagIdInput = document.getElementById(
                "editId",
            ) as HTMLInputElement;
            if (tagIdInput) {
                const tagId: Number = parseInt(tagIdInput.value);
                // Now we need to find the tag with the corresponding id
                tags.forEach((tag) => {
                    if (tag.id === tagId) {
                        tag.setLayers(layerId, excitationData);
                    }
                });

                // And now save this for posterity
                saveTags();
            }
        } catch (error) {
            if (ta) {
                ta.classList.add("error");
            }
        }
    }
}

// ================================================================== //
//                                                                    //
//                                                                    //
//                                                                    //
// Everything around the creation of the C-style arrays               //
//                                                                    //
// ================================================================== //
function hideOverlay(event: Event) {
    const source = event.target as HTMLElement;
    if (source.id == "overlayMask") {
        source.style.display = "none";
    }
}

function generateStimuliArray() {
    const overlay = document.getElementById("overlayMask") as HTMLDivElement;
    if (overlay) {
        overlay.style.display = "block";

        const textarea = document.getElementById(
            "output",
        ) as HTMLTextAreaElement;
        if (textarea) {
            textarea.style.display = "block";
            var txt = "";
            stimuli.forEach((stim) => {
                const descComment = stim.description
                    ? ` // ${stim.description.replace(/\n/g, " ")}`
                    : "";
                txt += `
  {
    ${stim.id},
    ${stim.file.replace(".jpg", "")},
    sizeof(${stim.file.replace(".jpg", "")}),
    {${stim.tags.join(",")}}
  },${descComment}`;
            });
            textarea.value = txt;
        }
    }
}

function generateTagsArray() {
    const overlay = document.getElementById("overlayMask") as HTMLDivElement;
    if (overlay) {
        overlay.style.display = "block";

        const textarea = document.getElementById(
            "output",
        ) as HTMLTextAreaElement;
        if (textarea) {
            textarea.style.display = "block";
            var txt = "";
            tags.forEach((tag) => {
                const layer17: Layer | null = tag.getLayer(17);
                var epTxt = "{";
                if (layer17) {
                    layer17.excitationData.forEach((ep) => {
                        epTxt += `\n      {17, ${ep.x.toString().padStart(3)}, ${ep.y
                            .toString()
                            .padStart(
                                3,
                            )}, ${ep.intensity.toString().padStart(2)}, ${ep.size
                            .toString()
                            .padStart(2)}},`;
                    });
                }
                epTxt += "\n    }\n";
                txt += `\n  {\n    ${tag.id},\n    "${tag.name}",\n    ${tag.adrenaline},\n    ${epTxt}  },`;
            });
            textarea.value = txt;
        }
    }
}

// ================================================================== //
//                                                                    //
//                                                                    //
//                                                                    //
// File-based data persistence via API (with localStorage migration)  //
//                                                                    //
// ================================================================== //

// Function to read tags from file (with localStorage fallback)
async function readTags(): Promise<void> {
    try {
        // Try to load from API first (Tehuti XL format)
        const response = await fetch("/api/tags");
        if (response.ok) {
            const tagsJSON = await response.text();
            const tehutiTags: {
                id: number;
                name: string;
                adrenaline: number;
                excitationData: {
                    x: number;
                    y: number;
                    intensity: number;
                    size: number;
                }[];
            }[] = JSON.parse(tagsJSON);

            // Convert Tehuti XL format to internal format (denormalize and put in layer 17)
            tags = tehutiTags.map((tagData) => {
                // Create 24 layers, with layer 17 containing the excitation data
                const layers: LayerData[] = [];
                for (let i = 1; i <= 24; i++) {
                    if (i === 17) {
                        // Denormalize coordinates (*200) for layer 17
                        // Convert old size range (5-10) to new range (3-7): new_size = old_size - 5
                        layers.push({
                            layerId: 17,
                            excitationData: tagData.excitationData.map((ep) => {
                                const denormalizedSize = Math.round(
                                    ep.size * 200,
                                );
                                // Convert size: if > 7, apply formula new_size = old_size - 5
                                const convertedSize =
                                    denormalizedSize > 7
                                        ? denormalizedSize - 5
                                        : denormalizedSize;
                                return {
                                    x: Math.round(ep.x * 200),
                                    y: Math.round(ep.y * 200),
                                    intensity: ep.intensity,
                                    size: Math.max(
                                        3,
                                        Math.min(7, convertedSize),
                                    ),
                                };
                            }),
                        });
                    } else {
                        // Empty layers for other layer IDs
                        layers.push({
                            layerId: i,
                            excitationData: [],
                        });
                    }
                }

                return new Tag(
                    tagData.id,
                    tagData.name,
                    tagData.adrenaline,
                    layers,
                );
            });
            console.log("✅ Tags loaded from file");
            return;
        }
    } catch (error) {
        console.log("⚠️ Could not load from API, trying localStorage...");
    }

    // Fallback to localStorage and migrate
    const tagsJSON = localStorage.getItem("tags");
    if (!tagsJSON) {
        tags = exampleTags;
        console.log("📝 Using example tags");
    } else {
        const tagsData: {
            id: number;
            name: string;
            adrenaline: number;
            layers: LayerData[];
        }[] = JSON.parse(tagsJSON);

        // Convert old intensity scale to new scale (0-10) and size scale (5-10 to 3-7)
        tagsData.forEach((tagData) => {
            tagData.layers.forEach((layer) => {
                layer.excitationData.forEach((point) => {
                    if (point.intensity > 10) {
                        point.intensity = Math.round(
                            (point.intensity / 63) * 10,
                        );
                    }
                    // Convert size: if > 7, apply formula new_size = old_size - 5
                    if (point.size > 7) {
                        point.size = Math.max(3, Math.min(7, point.size - 5));
                    }
                });
            });
        });

        tags = tagsData.map(
            (tagData) =>
                new Tag(
                    tagData.id,
                    tagData.name,
                    tagData.adrenaline,
                    tagData.layers,
                ),
        );
        console.log("📦 Migrating tags from localStorage to file...");
        // Migrate to file storage
        await saveTags();
    }
}

// Function to write tags to file (Tehuti XL format)
async function saveTags(): Promise<void> {
    try {
        // Convert to Tehuti XL export format (layer 17 only, normalized)
        const tehutiExport = tags.map((tag) => {
            const layer17 = tag.layers.find((layer) => layer.layerId === 17);

            if (!layer17) {
                return {
                    id: tag.id,
                    name: tag.name,
                    adrenaline: tag.adrenaline,
                    excitationData: [],
                };
            }

            return {
                id: tag.id,
                name: tag.name,
                adrenaline: tag.adrenaline,
                excitationData: layer17.excitationData
                    .map((data) => {
                        const clampedSize = Math.max(3, Math.min(7, data.size));
                        return {
                            x: Math.round((data.x / 200) * 10000) / 10000,
                            y: Math.round((data.y / 200) * 10000) / 10000,
                            intensity: data.intensity,
                            size:
                                Math.round((clampedSize / 200) * 10000) / 10000,
                        };
                    })
                    .sort((a, b) => b.size - a.size),
            };
        });

        const response = await fetch("/api/tags", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tehutiExport, null, 2),
        });
        if (!response.ok) {
            console.error("Failed to save tags");
        }
    } catch (error) {
        console.error("Error saving tags:", error);
    }
}

async function saveStimuli(): Promise<void> {
    try {
        // Convert to Tehuti XL photos format (with optional id for internal use)
        const photosExport = {
            photos: stimuli.map((stimulus) => ({
                id: stimulus.id, // Keep ID for internal consistency
                photo: stimulus.file,
                tags: stimulus.tags,
                description: stimulus.description || "",
            })),
        };

        const response = await fetch("/api/stimuli", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(photosExport, null, 2),
        });
        if (!response.ok) {
            console.error("Failed to save stimuli");
        }
    } catch (error) {
        console.error("Error saving stimuli:", error);
    }
}

// readStimuli is no longer needed - stimuli are auto-discovered
// Removed to avoid unused function warning

// ================================================================== //
//                                                                    //
//                                                                    //
//                                                                    //
// Export/Import Functionality                                        //
//                                                                    //
// ================================================================== //

/**
 * Export complete dataset as JSON file
 * Normalizes x, y, and size values by dividing by 200 (half the MRI image width/height)
 */
function exportData(): void {
    const dataExport: DataExport = {
        version: "2.0.0",
        exportDate: new Date().toISOString(),
        tags: tags.map((tag) => ({
            id: tag.id,
            name: tag.name,
            adrenaline: tag.adrenaline,
            layers: tag.layers.map((layer) => ({
                layerId: layer.layerId,
                excitationData: layer.excitationData.map((data) => ({
                    x: data.x / 200,
                    y: data.y / 200,
                    intensity: data.intensity,
                    size: data.size / 200,
                })),
            })),
        })),
        stimuli: stimuli,
    };

    const dataStr = JSON.stringify(dataExport, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `tehuti-stimeditor-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log("Data exported successfully");
}

/**
 * Export tags for Tehuti XL (layer 17 only, normalized coordinates)
 */
function exportTehutiXL(): void {
    const tehutiExport = tags.map((tag) => {
        // Find layer 17
        const layer17 = tag.layers.find((layer) => layer.layerId === 17);

        if (!layer17) {
            return {
                id: tag.id,
                name: tag.name,
                adrenaline: tag.adrenaline,
                excitationData: [],
            };
        }

        return {
            id: tag.id,
            name: tag.name,
            adrenaline: tag.adrenaline,
            excitationData: layer17.excitationData
                .map((data) => {
                    // Clamp size to valid range (3-7)
                    const clampedSize = Math.max(3, Math.min(7, data.size));
                    return {
                        x: Math.round((data.x / 200) * 10000) / 10000,
                        y: Math.round((data.y / 200) * 10000) / 10000,
                        intensity: data.intensity,
                        size: Math.round((clampedSize / 200) * 10000) / 10000,
                    };
                })
                .sort((a, b) => b.size - a.size),
        };
    });

    const dataStr = JSON.stringify(tehutiExport, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `tehuti-xl-tags-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log("Tehuti XL tags exported successfully");
}

/**
 * Export photos and tags for Tehuti XL
 */
function exportPhotosAndTags(): void {
    const photosExport = {
        photos: stimuli.map((stimulus) => ({
            photo: stimulus.file,
            tags: stimulus.tags,
            description: stimulus.description || "",
        })),
    };

    const dataStr = JSON.stringify(photosExport, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `tehuti-xl-photos-tags-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log("Tehuti XL photos and tags exported successfully");
}

/**
 * Import dataset from JSON file
 */
function importData(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";

    input.onchange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];

        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt: ProgressEvent<FileReader>) => {
            try {
                const content = evt.target?.result as string;
                const importedData: DataExport = JSON.parse(content);

                // Validate import data
                if (!importedData.tags || !importedData.stimuli) {
                    throw new Error("Invalid data format");
                }

                // Import tags
                tags = importedData.tags.map(
                    (tagData: SerializedTag) =>
                        new Tag(
                            tagData.id,
                            tagData.name,
                            tagData.adrenaline,
                            tagData.layers,
                        ),
                );

                // Import stimuli
                stimuli = importedData.stimuli;

                // Save to localStorage
                saveTags();
                saveStimuli();

                // Refresh display
                displayTags();
                displayStimuli();

                alert(
                    `Data imported successfully!\nVersion: ${importedData.version}\nExport date: ${new Date(importedData.exportDate).toLocaleString()}`,
                );
            } catch (error) {
                console.error("Import failed:", error);
                alert("Failed to import data. Please check the file format.");
            }
        };

        reader.readAsText(file);
    };

    input.click();
}

// ================================================================== //
//                                                                    //
//                                                                    //
//                                                                    //
// Drag and Drop for Excitation Points                               //
//                                                                    //
// ================================================================== //

let draggedElement: HTMLElement | null = null;
// @ts-ignore - isDragging is used in drag handlers
let isDragging = false;
let selectedPointIndex: number | null = null;
let selectedLayerId: number | null = null;

function addExcitationPoint(layerId: number) {
    const ta = document.getElementById(
        `textarea_layer_${layerId}`,
    ) as HTMLTextAreaElement;
    if (!ta) return;

    try {
        const excitationData: ExcitationData[] = JSON.parse(ta.value);
        // Add new point at center with constrained random values
        const { intensity, size } = generateIntensityAndSize();
        const newPoint = {
            x: 0,
            y: 0,
            intensity,
            size,
        };
        excitationData.push(newPoint);
        const newIndex = excitationData.length - 1;

        // Update textarea
        ta.value = JSON.stringify(excitationData)
            .replace(/},{/g, "},\n  {")
            .replace(/\[{/g, "[\n  {")
            .replace(/}\]/g, "}\n]");

        // Add new point to DOM directly (no render)
        const pointContainer = document.getElementById(`pc_${layerId}`);
        if (pointContainer) {
            // Find max size for z-index calculation
            const maxSize = Math.max(
                ...excitationData.map((ep) => ep.size),
                25,
            );

            // Set all existing points to non-selected state with correct z-index
            const allPoints =
                pointContainer.querySelectorAll(".excitation-point");
            allPoints.forEach((point) => {
                const el = point as HTMLElement;
                const pointIndex = parseInt(el.dataset.index || "0");
                const pointData = excitationData[pointIndex];
                if (pointData) {
                    el.style.zIndex = String(maxSize - pointData.size);
                }
                el.style.opacity = "0.6";
            });

            // Add new point element
            const x = 200 + newPoint.x - newPoint.size;
            const y = 200 - newPoint.y - newPoint.size;
            pointContainer.insertAdjacentHTML(
                "beforeend",
                `
          <div class="excitation-point"
               data-index="${newIndex}"
               data-layer="${layerId}"
               draggable="true"
               ondragstart="handleDragStart(event)"
               ondrag="handleDrag(event)"
               ondragend="handleDragEnd(event)"
               onclick="selectExcitationPoint(event)"
               style="
            top:${y}px;
            left:${x}px;
            width:${newPoint.size * 2}px;
            height:${newPoint.size * 2}px;
            background-color: ${intensityPalette[newPoint.intensity]};
            cursor: move;
            z-index: 200;
            opacity: 1;
          "></div>
`,
            );
        }

        // Add new editor to list directly (no render)
        const listContainer = document.getElementById(`pointsList_${layerId}`);
        if (listContainer) {
            // Update all existing editors to non-selected
            const allEditors = listContainer.querySelectorAll(".point-editor");
            allEditors.forEach((editor) => {
                editor.classList.remove("selected");
            });

            // Add new editor
            listContainer.insertAdjacentHTML(
                "beforeend",
                `
        <div class="point-editor selected" data-index="${newIndex}" onclick="selectExcitationPointFromList(${layerId}, ${newIndex})" style="cursor: pointer;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem;">
            <strong>Point ${newIndex}</strong>
            <button onclick="event.stopPropagation(); deleteExcitationPoint(${layerId}, ${newIndex})" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; background: #f44336; color: white; border: none; cursor: pointer;">✕</button>
          </div>
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 0.3rem; font-size: 0.8rem;">
            <label>x: ${newPoint.x}</label>
            <span>y: ${newPoint.y}</span>
            <label for="intensity_${layerId}_${newIndex}">Intensity:</label>
            <input type="range" id="intensity_${layerId}_${newIndex}" min="0" max="10" value="${newPoint.intensity}"
                   oninput="updatePointProperty(${layerId}, ${newIndex}, 'intensity', this.value)"
                   onclick="event.stopPropagation()"
                   style="width: 100%;">
            <label for="size_${layerId}_${newIndex}">Size:</label>
            <input type="range" id="size_${layerId}_${newIndex}" min="3" max="7" value="${newPoint.size}"
                   oninput="updatePointProperty(${layerId}, ${newIndex}, 'size', this.value)"
                   onclick="event.stopPropagation()"
                   style="width: 100%;">
          </div>
        </div>
      `,
            );
        }

        // Update selection state
        selectedPointIndex = newIndex;
        selectedLayerId = layerId;

        // Save to storage
        const tagIdInput = document.getElementById(
            "editId",
        ) as HTMLInputElement;
        if (tagIdInput) {
            const tagId: Number = parseInt(tagIdInput.value);
            tags.forEach((tag) => {
                if (tag.id === tagId) {
                    tag.setLayers(layerId, excitationData);
                }
            });
            saveTags();
        }
    } catch (error) {
        console.error("Failed to add point:", error);
    }
}

function selectExcitationPoint(event: Event) {
    const target = event.target as HTMLElement;
    const index = parseInt(target.dataset.index || "0");
    const layerId = parseInt(target.dataset.layer || "0");

    // Update visual feedback directly without re-rendering
    const visualizer = document.getElementById(`vis_${layerId}`);
    if (visualizer) {
        // Get excitation data for z-index calculation
        const ta = document.getElementById(
            `textarea_layer_${layerId}`,
        ) as HTMLTextAreaElement;
        if (ta) {
            try {
                const excitationData: ExcitationData[] = JSON.parse(ta.value);
                const maxSize = Math.max(
                    ...excitationData.map((ep) => ep.size),
                    25,
                );

                // Reset previous selected point (if different)
                if (
                    selectedPointIndex !== null &&
                    selectedLayerId === layerId &&
                    selectedPointIndex !== index
                ) {
                    const prevPoint = visualizer.querySelector(
                        `.excitation-point[data-index="${selectedPointIndex}"]`,
                    ) as HTMLElement;
                    if (prevPoint && excitationData[selectedPointIndex]) {
                        prevPoint.style.zIndex = String(
                            maxSize - excitationData[selectedPointIndex].size,
                        );
                        prevPoint.style.opacity = "0.9";
                    }
                }
            } catch (error) {
                console.error("Failed to parse excitation data:", error);
            }
        }

        // Highlight new selected point
        target.style.zIndex = "200";
        target.style.opacity = "1";
    }

    selectedPointIndex = index;
    selectedLayerId = layerId;

    // Update list without re-rendering points
    renderPointsList(layerId);
}

function handleDragStart(event: DragEvent) {
    isDragging = true;
    draggedElement = event.target as HTMLElement;
    if (draggedElement && event.dataTransfer) {
        const layerId = parseInt(draggedElement.dataset.layer || "0");
        const index = parseInt(draggedElement.dataset.index || "0");

        // Hide the default drag ghost image
        const emptyImage = new Image();
        emptyImage.src =
            "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        event.dataTransfer.setDragImage(emptyImage, 0, 0);

        // Select this point
        const visualizer = document.getElementById(`vis_${layerId}`);
        if (visualizer) {
            // Get excitation data for z-index calculation
            const ta = document.getElementById(
                `textarea_layer_${layerId}`,
            ) as HTMLTextAreaElement;
            if (ta) {
                try {
                    const excitationData: ExcitationData[] = JSON.parse(
                        ta.value,
                    );
                    const maxSize = Math.max(
                        ...excitationData.map((ep) => ep.size),
                        25,
                    );

                    // Reset previous selected point (if different)
                    if (
                        selectedPointIndex !== null &&
                        selectedLayerId === layerId &&
                        selectedPointIndex !== index
                    ) {
                        const prevPoint = visualizer.querySelector(
                            `.excitation-point[data-index="${selectedPointIndex}"]`,
                        ) as HTMLElement;
                        if (prevPoint && excitationData[selectedPointIndex]) {
                            prevPoint.style.zIndex = String(
                                maxSize -
                                    excitationData[selectedPointIndex].size,
                            );
                            prevPoint.style.opacity = "0.6";
                        }
                    }
                } catch (error) {
                    console.error("Failed to parse excitation data:", error);
                }
            }
        }

        // Update selection state
        selectedPointIndex = index;
        selectedLayerId = layerId;

        // Set dragged element appearance
        draggedElement.style.opacity = "0.8";
        draggedElement.style.zIndex = "200";

        // Update points list to show selected point editor
        renderPointsList(layerId);

        // Add mousemove listener to track during drag (ondrag is unreliable)
        document.addEventListener("dragover", handleDragOver);
    }
}

function handleDragOver(event: DragEvent) {
    event.preventDefault(); // Required to allow drop

    if (!draggedElement || event.clientX === 0 || event.clientY === 0) return;

    const target = draggedElement;
    const layerId = parseInt(target.dataset.layer || "0");
    const index = parseInt(target.dataset.index || "0");
    const visualizer = document.getElementById(`vis_${layerId}`);

    if (!visualizer) return;

    const rect = visualizer.getBoundingClientRect();

    // Calculate new position
    const x = event.clientX - rect.left - 200;
    const y = -(event.clientY - rect.top - 200);

    const ta = document.getElementById(
        `textarea_layer_${layerId}`,
    ) as HTMLTextAreaElement;

    if (!ta) return;

    try {
        const excitationData: ExcitationData[] = JSON.parse(ta.value);
        const point = excitationData[index];

        const newX = 200 + Math.round(x) - point.size;
        const newY = 200 - Math.round(y) - point.size;

        // Update DOM position immediately (no lag)
        target.style.left = `${newX}px`;
        target.style.top = `${newY}px`;

        // Update data in memory
        point.x = Math.round(x);
        point.y = Math.round(y);

        // Trigger throttled updates for JSON/list (NO renderPoints!)
        throttledDragUpdate(layerId, excitationData);
    } catch (error) {
        // Ignore errors during drag
    }
}

function handleDrag(event: DragEvent) {
    const target = event.target as HTMLElement;
    if (!target || event.clientX === 0 || event.clientY === 0) return;

    const layerId = parseInt(target.dataset.layer || "0");
    const index = parseInt(target.dataset.index || "0");
    const visualizer = document.getElementById(`vis_${layerId}`);

    if (!visualizer) return;

    const rect = visualizer.getBoundingClientRect();

    // Calculate new position
    const x = event.clientX - rect.left - 200;
    const y = -(event.clientY - rect.top - 200);

    const ta = document.getElementById(
        `textarea_layer_${layerId}`,
    ) as HTMLTextAreaElement;

    if (!ta) return;

    try {
        const excitationData: ExcitationData[] = JSON.parse(ta.value);
        const point = excitationData[index];

        const newX = 200 + Math.round(x) - point.size;
        const newY = 200 - Math.round(y) - point.size;

        // Update DOM position immediately (no lag)
        target.style.left = `${newX}px`;
        target.style.top = `${newY}px`;

        // Update data in memory
        point.x = Math.round(x);
        point.y = Math.round(y);

        console.log(
            `handleDrag: point[${index}] position updated to (${point.x}, ${point.y})`,
        );

        // Trigger throttled updates for JSON/list (NO renderPoints!)
        throttledDragUpdate(layerId, excitationData);
    } catch (error) {
        // Ignore errors during drag
    }
}

function handleDragEnd(event: DragEvent) {
    const target = event.target as HTMLElement;
    if (!target) return;

    // Restore opacity based on selection state
    const layerId = parseInt(target.dataset.layer || "0");
    const index = parseInt(target.dataset.index || "0");
    const isSelected =
        selectedPointIndex === index && selectedLayerId === layerId;
    target.style.opacity = isSelected ? "1" : "0.6";

    const visualizer = document.getElementById(`vis_${layerId}`);
    if (!visualizer) return;

    const rect = visualizer.getBoundingClientRect();

    // Calculate final position
    const x = event.clientX - rect.left - 200;
    const y = -(event.clientY - rect.top - 200);

    const ta = document.getElementById(
        `textarea_layer_${layerId}`,
    ) as HTMLTextAreaElement;

    if (ta) {
        try {
            const excitationData: ExcitationData[] = JSON.parse(ta.value);
            const point = excitationData[index];
            point.x = Math.round(x);
            point.y = Math.round(y);

            // Final update: JSON, list, and storage (NO renderPoints!)
            throttledDragUpdate(layerId, excitationData);
        } catch (error) {
            console.error("Failed to update point position:", error);
        }
    }

    draggedElement = null;
    isDragging = false;

    // Remove dragover listener
    document.removeEventListener("dragover", handleDragOver);
}

function renderPointsList(layerId: number) {
    const listContainer = document.getElementById(`pointsList_${layerId}`);
    const ta = document.getElementById(
        `textarea_layer_${layerId}`,
    ) as HTMLTextAreaElement;

    if (!listContainer || !ta) return;

    try {
        const excitationData: ExcitationData[] = JSON.parse(ta.value);
        listContainer.innerHTML =
            "<h4 style='margin: 0 0 0.5rem 0; font-size: 0.9rem;'>Excitation Points</h4>";

        excitationData.forEach((point, index) => {
            const isSelected =
                selectedPointIndex === index && selectedLayerId === layerId;
            listContainer.insertAdjacentHTML(
                "beforeend",
                `
        <div class="point-editor ${isSelected ? "selected" : ""}" data-index="${index}" onclick="selectExcitationPointFromList(${layerId}, ${index})" style="cursor: pointer;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem;">
            <strong>Point ${index}</strong>
            <button onclick="event.stopPropagation(); deleteExcitationPoint(${layerId}, ${index})" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; background: #f44336; color: white; border: none; cursor: pointer;">✕</button>
          </div>
          <div style="display: grid; grid-template-columns: auto 1fr auto; gap: 0.3rem 0.5rem; font-size: 0.8rem; align-items: center;">
            <label>x: ${point.x}</label>
            <span style="grid-column: 2 / 4;">y: ${point.y}</span>
            <label for="intensity_${layerId}_${index}">Intensity:</label>
            <input type="range" id="intensity_${layerId}_${index}" min="0" max="10" value="${point.intensity}"
                   oninput="updatePointProperty(${layerId}, ${index}, 'intensity', this.value)"
                   onclick="event.stopPropagation()"
                   style="width: 100%;">
            <span id="intensity_value_${layerId}_${index}" style="min-width: 2rem; text-align: right;">${point.intensity}</span>
            <label for="size_${layerId}_${index}">Size:</label>
            <input type="range" id="size_${layerId}_${index}" min="3" max="7" value="${point.size}"
                   oninput="updatePointProperty(${layerId}, ${index}, 'size', this.value)"
                   onclick="event.stopPropagation()"
                   style="width: 100%;">
            <span id="size_value_${layerId}_${index}" style="min-width: 2rem; text-align: right;">${point.size}</span>
          </div>
        </div>
      `,
            );
        });
    } catch (error) {
        console.error("Failed to render points list:", error);
    }
}

function selectExcitationPointFromList(layerId: number, index: number) {
    // Update visual feedback directly without re-rendering
    const visualizer = document.getElementById(`vis_${layerId}`);
    if (visualizer) {
        // Get excitation data for z-index calculation
        const ta = document.getElementById(
            `textarea_layer_${layerId}`,
        ) as HTMLTextAreaElement;
        if (ta) {
            try {
                const excitationData: ExcitationData[] = JSON.parse(ta.value);
                const maxSize = Math.max(
                    ...excitationData.map((ep) => ep.size),
                    25,
                );

                // Reset previous selected point (if different)
                if (
                    selectedPointIndex !== null &&
                    selectedLayerId === layerId &&
                    selectedPointIndex !== index
                ) {
                    const prevPoint = visualizer.querySelector(
                        `.excitation-point[data-index="${selectedPointIndex}"]`,
                    ) as HTMLElement;
                    if (prevPoint && excitationData[selectedPointIndex]) {
                        prevPoint.style.zIndex = String(
                            maxSize - excitationData[selectedPointIndex].size,
                        );
                        prevPoint.style.opacity = "0.6";
                    }
                }

                // Highlight new selected point
                const newPoint = visualizer.querySelector(
                    `.excitation-point[data-index="${index}"]`,
                ) as HTMLElement;
                if (newPoint) {
                    newPoint.style.zIndex = "200";
                    newPoint.style.opacity = "1";
                }
            } catch (error) {
                console.error("Failed to parse excitation data:", error);
            }
        }
    }

    selectedPointIndex = index;
    selectedLayerId = layerId;

    // Update list without re-rendering points
    renderPointsList(layerId);
}

function updatePointProperty(
    layerId: number,
    index: number,
    property: "intensity" | "size",
    value: string,
) {
    const ta = document.getElementById(
        `textarea_layer_${layerId}`,
    ) as HTMLTextAreaElement;

    if (!ta) return;

    try {
        const excitationData: ExcitationData[] = JSON.parse(ta.value);
        const point = excitationData[index];
        const numValue = parseInt(value);
        point[property] = numValue;

        // Update the value label immediately
        const valueLabel = document.getElementById(
            `${property}_value_${layerId}_${index}`,
        );
        if (valueLabel) {
            valueLabel.textContent = value;
        }

        // Select this point if not already selected
        if (selectedPointIndex !== index || selectedLayerId !== layerId) {
            // Update visual feedback on visualizer
            const visualizer = document.getElementById(`vis_${layerId}`);
            if (visualizer) {
                const maxSize = Math.max(
                    ...excitationData.map((ep) => ep.size),
                    25,
                );

                // Reset previous selected point
                if (
                    selectedPointIndex !== null &&
                    selectedLayerId === layerId
                ) {
                    const prevPoint = visualizer.querySelector(
                        `.excitation-point[data-index="${selectedPointIndex}"]`,
                    ) as HTMLElement;
                    if (prevPoint && excitationData[selectedPointIndex]) {
                        prevPoint.style.zIndex = String(
                            maxSize - excitationData[selectedPointIndex].size,
                        );
                        prevPoint.style.opacity = "0.6";
                    }
                }

                // Highlight new selected point
                const newPoint = visualizer.querySelector(
                    `.excitation-point[data-index="${index}"]`,
                ) as HTMLElement;
                if (newPoint) {
                    newPoint.style.zIndex = "200";
                    newPoint.style.opacity = "1";
                }
            }

            // Update selected state
            selectedPointIndex = index;
            selectedLayerId = layerId;

            // Update list styling
            const listContainer = document.getElementById(
                `pointsList_${layerId}`,
            );
            if (listContainer) {
                const allEditors =
                    listContainer.querySelectorAll(".point-editor");
                allEditors.forEach((editor, idx) => {
                    if (idx === index) {
                        editor.classList.add("selected");
                    } else {
                        editor.classList.remove("selected");
                    }
                });
            }
        }

        // Update DOM immediately for visual feedback
        const pointElement = document.querySelector(
            `.excitation-point[data-index="${index}"][data-layer="${layerId}"]`,
        ) as HTMLElement;

        if (pointElement) {
            if (property === "size") {
                // Update size and reposition
                const x = 200 + point.x - numValue;
                const y = 200 - point.y - numValue;
                pointElement.style.width = `${numValue * 2}px`;
                pointElement.style.height = `${numValue * 2}px`;
                pointElement.style.left = `${x}px`;
                pointElement.style.top = `${y}px`;
                // Update z-index based on size (inverse relation)
                const maxSize = Math.max(
                    ...excitationData.map((ep) => ep.size),
                    25,
                );
                const isSelected =
                    selectedPointIndex === index && selectedLayerId === layerId;
                pointElement.style.zIndex = isSelected
                    ? "200"
                    : String(maxSize - numValue);
            } else if (property === "intensity") {
                // Update color
                pointElement.style.backgroundColor = intensityPalette[numValue];
            }
        }

        // Update textarea (throttled)
        ta.value = JSON.stringify(excitationData)
            .replace(/},{/g, "},\n  {")
            .replace(/\[{/g, "[\n  {")
            .replace(/}\]/g, "}\n]");

        // Save to storage (throttled)
        throttledStorageSave(layerId, excitationData);
    } catch (error) {
        console.error("Failed to update point property:", error);
    }
}

// Throttled storage save to avoid performance issues
const throttledStorageSave = throttle(
    (layerId: number, excitationData: ExcitationData[]) => {
        const tagIdInput = document.getElementById(
            "editId",
        ) as HTMLInputElement;
        if (tagIdInput) {
            const tagId: Number = parseInt(tagIdInput.value);
            tags.forEach((tag) => {
                if (tag.id === tagId) {
                    tag.setLayers(layerId, excitationData);
                }
            });
            saveTags();
        }
    },
    300,
);

// Throttled drag update - updates JSON, list, and storage (NO renderPoints!)
const throttledDragUpdate = throttle(
    (layerId: number, excitationData: ExcitationData[]) => {
        const ta = document.getElementById(
            `textarea_layer_${layerId}`,
        ) as HTMLTextAreaElement;

        if (ta) {
            // Update textarea JSON
            ta.value = JSON.stringify(excitationData)
                .replace(/},{/g, "},\n  {")
                .replace(/\[{/g, "[\n  {")
                .replace(/}\]/g, "}\n]");

            // Update list to show new coordinates
            renderPointsList(layerId);

            // Save to storage
            const tagIdInput = document.getElementById(
                "editId",
            ) as HTMLInputElement;
            if (tagIdInput) {
                const tagId: Number = parseInt(tagIdInput.value);
                tags.forEach((tag) => {
                    if (tag.id === tagId) {
                        tag.setLayers(layerId, excitationData);
                    }
                });
                saveTags();
            }
        }
    },
    100,
);

function deleteExcitationPoint(layerId: number, index: number) {
    const ta = document.getElementById(
        `textarea_layer_${layerId}`,
    ) as HTMLTextAreaElement;

    if (!ta) return;

    try {
        const excitationData: ExcitationData[] = JSON.parse(ta.value);
        excitationData.splice(index, 1);

        // Clear selection if deleting selected point
        if (selectedPointIndex === index && selectedLayerId === layerId) {
            selectedPointIndex = null;
            selectedLayerId = null;
        } else if (
            selectedPointIndex !== null &&
            selectedPointIndex > index &&
            selectedLayerId === layerId
        ) {
            // Adjust selection index if deleting point before selected
            selectedPointIndex--;
        }

        // Update textarea
        ta.value = JSON.stringify(excitationData)
            .replace(/},{/g, "},\n  {")
            .replace(/\[{/g, "[\n  {")
            .replace(/}\]/g, "}\n]");

        // Trigger update
        renderPoints(layerId, ta.value);
        renderPointsList(layerId);
    } catch (error) {
        console.error("Failed to delete point:", error);
    }
}

// ================================================================== //
//                                                                    //
//                                                                    //
//                                                                    //
// Expose functions to global scope for HTML handlers                //
//                                                                    //
// ================================================================== //

// Expose all functions that are called from HTML onclick/onchange handlers
const windowWithHandlers = window as any as WindowWithHandlers;
windowWithHandlers.throttledKeyUpHandler = throttledKeyUpHandler;
windowWithHandlers.addTag = addTag;
windowWithHandlers.addStimuli = addStimuli;
windowWithHandlers.generateTagsArray = generateTagsArray;
windowWithHandlers.generateStimuliArray = generateStimuliArray;
windowWithHandlers.handleNameChange = handleNameChange;
windowWithHandlers.handleAdrenalineChange = handleAdrenalineChange;
windowWithHandlers.handleStimChecked = handleStimChecked;
windowWithHandlers.handleDescriptionChange = handleDescriptionChange;
windowWithHandlers.handleZoomDescriptionChange = handleZoomDescriptionChange;
windowWithHandlers.handleMask = handleMask;
windowWithHandlers.handleZoomMask = handleZoomMask;
windowWithHandlers.handlePaste = handlePaste;
windowWithHandlers.hideOverlay = hideOverlay;
windowWithHandlers.showImageZoom = showImageZoom;
windowWithHandlers.hideImageZoom = hideImageZoom;
windowWithHandlers.removeTagFromZoomedPhoto = removeTagFromZoomedPhoto;
windowWithHandlers.showPrevZoomImage = showPrevZoomImage;
windowWithHandlers.showNextZoomImage = showNextZoomImage;
windowWithHandlers.handleZoomTagSearchKeydown = handleZoomTagSearchKeydown;
windowWithHandlers.handleZoomTagFilter = handleZoomTagFilter;
windowWithHandlers.clearTagFilters = clearTagFilters;
windowWithHandlers.exportData = exportData;
windowWithHandlers.exportTehutiXL = exportTehutiXL;
windowWithHandlers.exportPhotosAndTags = exportPhotosAndTags;
windowWithHandlers.importData = importData;
windowWithHandlers.addExcitationPoint = addExcitationPoint;
windowWithHandlers.selectExcitationPoint = selectExcitationPoint;
windowWithHandlers.selectExcitationPointFromList =
    selectExcitationPointFromList;
windowWithHandlers.updatePointProperty = updatePointProperty;
windowWithHandlers.deleteExcitationPoint = deleteExcitationPoint;
windowWithHandlers.handleDragStart = handleDragStart;
windowWithHandlers.handleDragStart = handleDragStart;
windowWithHandlers.handleDrag = handleDrag;
windowWithHandlers.handleDragEnd = handleDragEnd;

// ================================================================== //
//                                                                    //
//                                                                    //
//                                                                    //
// Initialize Application                                             //
//                                                                    //
// ================================================================== //

// Listen for the DOMContentLoaded event, then call init
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    // DOMContentLoaded has already fired, call init directly
    init();
}

// ================================================================== //
//                                                                    //
//                                                                    //
//                                                                    //
// Initial Data                                                       //
//                                                                    //
// ================================================================== //

// Note: Stimuli are now auto-discovered from /img/stimuli folder
// No need for hardcoded initial data - files are scanned automatically
// on application startup and kept in sync with localStorage
