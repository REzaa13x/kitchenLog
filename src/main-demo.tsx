import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DemoKitchenProvider } from './storage/demoStore';
import App from './App';

/**
 * Titik masuk MODE DEMO.
 *
 * Jalankan: npm run dev:demo  ->  http://localhost:3000/?demo=1
 *
 * Mode ini memakai DemoKitchenProvider (data contoh di memori) dan tidak
 * memuat modul Firebase sama sekali: tanpa login, tanpa Firestore, dan tidak
 * ada data yang dikirim ke mana pun.
 *
 * Mode normal (npm run dev) tetap memakai Firebase dan tidak terpengaruh.
 */
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <DemoKitchenProvider>
      <App />
    </DemoKitchenProvider>
  </ErrorBoundary>
);
