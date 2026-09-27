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

  function performSaveLayoutAs() {
    const { role, selectedPreset, gameState } = read();
    if (role !== 'host' || !selectedPreset) return;
    const name = globalThis.prompt('Save layout as:', selectedPreset.name)?.trim();
    if (!name) return;
    const existing = overridesForPreset(localStorage, selectedPreset.name).some((o) => o.name === name);
    if (existing && !globalThis.confirm(`"${name}" already exists. Overwrite it?`)) return;
    const layout = stableLayoutSubset(loadPanelLayout(localStorage), gameState.gameConfig);
    saveLayoutOverride(localStorage, name, selectedPreset.name, layout);
    globalThis.alert(`Layout saved as "${name}".`);
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
