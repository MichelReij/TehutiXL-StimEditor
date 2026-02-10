/**
 * Core data types for Tehuti StimEditor
 */

/**
 * Represents a single excitation point with coordinates, intensity, and size
 */
export interface ExcitationData {
    /** X coordinate (-20 to +20) */
    x: number;
    /** Y coordinate (-20 to +20) */
    y: number;
    /** Intensity level (0-10) */
    intensity: number;
    /** Size of the excitation zone (1-20) */
    size: number;
}

/**
 * Represents a single layer containing excitation data
 */
export interface LayerData {
    /** Layer identifier (0-23) */
    layerId: number;
    /** Array of excitation points for this layer */
    excitationData: ExcitationData[];
}

/**
 * Layer class implementation
 */
export class Layer implements LayerData {
    layerId: number;
    excitationData: ExcitationData[];

    constructor(layerData: LayerData) {
        this.layerId = layerData.layerId;
        this.excitationData = layerData.excitationData;
    }
}

/**
 * Tag with emotional/neurological metadata
 */
export class Tag {
    id: number;
    name: string;
    adrenaline: number;
    layers: Layer[];

    constructor(
        id: number,
        name: string,
        adrenaline: number = 0,
        layerData: LayerData[] = [],
    ) {
        this.id = id;
        this.name = name;
        this.adrenaline = adrenaline;
        this.layers = [];

        // Initialize all 24 layers
        for (let i = 0; i < 24; i++) {
            this.layers.push(new Layer({ layerId: i, excitationData: [] }));
        }

        // Override with provided layer data
        layerData.forEach((data: LayerData) => {
            if (data.layerId >= 0 && data.layerId < 24) {
                this.layers[data.layerId] = new Layer(data);
            }
        });
    }

    getLayers(): Layer[] {
        return this.layers;
    }

    setLayers(layerId: number, excitationData: ExcitationData[]): void {
        if (layerId >= 0 && layerId < this.layers.length) {
            this.layers[layerId].excitationData = excitationData;
        }
    }

    getLayer(layerId: number): Layer {
        return this.layers[layerId] || this.layers[0];
    }
}

/**
 * Stimulus image with metadata
 */
export interface Stimulus {
    /** Unique stimulus identifier */
    id: number;
    /** Filename of the image */
    file: string;
    /** Size information for C-export */
    size: string;
    /** Array of tag IDs associated with this stimulus */
    tags: number[];
    /** Optional description text */
    description?: string;
}

/**
 * Serialized tag data for storage
 */
export interface SerializedTag {
    id: number;
    name: string;
    adrenaline: number;
    layers: LayerData[];
}

/**
 * Complete dataset for export/import
 */
export interface DataExport {
    version: string;
    exportDate: string;
    tags: SerializedTag[];
    stimuli: Stimulus[];
}

/**
 * HTML Event handlers type declarations
 */
export interface WindowWithHandlers extends Window {
    throttledKeyUpHandler: (event: KeyboardEvent) => void;
    addTag: () => void;
    addStimuli: () => void;
    generateTagsArray: () => void;
    generateStimuliArray: () => void;
    handleNameChange: (event: Event) => void;
    handleAdrenalineChange: (event: Event) => void;
    handleStimChecked: (event: Event) => void;
    handleMask: (event: Event) => void;
    handlePaste: (event: Event) => void;
    hideOverlay: (event: Event) => void;
    handleDescriptionChange: (event: Event) => void;
    showImageZoom: (
        imageSrc: string,
        stimulusId: number,
        event: MouseEvent,
    ) => void;
    hideImageZoom: () => void;
    removeTagFromZoomedPhoto: (stimulusId: number, tagId: number) => void;
    exportData: () => void;
    exportTehutiXL: () => void;
    exportPhotosAndTags: () => void;
    importData: () => void;
    addExcitationPoint: () => void;
    selectExcitationPoint: (index: number) => void;
    selectExcitationPointFromList: (index: number) => void;
    updatePointProperty: (property: string) => void;
    deleteExcitationPoint: (index: number) => void;
    handleDragStart: (event: MouseEvent) => void;
    handleDrag: (event: MouseEvent) => void;
    handleDragEnd: (event: MouseEvent) => void;
}

/**
 * Type guard to check if object is ExcitationData
 */
export function isExcitationData(obj: any): obj is ExcitationData {
    return (
        typeof obj === "object" &&
        typeof obj.x === "number" &&
        typeof obj.y === "number" &&
        typeof obj.intensity === "number" &&
        typeof obj.size === "number"
    );
}

/**
 * Type guard to check if object is Stimulus
 */
export function isStimulus(obj: any): obj is Stimulus {
    return (
        typeof obj === "object" &&
        typeof obj.id === "number" &&
        typeof obj.file === "string" &&
        typeof obj.size === "string" &&
        Array.isArray(obj.tags)
    );
}
