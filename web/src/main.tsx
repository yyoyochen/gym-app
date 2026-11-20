import { createRoot } from 'react-dom/client';
import './styles/base.css';
import { App } from './App';
import { registerSW } from './sw/register';

createRoot(document.getElementById('root')!).render(<App />);
registerSW();
