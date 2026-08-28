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
// manually-created <style> element.
import molarExperienceStyles from '@mrburdeveloperteam/molar-experience/styles.css?raw';
// APPOINTMENTS-3H: the per-utility revert-layer compatibility matrix
// (APPOINTMENTS-3D through 3G, previously imported here from
// compat/shared-molar-tailwind-v3.css) has been removed. It is no longer
// needed: this app's own Tailwind v3 output is now wrapped in a named
// cascade layer, `appointments-host` (see src/styles.css), which is
// always registered before Shared's own theme/utilities/properties
// layers (Shared's CSS is injected into a <style> element below, at
// runtime, always after this document's own <link>-loaded stylesheet has
// already registered its layer). Per the CSS Cascade Layers spec, a
// later-declared layer always outranks an earlier one for the same
// property — so Shared's layered rules now naturally win over this app's
// layered rules without needing any revert-layer overrides, while an
// element Shared doesn't style for a given property still correctly
// falls through to this app's own Tailwind Preflight reset underneath.
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
