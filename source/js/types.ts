/**
 * Core data types for Tehuti StimEditor
 */

/**
 * @deprecated - Legacy type for backward compatibility only
 */
export interface ExcitationData {
    x: number;
    y: number;
    intensity: number;
    size: number;
}

/**
 * Position and dimensions for excitation PNG images
 */
export interface ExcitationPosition {
    /** X coordinate (relative to top-left of container) */
    x: number;
    /** Y coordinate (relative to top-left of container) */
    y: number;
    /** Width in pixels */
    width: number;
    /** Height in pixels */
    height: number;
}

/**
 * Tag with emotional/neurological metadata and excitation image positions
 */
export class Tag {
    id: number;
    name: string;
    adrenaline: number;
    /** Position data for 400x400 excitation image */
    exc400?: ExcitationPosition;
    /** Position data for 240px excitation image */
    exc240?: ExcitationPosition;

    constructor(
        id: number,
        name: string,
        adrenaline: number = 0,
        exc400?: ExcitationPosition,
        exc240?: ExcitationPosition,
    ) {
        this.id = id;
        this.name = name;
        this.adrenaline = adrenaline;
        this.exc400 = exc400;
        this.exc240 = exc240;
    }

    /** @deprecated - Legacy method for backward compatibility */
    setLayers(_layerId: number, _excitationData: ExcitationData[]): void {
        // No-op: Tags now use PNG images instead of individual excitation points
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
    exc400?: ExcitationPosition;
    exc240?: ExcitationPosition;
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
    handleZoomMask: (event: Event) => void;
    handlePaste: (event: Event) => void;
    hideOverlay: (event: Event) => void;
    handleDescriptionChange: (event: Event) => void;
    handleZoomDescriptionChange: (event: Event) => void;
    showImageZoom: (
        imageSrc: string,
        stimulusId: number,
        event: MouseEvent,
    ) => void;
    hideImageZoom: () => void;
    removeTagFromZoomedPhoto: (stimulusId: number, tagId: number) => void;
    showPrevZoomImage: (event: MouseEvent) => void;
    showNextZoomImage: (event: MouseEvent) => void;
    handleZoomTagSearchKeydown: (event: KeyboardEvent) => void;
    handleZoomTagFilter: (event: Event) => void;
    clearTagFilters: () => void;
    exportData: () => void;
    exportTehutiXL: () => void;
    exportPhotosAndTags: () => void;
    importData: () => void;
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
