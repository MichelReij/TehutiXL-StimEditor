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
    ExcitationPosition,
    Tag,
    Stimulus,
    SerializedTag,
    WindowWithHandlers,
} from "./types";

// Globals vars
let tags: Tag[] = [];
let stimuli: Stimulus[] = [];
let selectedFilterTags: number[] = []; // Tag IDs selected for filtering stimuli
let showMask: boolean = true; // Remember mask visibility preference across tag switches

// Position lookup for excitation images
let excitationPositions: {
    [key: number]: { exc400: ExcitationPosition; exc240: ExcitationPosition };
} = {};

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

// ================================================================== //
//                                                                    //
//                                                                    //
//                                                                    //
// Load excitation position data from CSV files                       //
//                                                                    //
// ================================================================== //

/**
 * Parse CSV line into position object
 */
function parsePositionLine(
    line: string,
): { id: number; position: ExcitationPosition } | null {
    const parts = line.trim().split(",");
    if (parts.length !== 5) return null;

    // Extract ID from filename (exc_001.png -> 1)
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

    return {
        id,
        position: { x, y, width, height },
    };
}

/**
 * Load excitation positions from CSV files
 */
async function loadExcitationPositions(): Promise<void> {
    try {
        // Load exc400 positions
        const response400 = await fetch("/img/exc400/positions.csv");
        const csv400 = await response400.text();

        // Load exc240 positions
        const response240 = await fetch("/img/exc240/positions.csv");
        const csv240 = await response240.text();

        // Parse CSV files (skip header line)
        const lines400 = csv400.split("\n").slice(1);
        const lines240 = csv240.split("\n").slice(1);

        // Build lookup table
        lines400.forEach((line, index) => {
            const parsed400 = parsePositionLine(line);
            if (!parsed400) return;

            // Find matching line in 240px data
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

// Function to initialize the application
async function init() {
    // Load excitation positions from CSV files
    await loadExcitationPositions();
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
 * Render all excitation images from all tags associated with a stimulus
 * in the zoom preview canvas
 */
function renderZoomEPPreview(stimulus: Stimulus) {
    const canvas = document.getElementById("zoomEpCanvas");
    if (!canvas) return;

    // Clear existing excitation images (but keep the mask image)
    const existingImages = canvas.querySelectorAll(".excitation-image");
    existingImages.forEach((img) => img.remove());

    // Get all tags for this stimulus
    const stimulusTags = stimulus.tags
        .map((tagId) => tags.find((t) => t.id === tagId))
        .filter((tag): tag is Tag => tag !== undefined);

    if (stimulusTags.length === 0) return;

    // Render excitation image for each tag
    stimulusTags.forEach((tag) => {
        if (!tag.exc400) return; // Skip if no position data

        const img = document.createElement("img");
        img.className = "excitation-image";
        img.src = `/img/exc400/exc_${String(tag.id).padStart(3, "0")}.png`;
        img.style.position = "absolute";
        img.style.left = `${tag.exc400.x}px`;
        img.style.top = `${tag.exc400.y}px`;
        img.style.width = `${tag.exc400.width}px`;
        img.style.height = `${tag.exc400.height}px`;
        img.style.pointerEvents = "none";

        canvas.appendChild(img);
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
    // Create new tag with next available ID
    const newId = tags.length > 0 ? Math.max(...tags.map((t) => t.id)) + 1 : 1;

    // Look up position data from CSV (if available for this ID)
    const exc400 = excitationPositions[newId]?.exc400;
    const exc240 = excitationPositions[newId]?.exc240;

    const newTag = new Tag(newId, nameHint, 0, exc400, exc240);
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
            layerContainer.innerHTML = ""; // Clear existing content

            // Show excitation preview
            const hasPosition = tag.exc400 !== undefined;
            const excImageSrc = `/img/exc400/exc_${String(tag.id).padStart(3, "0")}.png`;

            layerContainer.insertAdjacentHTML(
                "beforeend",
                `
          <div class="excitation-preview">
            <h3>Excitation Preview (ID: ${tag.id})</h3>
            ${
                hasPosition
                    ? `
            <div class="visualizer" style="position: relative; width: 400px; height: 400px;">
              <img class="mri-background" src="/img/mri/mri_017.jpg" alt="MRI scan" draggable="false" style="position: absolute; width: 400px; height: 400px; top: 0; left: 0;">
              <img class="excitation-image-preview"
                   src="${excImageSrc}"
                   style="position: absolute; left: ${tag.exc400!.x}px; top: ${tag.exc400!.y}px; width: ${tag.exc400!.width}px; height: ${tag.exc400!.height}px;"
                   alt="Excitation pattern">
            </div>
            <div class="position-info">
              <p><strong>400x400:</strong> x=${tag.exc400!.x}, y=${tag.exc400!.y}, w=${tag.exc400!.width}, h=${tag.exc400!.height}</p>
              ${tag.exc240 ? `<p><strong>240px:</strong> x=${tag.exc240.x}, y=${tag.exc240.y}, w=${tag.exc240.width}, h=${tag.exc240.height}</p>` : ""}
            </div>
            `
                    : `
            <p class="no-excitation">No excitation image available for ID ${tag.id}</p>
            `
            }
          </div>
        `,
            );
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

// ================================================================== //
//                                                                    //
//                                                                    //
//                                                                    //
// C-style array generation                                           //
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
                txt += `\n  {\n    ${tag.id},\n    "${tag.name}",\n    ${tag.adrenaline}\n  },`;
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

async function readTags(): Promise<void> {
    try {
        // Try to load from API first
        const response = await fetch("/api/tags");
        if (response.ok) {
            const tagsJSON = await response.text();
            const tagsData: any[] = JSON.parse(tagsJSON);

            // Check if we need to migrate old format
            let needsMigration = false;

            // Convert to Tag objects
            tags = tagsData.map((tagData) => {
                // Check for old format (has excitationData instead of exc400/exc240)
                if (!tagData.exc400 && !tagData.exc240) {
                    needsMigration = true;
                }

                // Use stored position data if available, otherwise look up from CSV
                const exc400 =
                    tagData.exc400 || excitationPositions[tagData.id]?.exc400;
                const exc240 =
                    tagData.exc240 || excitationPositions[tagData.id]?.exc240;

                return new Tag(
                    tagData.id,
                    tagData.name,
                    tagData.adrenaline,
                    exc400,
                    exc240,
                );
            });

            if (needsMigration) {
                console.log(
                    "🔄 Migrating tags to new format (exc400/exc240)...",
                );
                await saveTags();
            }

            console.log("✅ Tags loaded from file");
            return;
        }
    } catch (error) {
        console.log("⚠️ Could not load from API, trying localStorage...");
    }

    // Fallback to localStorage and migrate
    const tagsJSON = localStorage.getItem("tags");
    if (!tagsJSON) {
        tags = [];
        console.log("📝 No existing tags found");
    } else {
        const tagsData: any[] = JSON.parse(tagsJSON);

        // Convert old format to new format (remove layers, add positions)
        tags = tagsData.map((tagData) => {
            const exc400 = excitationPositions[tagData.id]?.exc400;
            const exc240 = excitationPositions[tagData.id]?.exc240;

            return new Tag(
                tagData.id,
                tagData.name,
                tagData.adrenaline,
                exc400,
                exc240,
            );
        });
        await saveTags();
    }
}

async function saveTags(): Promise<void> {
    try {
        // Convert to serialized format
        const serializedTags: SerializedTag[] = tags.map((tag) => ({
            id: tag.id,
            name: tag.name,
            adrenaline: tag.adrenaline,
            exc400: tag.exc400,
            exc240: tag.exc240,
        }));

        const response = await fetch("/api/tags", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(serializedTags, null, 2),
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

// ================================================================== //
//                                                                    //
//                                                                    //
//                                                                    //
// Export/Import Functionality                                        //
//                                                                    //
// ================================================================== //

function exportData(): void {
    const dataExport = {
        version: "3.0.0",
        exportDate: new Date().toISOString(),
        tags: tags.map((tag) => ({
            id: tag.id,
            name: tag.name,
            adrenaline: tag.adrenaline,
            exc400: tag.exc400,
            exc240: tag.exc240,
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

function exportTehutiXL(): void {
    const tehutiExport = tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        adrenaline: tag.adrenaline,
        exc400: tag.exc400,
        exc240: tag.exc240,
    }));

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
                const importedData: any = JSON.parse(content);

                // Validate import data
                if (!importedData.tags || !importedData.stimuli) {
                    throw new Error("Invalid data format");
                }

                // Import tags
                tags = importedData.tags.map(
                    (tagData: any) =>
                        new Tag(
                            tagData.id,
                            tagData.name,
                            tagData.adrenaline,
                            tagData.exc400,
                            tagData.exc240,
                        ),
                );

                // Import stimuli
                stimuli = importedData.stimuli;

                // Save to file storage
                saveTags();
                saveStimuli();

                // Refresh display
                displayTags();
                displayStimuli();

                alert(
                    `Data imported successfully!\nVersion: ${importedData.version}\n${tags.length} tags, ${stimuli.length} stimuli`,
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
// Legacy stub functions (obsolete, kept for compatibility)           //
//                                                                    //
// ================================================================== //

// @ts-ignore - Legacy function
function clampExcitationSize(data: ExcitationData): ExcitationData {
    return data;
}

// @ts-ignore - Legacy function
function generateIntensityAndSize() {
    return { intensity: 5, size: 5 };
}

// @ts-ignore - Legacy function
function renderPoints() {}

// @ts-ignore - Legacy function
function renderPointsList() {}

// ================================================================== //
//                                                                    //
//                                                                    //
//                                                                    //
// Expose functions to global scope for HTML handlers                //
//                                                                    //
// ================================================================== //

// Expose all functions that are called from HTML onclick/onchange handlers
const windowWithHandlers = window as any as WindowWithHandlers;
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
