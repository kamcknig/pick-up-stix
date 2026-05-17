import { dbg } from "../../utils/debugLog.mjs";

/**
 * Hook registration mixin for the generic adapter.
 *
 * All `register*` methods are permanent no-ops — the generic adapter does not
 * decorate system sheets because it never uses them. Drop handling for the
 * module's custom sheets happens inside those sheets directly (Phase 6). The
 * no-ops satisfy the SystemAdapter contract so core code can call them
 * unconditionally without branching on adapter type.
 */
export const GenericHooks = {
  registerItemSheetHooks(_handlers) {
    dbg("generic-hooks:registerItemSheetHooks", "no-op — generic mode doesn't decorate system item sheets");
  },
  registerContainerViewHooks(_handlers) {
    dbg("generic-hooks:registerContainerViewHooks", "no-op — generic mode uses its own container view sheet");
  },
  registerActorInventoryHooks(callback) {
    // Subscribe to the base Foundry render hook so PC/NPC inventories on
    // unknown systems get decorated when their markup happens to expose
    // [data-item-id] rows (the heuristic used by the shared row decorator).
    // Identify controls are still suppressed by supportsIdentification:false
    // inside the callback; what the callback DOES inject in generic mode is
    // the light-toggle row icon for items carrying a non-zero light radius.
    // Graceful no-op when the active system's sheet uses different markup.
    dbg("generic-hooks:registerActorInventoryHooks", "subscribing to renderActorSheet for light-row decoration");
    Hooks.on("renderActorSheet", callback);
  },
  registerContainerDropGate(_callback) {
    dbg("generic-hooks:registerContainerDropGate", "no-op — generic container sheet handles its own drops");
  },
  registerItemContextMenu(_extender) {
    dbg("generic-hooks:registerItemContextMenu", "no-op — no portable context menu hook");
  }
};
