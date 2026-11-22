export interface StyleViolation { file: string; line: number; rule: string; text: string }
export interface StyleAllowed { file: string; line: number; rule: string; reason: string }
export interface StyleResult { violations: StyleViolation[]; allowed: StyleAllowed[] }
export function checkCss(text: string, file: string): StyleResult;
export function checkTsx(text: string, file: string): StyleResult;
export function checkStyles(srcDir: string): StyleResult;
