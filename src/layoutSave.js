// US-139/D161: layout save/reset - the pilot cluster for the main.js split
// (moved unchanged; state stays in main.js, so every function here takes an
// accessor for it rather than a module-level `let`). Reads `role`/
// `selectedPreset`/`gameState` fresh on every call (they're reassigned
// elsewhere), via `read()`.
import { loadPanelLayout } from './panelLayout.js';
import { saveLayoutOverride, deleteLayoutOverride, overridesForPreset, stableLayoutSubset } from './layoutOverrides.js';

/**
 * @param {() => { role: string, selectedPreset: object|null, gameState: object }} read
 *   the current values of `main.js`'s own `role`/`selectedPreset`/`gameState`
 */
export function wireLayoutControls(read) {
  function updateLayoutControlsVisibility() {
    const { role, selectedPreset } = read();
    document.querySelector('#layout-controls').hidden = role !== 'host' || !selectedPreset;
  }

  function performSaveLayout() {
    const { role, selectedPreset, gameState } = read();
    if (role !== 'host' || !selectedPreset) return;
    const layout = stableLayoutSubset(loadPanelLayout(localStorage), gameState.gameConfig);
    saveLayoutOverride(localStorage, selectedPreset.name, selectedPreset.name, layout);
    globalThis.alert(`Layout saved as "${selectedPreset.name}".`);
  }

  // US-148/D170: reuses `<header-actions>`'s own rename idiom (Enter
  // commits, Escape cancels, blank/unchanged reverts silently) instead
  // of `globalThis.prompt()` - the one remaining native dialog in
  // `src/`. The trigger point differs (Smith's condition): there is no
  // existing LABEL to double-click here, so the button itself swaps for
  // the input on click, and swaps back once the input settles.
  function performSaveLayoutAs() {
    const { role, selectedPreset } = read();
    if (role !== 'host' || !selectedPreset) return;
    const button = document.querySelector('#save-layout-as-btn');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'layout-save-as-edit';
    input.value = selectedPreset.name;
    button.replaceWith(input);
    input.focus();
    input.select();

    let isSettled = false;
    const commit = () => {
      if (isSettled) return;
      isSettled = true;
      const name = input.value.trim();
      input.replaceWith(button);
      if (!name) return;
      const { gameState } = read();
      const existing = overridesForPreset(localStorage, selectedPreset.name).some((o) => o.name === name);
      if (existing && !globalThis.confirm(`"${name}" already exists. Overwrite it?`)) return;
      const layout = stableLayoutSubset(loadPanelLayout(localStorage), gameState.gameConfig);
      saveLayoutOverride(localStorage, name, selectedPreset.name, layout);
      globalThis.alert(`Layout saved as "${name}".`);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ke) => {
      if (ke.key === 'Enter') { ke.preventDefault(); input.blur(); }
      else if (ke.key === 'Escape') { isSettled = true; input.replaceWith(button); }
    });
  }

  function performResetLayout() {
    const { role, selectedPreset } = read();
    if (role !== 'host' || !selectedPreset) return;
    if (!globalThis.confirm(`Reset "${selectedPreset.name}" to its built-in default layout? This only affects new games, not this table.`)) return;
    deleteLayoutOverride(localStorage, selectedPreset.name);
    globalThis.alert(`"${selectedPreset.name}" reset to its built-in default.`);
  }

  document.querySelector('#save-layout-btn').addEventListener('click', performSaveLayout);
  document.querySelector('#save-layout-as-btn').addEventListener('click', performSaveLayoutAs);
  document.querySelector('#reset-layout-btn').addEventListener('click', performResetLayout);

  return { updateLayoutControlsVisibility };
}
