// Every Chinese file, merged. One file per area so parallel work never shares
// a file; i18n/keys.test.ts fails when two files give one key different Chinese.
import type { Dict } from './types';
import core from './core';
import session from './session';
import progress from './progress';
import setup from './setup';
import names from './names';
import engine from './engine';

export const ZH_PARTS: Record<string, Dict> = { core, session, progress, setup };
export const ZH: Dict = Object.assign({}, ...Object.values(ZH_PARTS));
/** Stored names: built-in lifts, standards, template programs and sessions. */
export const ZH_NAMES: Dict = names;
/** Engine sentence templates, English → Chinese, values as {name}. */
export const ZH_ENGINE: Dict = engine;
