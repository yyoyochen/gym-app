// Preview-build hook: exposes the data layer on window.__gymbro so a local
// script can seed real data without clicking through onboarding. Imported
// only when import.meta.env.MODE === 'preview' (see main.tsx); production
// builds never contain it.
import { addBodyweight, defaultProfile, getDb, saveProfile, saveProgram, seedCatalog, wipeAll } from '../db';
import { importNotionCsv, readAliasFile } from '../import/notion';
import { programFromTemplate } from '../domain/templates';

export function installPreviewHook(): void {
  (window as unknown as { __gymbro: unknown }).__gymbro = {
    getDb, importNotionCsv, readAliasFile, saveProfile, defaultProfile, programFromTemplate, saveProgram, seedCatalog, addBodyweight, wipeAll,
  };
  console.info('[gymbro] preview hook installed: window.__gymbro');
}
