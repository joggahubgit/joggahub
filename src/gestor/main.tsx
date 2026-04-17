import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles/index.css';
import GestorApp from './GestorApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GestorApp />
  </StrictMode>
);
