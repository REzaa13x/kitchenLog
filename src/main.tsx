import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { KitchenProvider } from './storage/kitchenStore';

/**
 * Titik masuk MODE NORMAL (Firebase).
 *
 * Memakai Firebase Auth + Firestore. Tidak ada yang berubah dari sebelumnya;
 * provider hanya dipindahkan ke sini agar mode demo bisa memakai provider lain.
 */
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <KitchenProvider>
      <App />
    </KitchenProvider>
  </ErrorBoundary>
);
