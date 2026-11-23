import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { KitchenProvider } from './storage/kitchenStore';

/**
 * Titik masuk alternatif: mode Firebase (versi lama).
 *
 * Dipakai hanya untuk pembanding: `npm run dev:firebase`.
 * Aplikasi utama (src/main.tsx) memakai MySQL.
 */
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <KitchenProvider>
      <App />
    </KitchenProvider>
  </ErrorBoundary>
);
