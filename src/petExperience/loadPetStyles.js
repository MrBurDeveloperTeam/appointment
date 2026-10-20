// The shared pet-function stylesheet is ~350 KB of raw CSS. It used to be
// imported eagerly in main.jsx, which put it on the critical path of every
// launch. It is only needed by the mascot / virtual pet / Molar AI float, so
// it is loaded on demand (once) and injected as a <style> element AFTER the
// app's own stylesheet, preserving the cascade-layer ordering described in
// the original main.jsx comment.
let pending = null;

export function loadPetStyles() {
  if (!pending) {
    pending = import('@mrburdeveloperteam/pet-function/styles.css?raw')
      .then((mod) => {
        const el = document.createElement('style');
        el.setAttribute('data-pet-function-styles', '');
        el.textContent = mod.default;
        document.head.appendChild(el);
      })
      .catch((err) => {
        pending = null; // allow a retry
        console.error('Failed to load pet styles:', err);
      });
  }
  return pending;
}
