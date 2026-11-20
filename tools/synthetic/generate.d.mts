export declare const DEFAULT_SEED: number;
export declare const HEADER: string[];
export declare function mulberry32(seed: number): () => number;
export declare function generateDemoLog(opts?: { seed?: number; start?: string; weeks?: number }): string;
