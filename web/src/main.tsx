import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './App';
import { registerSW } from './sw/register';
import { initTheme } from './ui/kit/useTheme';
import { installPressFeedback } from './ui/kit/motion/press';
import { initKeyboardWatch } from './ui/kit/keyboard';
import { getDb } from './db';
import { initTips } from './app/tips';

initTheme();
installPressFeedback();
initKeyboardWatch();
void initTips(getDb()).catch(e => console.error(e));
createRoot(document.getElementById('root')!).render(<App />);
registerSW();

// Preview builds only (`vite build --mode preview`): window.__gymbro for local
// seeding scripts. MODE is a build-time constant, so production builds drop
// this branch and the dev/preview chunk entirely (checked by tools/check-bundle.mjs).
if (import.meta.env.MODE === 'preview') void import('./dev/previewHook').then(m => m.installPreviewHook());
