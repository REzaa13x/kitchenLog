import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MysqlKitchenProvider } from './storage/mysqlStore';

/**
 * Titik masuk aplikasi (mode MySQL).
 *
 * Memakai API sendiri + database MySQL, bukan Firebase. Login memakai
 * email + password, data disimpan di MySQL yang bisa dibuka di phpMyAdmin.
 *
 * Firebase masih tersedia lewat src/main-firebase.tsx bila diperlukan
 * sebagai pembanding (npm run dev:firebase).
 */
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <MysqlKitchenProvider>
      <App />
    </MysqlKitchenProvider>
  </ErrorBoundary>
);
