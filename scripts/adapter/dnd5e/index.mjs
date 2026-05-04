import SystemAdapter from "../SystemAdapter.mjs";
import { Dnd5eIdentification } from "./identification.mjs";
import { Dnd5eContainer } from "./container.mjs";
import { Dnd5eSheets } from "./sheets.mjs";
import { Dnd5eHooks } from "./hooks.mjs";

/**
 * Concrete SystemAdapter implementation for the dnd5e game system.
 *
 * All method bodies are provided by the four sub-module mixins
 * (Dnd5eIdentification, Dnd5eContainer, Dnd5eSheets, Dnd5eHooks) which are
 * assigned onto the prototype below. This keeps each concern in its own file
 * without requiring class inheritance per concern.
 *
 * Capability flags reflect what dnd5e actually provides:
 * - Unidentified images are not a dnd5e data field (hasUnidentifiedItemImage: false).
 * - dnd5e fires `dnd5e.dropItemSheetData` and `dnd5e.getItemContextOptions` hooks.
 * - dnd5e ships a window-style ContainerSheet.
 * - dnd5e exposes `Item5e.createWithContents` for deep-creating container hierarchies.
 */
export default class Dnd5eAdapter extends SystemAdapter {

  /** @type {string} */
  static SYSTEM_ID = "dnd5e";

  capabilities = {
    /** dnd5e has no unidentified-image field on items. */
    hasUnidentifiedItemImage: false,
    /** dnd5e fires `dnd5e.dropItemSheetData` before container-sheet drops. */
    hasItemDropSheetHook: true,
    /** dnd5e fires `dnd5e.getItemContextOptions` for context menu extension. */
    hasItemContextMenuHook: true,
    /** dnd5e ships a full window-style ContainerSheet application. */
    hasNativeContainerWindow: true,
    /** dnd5e exposes `Item5e.createWithContents` for deep-creating containers. */
    hasNativeDeepCreate: true
  };

  // containerItemType and defaultLootItemType come from Dnd5eContainer (assigned below).
}

// Assign sub-module methods directly onto the prototype so that `this` inside
// each method correctly refers to the Dnd5eAdapter instance.
Object.assign(Dnd5eAdapter.prototype, Dnd5eIdentification);
Object.assign(Dnd5eAdapter.prototype, Dnd5eContainer);
Object.assign(Dnd5eAdapter.prototype, Dnd5eSheets);
Object.assign(Dnd5eAdapter.prototype, Dnd5eHooks);
