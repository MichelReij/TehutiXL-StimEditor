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
const heatmap: readonly string[] = [
    "#FF0000",
    "#FF0400",
    "#FF0800",
    "#FF0C00",
    "#FF1000",
    "#FF1400",
    "#FF1800",
    "#FF1C00",
    "#FF2000",
    "#FF2400",
    "#FF2800",
    "#FF2D00",
    "#FF3100",
    "#FF3500",
    "#FF3900",
    "#FF3D00",
    "#FF4100",
    "#FF4500",
    "#FF4900",
    "#FF4D00",
    "#FF5100",
    "#FF5500",
    "#FF5900",
    "#FF5D00",
    "#FF6100",
    "#FF6500",
    "#FF6900",
    "#FF6D00",
    "#FF7100",
    "#FF7500",
    "#FF7900",
    "#FF7D00",
    "#FF8200",
    "#FF8200",
    "#FF8A00",
    "#FF8E00",
    "#FF9200",
    "#FF9200",
    "#FF9A00",
    "#FF9E00",
    "#FFA200",
    "#FFA200",
    "#FFAA00",
    "#FFAE00",
    "#FFB200",
    "#FFB200",
    "#FFBA00",
    "#FFBE00",
    "#FFC200",
    "#FFC200",
    "#FFCA00",
    "#FFCE00",
    "#FFD200",
    "#FFD700",
    "#FFDB00",
    "#FFDF00",
    "#FFE300",
    "#FFE300",
    "#FFEB00",
    "#FFEF00",
    "#FFF300",
    "#FFF300",
    "#FFFB00",
    "#FFFF00",
];

// Example usage of writeTags to store some tags
const joyLayers: LayerData[] = [
    {
        layerId: 0,
        excitationData: [
            { x: 0, y: 0, intensity: 15, size: 3 },
            { x: 5, y: 3, intensity: 10, size: 5 },
            { x: -5, y: 1, intensity: 5, size: 8 },
            { x: -5, y: -3, intensity: 3, size: 11 },
        ],
    },
    {
        layerId: 1,
        excitationData: [
            { x: 0, y: 0, intensity: 15, size: 3 },
            { x: 5, y: 3, intensity: 10, size: 5 },
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
    const imageModules = import.meta.glob("/img/stimuli/*.jpg", {
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
    displayTags();
    displayStimuli();
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

            const stimElem = `<label>
       <input type="checkbox" id="stimCb_${
           stimulus.id
       }" onchange="handleStimChecked(event)">
        <img src="/stimuli/${stimulus.file}" title="${
            stimulus.id
        }: ${stimulus.file.replace(/_/g, ", ").replace(".jpg", "")}">
        </label>`;
            stimContainer.insertAdjacentHTML("beforeend", stimElem);
        });
        saveStimuli();
        console.log(
            "✅ Displayed",
            stimuli.length,
            "stimuli (alfabetisch gesorteerd)",
        );
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
                }
            });

            saveStimuli();
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
        tags.forEach((tag) => {
            const element = document.createElement("div") as HTMLDivElement;
            element.id = "tagNav_" + tag.id.toString();
            element.textContent = tag.name; // Simple display, customize as needed
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
    tags.push(new Tag(tags.length + 1, "new", 0, []));
    displayTags(tags.length);
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
                  layer.excitationData,
              )
                  .replace(/},{/g, "},\n  {")
                  .replace(/\[{/g, "[\n  {")
                  .replace(/}\]/g, "}\n]")}</textarea>
            </div>
            <div class="visualizer" id="vis_${layerId}" style="background-image: url(/mri/mri_grey_${layerId
                .toString()
                .padStart(2, "0")}.jpg);">
              <div class="point-container" id="pc_${layerId}"></div>
              <img id="mask_${layerId}" class="mri-mask show" src="/masks/mask_${layerId
                  .toString()
                  .padStart(2, "0")}.gif">
            </div>
          </div>
        `,
            );

            renderPoints(layerId, JSON.stringify(layer.excitationData));
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

            vis.innerHTML = "";

            // Now sort on size
            excitationData.sort((a, b) => a.intensity - b.intensity);

            // console.log("boe2");
            excitationData.forEach((epd: ExcitationData) => {
                const x = 100 + epd.x - epd.size;
                const y = 110 - epd.y - epd.size;
                // const hue = 60 - epd.intensity * 3;
                // const lgt = 60 - epd.intensity;

                vis.insertAdjacentHTML(
                    "beforeend",
                    `
          <div class="excitation-point" style="
            top:${y}px;
            left:${x}px;
            width:${epd.size * 2}px;
            height:${epd.size * 2}px;
            background-color: ${heatmap[63 - epd.intensity]};
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
                txt += `
  {
    ${stim.id},
    ${stim.file.replace(".jpg", "")},
    sizeof(${stim.file.replace(".jpg", "")}),
    {${stim.tags.join(",")}}
  },`;
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
windowWithHandlers.handleMask = handleMask;
windowWithHandlers.handlePaste = handlePaste;
windowWithHandlers.hideOverlay = hideOverlay;
windowWithHandlers.exportData = exportData;
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
