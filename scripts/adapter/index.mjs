/** @type {import("./SystemAdapter.mjs").default|null} */
let _adapter = null;

/**
 * Resolve the adapter for the current Foundry system. Called once during
 * module entry (before any `Hooks.once("init", ...)` registration) via a
 * top-level await in `pick-up-stix.mjs`.
 *
 * The function is idempotent — calling it multiple times returns the same
 * singleton. On first call it dynamically imports
 * `./adapter/<systemId>/index.mjs`, so only the active system's code is
 * fetched over the network.
 *
 * @returns {Promise<import("./SystemAdapter.mjs").default>}
 * @throws {Error} If `game.system` is not available at module-entry time, or
 *   if no adapter exists for the active system.
 */
export async function loadAdapter() {
  if (_adapter) return _adapter;

  const systemId = game.system?.id;
  if (!systemId) {
    throw new Error("pick-up-stix: game.system is not available at module-entry time");
  }

  let mod;
  try {
    mod = await import(`./${systemId}/index.mjs`);
  } catch (err) {
    console.error(`pick-up-stix: no adapter for system "${systemId}"`, err);
    throw err;
  }

  _adapter = new mod.default();
  return _adapter;
}

/**
 * Synchronous accessor for the resolved system adapter. Throws if
 * `loadAdapter()` has not yet resolved (i.e. called too early in the
 * module lifecycle).
 *
 * @returns {import("./SystemAdapter.mjs").default}
 * @throws {Error} If called before `loadAdapter()` has resolved.
 */
export function getAdapter() {
  if (!_adapter) throw new Error("pick-up-stix: getAdapter() called before loadAdapter() resolved");
  return _adapter;
}
