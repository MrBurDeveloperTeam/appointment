import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthProvider';
import './styles.css';
// The shared package's dist/styles.css is built by Tailwind v4 and contains
// raw `@layer utilities {...}` blocks with no matching `@tailwind utilities`
// directive in the same file. This app's own Vite pipeline runs Tailwind v3
// through PostCSS on all imported CSS (including node_modules), which
// hard-errors on that shape — confirmed by an actual build failure with a
// plain import. `?raw` bypasses Vite's CSS/PostCSS pipeline entirely
// (treated as a plain text asset), then the text is injected verbatim via a
// manually-created <style> element, always after this document's own
// <link>-loaded stylesheet (`./styles.css` above) has already registered
// its own cascade layer — so Shared's later-declared layer naturally wins
// per the CSS Cascade Layers spec, without needing revert-layer overrides.
import molarExperienceStyles from '@mrburdeveloperteam/molar-experience/styles.css?raw';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

const molarStyleEl = document.createElement('style');
molarStyleEl.textContent = molarExperienceStyles;
document.head.appendChild(molarStyleEl);

// Vite entry: mount React 18 with StrictMode.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
      <App />
      </QueryClientProvider>
    </AuthProvider>
  </React.StrictMode>
);
