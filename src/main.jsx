import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { completeNativeOAuthLogin } from './api';
import App from './App.jsx';
import './index.css';

if (Capacitor.isNativePlatform()) {
  CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else CapacitorApp.exitApp();
  });

  // Google OAuth returns here via the com.matchtrackerpro.app:// deep link
  // (opened in a Custom Tab by loginWithGoogle — see api/supabaseApi.js).
  // A full navigation to '/' mirrors the web flow: it re-mounts the app,
  // AuthContext.getSession() picks up the session we just set, and
  // ProtectedRoute lets the now-authenticated user through.
  CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
    try {
      if (await completeNativeOAuthLogin(url)) window.location.href = '/';
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Google sign-in failed:', e);
    }
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
