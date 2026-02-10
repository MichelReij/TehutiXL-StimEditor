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
// 11-point intensity scale (0-10)
const intensityPalette: readonly string[] = [
    "#F4D166", // 0
    "#F8BC58", // 1
    "#F7A94B", // 2
    "#F49639", // 3
    "#F28227", // 4
    "#EC6E1C", // 5
    "#DF5E1F", // 6
    "#D15022", // 7
    "#BF4723", // 8
    "#AB3F24", // 9
    "#973727", // 10
];

// Example usage of writeTags to store some tags
const joyLayers: LayerData[] = [
    {
        layerId: 0,
        excitationData: [
            { x: 0, y: 0, intensity: 10, size: 3 },
            { x: 5, y: 3, intensity: 7, size: 5 },
            { x: -5, y: 1, intensity: 5, size: 8 },
            { x: -5, y: -3, intensity: 3, size: 11 },
        ],
    },
    {
        layerId: 1,
        excitationData: [
            { x: 0, y: 0, intensity: 10, size: 3 },
            { x: 5, y: 3, intensity: 7, size: 5 },
            { x: -5, y: 1, intensity: 5, size: 8 },
            { x: -5, y: -3, intensity: 3, size: 11 },
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

    // Load existing stimuli from localStorage
    const stimJSON = localStorage.getItem("stimuli");
    let existingStimuli: Stimulus[] = stimJSON ? JSON.parse(stimJSON) : [];

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
    // Attempt to read tags from localStorage on initialization
    readTags();
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

    // Add global Escape key handler for image zoom
    document.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            const imageZoom = document.getElementById(
                "imageZoom",
            ) as HTMLDivElement;
            if (imageZoom && imageZoom.style.display === "flex") {
                hideImageZoom();
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

        // Sort stimuli alphabetically by filename before displaying
        const sortedStimuli = [...stimuli].sort((a, b) =>
            a.file.localeCompare(b.file),
        );

        sortedStimuli.forEach((stimulus) => {
            stimulus.file = check4JpgExtension(stimulus.file);

            const badgeClass =
                stimulus.tags.length === 0
                    ? "tag-count-badge zero-tags"
                    : "tag-count-badge";

            // Calculate total adrenaline from all assigned tags
            const totalAdrenaline = stimulus.tags.reduce((sum, tagId) => {
                const tag = tags.find((t) => t.id === tagId);
                return sum + (tag ? tag.adrenaline : 0);
            }, 0);

            // Get tag names for title
            const tagNames = stimulus.tags
                .map((tagId) => {
                    const tag = tags.find((t) => t.id === tagId);
                    return tag ? tag.name : "";
                })
                .filter((name) => name !== "")
                .join(", ");

            const titleText = tagNames
                ? `${tagNames} - adrenaline: ${totalAdrenaline.toFixed(2)}`
                : `adrenaline: ${totalAdrenaline.toFixed(2)}`;

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
        console.log(
            "✅ Displayed",
            stimuli.length,
            "stimuli (alfabetisch gesorteerd)",
        );

        // Update checkbox states based on currently selected tag
        setCheckStimuli();
    } else {
        console.error("❌ stimContainer element not found!");
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

function check4JpgExtension(file: string): string {
    return file.indexOf(".jpg") > 0 ? file : file + ".jpg";
}

/**
 * Clamp excitation point size to valid range (3-12)
 */
function clampExcitationSize(data: ExcitationData): ExcitationData {
    return {
        ...data,
        size: Math.max(3, Math.min(12, data.size)),
    };
}

function showImageZoom(
    imageSrc: string,
    stimulusId: number,
    event: MouseEvent,
) {
    event.preventDefault();
    const overlay = document.getElementById("imageZoom") as HTMLDivElement;
    const img = document.getElementById("zoomedImage") as HTMLImageElement;
    const tagsContainer = document.getElementById(
        "zoomedImageTags",
    ) as HTMLDivElement;

    if (overlay && img && tagsContainer) {
        img.src = imageSrc;

        // Find the stimulus
        const stimulus = stimuli.find((s) => s.id === stimulusId);

        // Render tags
        if (stimulus) {
            tagsContainer.innerHTML = "";
            if (stimulus.tags.length > 0) {
                stimulus.tags.forEach((tagId) => {
                    const tag = tags.find((t) => t.id === tagId);
                    if (tag) {
                        const tagElem = document.createElement("div");
                        tagElem.className = "zoom-tag";
                        tagElem.innerHTML = `
                            <span>${tag.name}</span>
                            <button onclick="removeTagFromZoomedPhoto(${stimulusId}, ${tagId}); event.stopPropagation();">✕</button>
                        `;
                        tagsContainer.appendChild(tagElem);
                    }
                });
            } else {
                tagsContainer.innerHTML =
                    '<div class="no-tags">No tags assigned</div>';
            }
        }

        overlay.style.display = "flex";
        overlay.setAttribute("data-stimulus-id", stimulusId.toString());
    }
}

function removeTagFromZoomedPhoto(stimulusId: number, tagId: number) {
    const stimulus = stimuli.find((s) => s.id === stimulusId);
    if (stimulus) {
        stimulus.tags = stimulus.tags.filter((t) => t !== tagId);
        saveStimuli();

        // Update the badge in the main view
        const checkbox = document.getElementById(
            `stimCb_${stimulusId}`,
        ) as HTMLInputElement;
        if (checkbox) {
            const badge =
                checkbox.parentElement?.querySelector(".tag-count-badge");
            if (badge) {
                badge.textContent = stimulus.tags.length.toString();
                if (stimulus.tags.length === 0) {
                    badge.classList.add("zero-tags");
                } else {
                    badge.classList.remove("zero-tags");
                }
            }

            // Update the adrenaline badge
            const adrenalineBadge =
                checkbox.parentElement?.querySelector(".adrenaline-badge");
            if (adrenalineBadge) {
                const totalAdrenaline = stimulus.tags.reduce((sum, tagId) => {
                    const tag = tags.find((t) => t.id === tagId);
                    return sum + (tag ? tag.adrenaline : 0);
                }, 0);
                adrenalineBadge.textContent = totalAdrenaline.toFixed(2);
            }

            // Uncheck the checkbox if currently selected tag was removed
            const editId = document.getElementById(
                "editId",
            ) as HTMLInputElement;
            if (editId && parseInt(editId.value) === tagId) {
                checkbox.checked = false;
            }
        }

        // Re-render the zoom view
        const overlay = document.getElementById("imageZoom") as HTMLDivElement;
        const currentStimId = overlay.getAttribute("data-stimulus-id");
        if (currentStimId && parseInt(currentStimId) === stimulusId) {
            const img = document.getElementById(
                "zoomedImage",
            ) as HTMLImageElement;
            if (img && img.src) {
                showImageZoom(
                    img.src,
                    stimulusId,
                    new MouseEvent("contextmenu"),
                );
            }
        }

        // Update tag list counts
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
    if (overlay) {
        overlay.style.display = "none";
    }
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

                    // Update the adrenaline badge
                    const adrenalineBadge =
                        input.parentElement?.querySelector(".adrenaline-badge");
                    if (adrenalineBadge) {
                        const totalAdrenaline = stim.tags.reduce(
                            (sum, tagId) => {
                                const tag = tags.find((t) => t.id === tagId);
                                return sum + (tag ? tag.adrenaline : 0);
                            },
                            0,
                        );
                        adrenalineBadge.textContent =
                            totalAdrenaline.toFixed(2);
                    }

                    // Update the title attribute
                    const img = input.parentElement?.querySelector("img");
                    if (img) {
                        const tagNames = stim.tags
                            .map((tagId) => {
                                const tag = tags.find((t) => t.id === tagId);
                                return tag ? tag.name : "";
                            })
                            .filter((name) => name !== "")
                            .join(", ");

                        const totalAdrenaline = stim.tags.reduce(
                            (sum, tagId) => {
                                const tag = tags.find((t) => t.id === tagId);
                                return sum + (tag ? tag.adrenaline : 0);
                            },
                            0,
                        );

                        const titleText = tagNames
                            ? `${tagNames} - adrenaline: ${totalAdrenaline.toFixed(2)}`
                            : `adrenaline: ${totalAdrenaline.toFixed(2)}`;

                        img.setAttribute("title", titleText);
                    }

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
                            showImageZoom(
                                zoomedImg.src,
                                stimId,
                                new MouseEvent("contextmenu"),
                            );
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
        tags.forEach((tag) => {
            // Count how many stimuli have this tag
            const photoCount = stimuli.filter((stim) =>
                stim.tags.includes(tag.id),
            ).length;

            const element = document.createElement("div") as HTMLDivElement;
            element.id = "tagNav_" + tag.id.toString();
            element.textContent = `${tag.name} (${photoCount})`; // Display name with photo count
            element.addEventListener("click", () => editTag(tag));
            element.classList.add("tag-nav-elem");
            tagsList.appendChild(element);
            if (tag.id == selectId) {
                editTag(tag);
            }
        });
    }
}

function addTag() {
    // Create new tag with 6 excitation points in 2 overlapping clusters
    const excitationData: ExcitationData[] = [];

    // Helper function to create an overlapping point near an existing point
    const createOverlappingPoint = (
        existingPoints: ExcitationData[],
    ): ExcitationData => {
        // Pick a random existing point to overlap with
        const basePoint =
            existingPoints[Math.floor(Math.random() * existingPoints.length)];
        const size = Math.floor(Math.random() * 14) + 1; // 1-14
        const intensity = Math.floor(Math.random() * 11); // 0-10

        // Position it with slight overlap (max 25%)
        // Distance between 0.75 and 1.0 of combined radius gives light overlap
        const combinedRadius = basePoint.size + size;
        const minDistance = combinedRadius * 0.75;
        const maxDistance = combinedRadius * 1.0;
        const angle = Math.random() * 2 * Math.PI;
        const distance =
            minDistance + Math.random() * (maxDistance - minDistance);

        return {
            x: Math.round(basePoint.x + distance * Math.cos(angle)),
            y: Math.round(basePoint.y + distance * Math.sin(angle)),
            intensity,
            size,
        };
    };

    // Create 2 clusters
    for (let cluster = 0; cluster < 2; cluster++) {
        const clusterPoints: ExcitationData[] = [];

        // First point: random position within radius from center
        // Cluster 0 (left side): negative x, angle between π/2 and 3π/2
        // Cluster 1 (right side): positive x, angle between -π/2 and π/2
        let angle;
        if (cluster === 0) {
            // Left side: angle between 90° and 270° (π/2 to 3π/2)
            angle = Math.PI / 2 + Math.random() * Math.PI;
        } else {
            // Right side: angle between -90° and 90° (-π/2 to π/2)
            angle = -Math.PI / 2 + Math.random() * Math.PI;
        }
        const radius = 70 + Math.random() * 10; // 70-80
        const firstPoint: ExcitationData = {
            x: Math.round(radius * Math.cos(angle)),
            y: Math.round(radius * Math.sin(angle)),
            intensity: Math.floor(Math.random() * 11), // 0-10
            size: Math.floor(Math.random() * 12) + 5, // 5-16
        };
        clusterPoints.push(firstPoint);
        excitationData.push(firstPoint);

        // Second and third points: overlap with existing points in this cluster
        for (let i = 0; i < 2; i++) {
            const overlappingPoint = createOverlappingPoint(clusterPoints);
            clusterPoints.push(overlappingPoint);
            excitationData.push(overlappingPoint);
        }
    }

    // Sort by size (largest first) for better visibility
    excitationData.sort((a, b) => b.size - a.size);

    const defaultLayer: LayerData = {
        layerId: 17,
        excitationData,
    };
    const newTag = new Tag(tags.length + 1, "new", 0, [defaultLayer]);
    tags.push(newTag);
    displayTags(newTag.id);

    // Focus and select the name field
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

        const layerContainer = document.getElementById("layerContainer");
        if (layerContainer) {
            layerContainer.innerHTML = ""; // Clear existing tags display
            // tag.getLayers().forEach((layer) => {
            // const layerId: number = layer.layerId;
            const layerId = 17;
            const layer = tag.getLayer(layerId);

            // Clamp excitation point sizes to valid range (3-12)
            const clampedExcitationData =
                layer.excitationData.map(clampExcitationSize);

            // Sort by size (largest first) for better visibility
            clampedExcitationData.sort((a, b) => b.size - a.size);

            layerContainer.insertAdjacentHTML(
                "beforeend",
                `
          <div class="layer" id="layer_${layerId}">
            <div class="left">
              <div>
              <label for="textarea_layer_${layerId}">Layer ${layerId}</label>
              <label><input type="checkbox" checked id="cbMask_${layerId}" onchange="handleMask(event)"> mask</label>
              </div>
              <textarea id="textarea_layer_${layerId}" onkeyup="throttledKeyUpHandler(event)">${JSON.stringify(
                  clampedExcitationData,
              )
                  .replace(/},{/g, "},\n  {")
                  .replace(/\[{/g, "[\n  {")
                  .replace(/}\]/g, "}\n]")}</textarea>
              <div style="font-size: 0.8rem; color: #888; margin-top: 0.5rem;">
                <strong>Parameters:</strong> x, y: -20 tot +20 | intensity: 0-10 | size: 3-12
              </div>
              <button onclick="addExcitationPoint(${layerId})" style="margin-top: 0.5rem;">+ Add Point</button>
              <div id="pointsList_${layerId}" class="points-list" style="margin-top: 1rem;"></div>
            </div>
            <div class="visualizer" id="vis_${layerId}">
              <img class="mri-background" src="/mri/mri_grey_${layerId
                  .toString()
                  .padStart(2, "0")}.jpg" alt="MRI scan">
              <div class="point-container" id="pc_${layerId}"></div>
              <img id="mask_${layerId}" class="mri-mask show" src="/masks/mask_${layerId
                  .toString()
                  .padStart(2, "0")}.gif">
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

            // Clamp all sizes to valid range (3-12)
            const clampedData = excitationData.map(clampExcitationSize);

            vis.innerHTML = "";

            // Create array with original indices before sorting
            const indexedData = clampedData.map((epd, originalIndex) => ({
                ...epd,
                originalIndex,
            }));

            // Now sort on intensity
            indexedData.sort((a, b) => a.intensity - b.intensity);

            // console.log("boe2");
            indexedData.forEach((epd, displayIndex: number) => {
                const x = 100 + epd.x - epd.size;
                const y = 110 - epd.y - epd.size;
                const isSelected =
                    selectedPointIndex === epd.originalIndex &&
                    selectedLayerId === layerId;
                const zIndex = isSelected ? 100 : displayIndex;
                const opacity =
                    selectedPointIndex !== null &&
                    selectedLayerId === layerId &&
                    !isSelected
                        ? 0.5
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
            width:${epd.size * 2}px;
            height:${epd.size * 2}px;
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
// Everything around the localStorage                                 //
//                                                                    //
// ================================================================== //

// Function to read tags from localStorage
function readTags(): void {
    const tagsJSON = localStorage.getItem("tags");
    // const tagsJSON = exampleJson;
    if (!tagsJSON) {
        tags = exampleTags;
    } else {
        const tagsData: {
            id: number;
            name: string;
            adrenaline: number;
            layers: LayerData[];
        }[] = JSON.parse(tagsJSON);

        // Convert old intensity scale to new scale (0-10)
        tagsData.forEach((tagData) => {
            tagData.layers.forEach((layer) => {
                layer.excitationData.forEach((point) => {
                    // If intensity > 10, it's from an old scale, convert it
                    if (point.intensity > 10) {
                        // Convert from 0-63 scale to 0-10 scale
                        point.intensity = Math.round(
                            (point.intensity / 63) * 10,
                        );
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
    }
}

// Function to write tags to localStorage
function saveTags(): void {
    localStorage.setItem("tags", JSON.stringify(tags));
}

function saveStimuli(): void {
    localStorage.setItem("stimuli", JSON.stringify(stimuli));
}

function readStimuli(): void {
    // Stimuli are already loaded by autoDiscoverStimuli()
    // This function is kept for compatibility but does nothing
    // as the auto-discovery handles both reading and syncing
}

// ================================================================== //
//                                                                    //
//                                                                    //
//                                                                    //
// Export/Import Functionality                                        //
//                                                                    //
// ================================================================== //

/**
 * Export complete dataset as JSON file
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
                excitationData: layer.excitationData,
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
                    // Clamp size to valid range (3-12)
                    const clampedSize = Math.max(3, Math.min(12, data.size));
                    return {
                        x: Math.round((data.x / 220) * 1000) / 1000,
                        y: Math.round((data.y / 220) * 1000) / 1000,
                        intensity: data.intensity,
                        size: Math.round((clampedSize / 200) * 1000) / 1000,
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
        // Add new point at center with random values
        const randomIntensity = Math.floor(Math.random() * 64);
        const randomSize = Math.floor(Math.random() * 11) + 5;
        const newPoint = {
            x: 0,
            y: 0,
            intensity: randomIntensity,
            size: randomSize,
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
            // Set all existing points to non-selected state
            const allPoints =
                pointContainer.querySelectorAll(".excitation-point");
            allPoints.forEach((point) => {
                const el = point as HTMLElement;
                el.style.zIndex = "1";
                el.style.opacity = "0.5";
            });

            // Add new point element
            const x = 100 + newPoint.x - newPoint.size;
            const y = 110 - newPoint.y - newPoint.size;
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
            z-index: 100;
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
            <input type="range" id="size_${layerId}_${newIndex}" min="1" max="20" value="${newPoint.size}"
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
        // Reset previous selected point (if different)
        if (
            selectedPointIndex !== null &&
            selectedLayerId === layerId &&
            selectedPointIndex !== index
        ) {
            const prevPoint = visualizer.querySelector(
                `.excitation-point[data-index="${selectedPointIndex}"]`,
            ) as HTMLElement;
            if (prevPoint) {
                prevPoint.style.zIndex = "1";
                prevPoint.style.opacity = "0.6";
            }
        }

        // Highlight new selected point
        target.style.zIndex = "100";
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
    if (draggedElement) {
        draggedElement.style.opacity = "0.5";

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
    const x = event.clientX - rect.left - 100;
    const y = -(event.clientY - rect.top - 110);

    const ta = document.getElementById(
        `textarea_layer_${layerId}`,
    ) as HTMLTextAreaElement;

    if (!ta) return;

    try {
        const excitationData: ExcitationData[] = JSON.parse(ta.value);
        const point = excitationData[index];

        const newX = 100 + Math.round(x) - point.size;
        const newY = 110 - Math.round(y) - point.size;

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
    const x = event.clientX - rect.left - 100;
    const y = -(event.clientY - rect.top - 110);

    const ta = document.getElementById(
        `textarea_layer_${layerId}`,
    ) as HTMLTextAreaElement;

    if (!ta) return;

    try {
        const excitationData: ExcitationData[] = JSON.parse(ta.value);
        const point = excitationData[index];

        const newX = 100 + Math.round(x) - point.size;
        const newY = 110 - Math.round(y) - point.size;

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
    target.style.opacity = isSelected ? "1" : "0.5";

    const visualizer = document.getElementById(`vis_${layerId}`);
    if (!visualizer) return;

    const rect = visualizer.getBoundingClientRect();

    // Calculate final position
    const x = event.clientX - rect.left - 100;
    const y = -(event.clientY - rect.top - 110);

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
            <input type="range" id="size_${layerId}_${index}" min="3" max="12" value="${point.size}"
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
        // Reset previous selected point (if different)
        if (
            selectedPointIndex !== null &&
            selectedLayerId === layerId &&
            selectedPointIndex !== index
        ) {
            const prevPoint = visualizer.querySelector(
                `.excitation-point[data-index="${selectedPointIndex}"]`,
            ) as HTMLElement;
            if (prevPoint) {
                prevPoint.style.zIndex = "1";
                prevPoint.style.opacity = "0.6";
            }
        }

        // Highlight new selected point
        const newPoint = visualizer.querySelector(
            `.excitation-point[data-index="${index}"]`,
        ) as HTMLElement;
        if (newPoint) {
            newPoint.style.zIndex = "100";
            newPoint.style.opacity = "1";
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
                // Reset previous selected point
                if (
                    selectedPointIndex !== null &&
                    selectedLayerId === layerId
                ) {
                    const prevPoint = visualizer.querySelector(
                        `.excitation-point[data-index="${selectedPointIndex}"]`,
                    ) as HTMLElement;
                    if (prevPoint) {
                        prevPoint.style.zIndex = "1";
                        prevPoint.style.opacity = "0.5";
                    }
                }

                // Highlight new selected point
                const newPoint = visualizer.querySelector(
                    `.excitation-point[data-index="${index}"]`,
                ) as HTMLElement;
                if (newPoint) {
                    newPoint.style.zIndex = "100";
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
                const x = 100 + point.x - numValue;
                const y = 110 - point.y - numValue;
                pointElement.style.width = `${numValue * 2}px`;
                pointElement.style.height = `${numValue * 2}px`;
                pointElement.style.left = `${x}px`;
                pointElement.style.top = `${y}px`;
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
windowWithHandlers.handleMask = handleMask;
windowWithHandlers.handlePaste = handlePaste;
windowWithHandlers.hideOverlay = hideOverlay;
windowWithHandlers.showImageZoom = showImageZoom;
windowWithHandlers.hideImageZoom = hideImageZoom;
windowWithHandlers.removeTagFromZoomedPhoto = removeTagFromZoomedPhoto;
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
