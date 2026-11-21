export const SL_NAME_TO_STD: Record<string, string>;
export function convertStrengthLevel(csv: string): {
  source: string;
  tables: Record<string, { bw: number[]; male: number[][] }>;
  unmapped: string[];
};
