/**
 * Normal deploy: assets/ is a sibling folder on the static host, so a
 * relative path just works. The standalone build (tools/buildStandalone.mjs)
 * has no folder to point at - it inlines every asset as a data URI into a
 * `window.__ASSETS__` map instead, so this is the one seam runtime asset
 * lookups need to go through to work in both shapes.
 */
export function resolveAssetPath(path) {
  return globalThis.__ASSETS__?.[path] ?? path;
}
