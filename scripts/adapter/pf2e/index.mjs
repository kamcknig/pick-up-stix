import SystemAdapter from "../SystemAdapter.mjs";
import Pf2eInteractiveItemModel from "./model.mjs";
import { Pf2eIdentification } from "./identification.mjs";
import { Pf2eContainer } from "./container.mjs";
import { Pf2eSheets } from "./sheets.mjs";
import { Pf2eHooks } from "./hooks.mjs";

/**
 * Concrete SystemAdapter implementation for the pf2e game system.
 *
 * All method bodies are provided by the four sub-module mixins
 * (Pf2eIdentification, Pf2eContainer, Pf2eSheets, Pf2eHooks) which are
 * assigned onto the prototype below. This keeps each concern in its own file
 * without requiring class inheritance per concern.
 *
 * Capability flags reflect what pf2e 8.1.0 actually provides:
 * - pf2e DOES expose a per-item unidentified image field
 *   (`system.identification.unidentified.img`).
 * - pf2e does NOT fire `pf2e.dropItemSheetData` or `pf2e.getItemContextOptions`
 *   hooks; the adapter substitutes libWrapper / hook-based equivalents.
 * - pf2e has no window-style ContainerSheet; containers render inline on the
 *   actor sheet. Phase 7 will introduce a pick-up-stix-owned ContainerView.
 * - pf2e has no `Item5e.createWithContents` equivalent; the adapter walks
 *   `system.contents` manually in `createItemsWithContents`.
 */
export default class Pf2eAdapter extends SystemAdapter {

  /** @type {string} */
  static SYSTEM_ID = "pf2e";

  constructor() {
    super();
    // Register the pf2e-aware data model so that pf2e's prepareBaseData chain
    // finds the stub fields it reads (system.details.level.value / details.alliance)
    // before ActorPF2e / TokenDocumentPF2e crash on them. Must run before the
    // LootPF2e registry entry below so both registries are coherent at init time.
    CONFIG.Actor.dataModels["pick-up-stix.interactiveItem"] = Pf2eInteractiveItemModel;

    // pf2e's ActorProxyPF2e rejects any actor type not in its closed class
    // registry (CONFIG.PF2E.Actor.documentClasses). The registry is populated
    // during pf2e's Hooks.once("init"), which runs before the module's init,
    // so we can read LootPF2e from it here and register our sub-type against
    // it. Foundry core still uses Pf2eInteractiveItemModel (from
    // CONFIG.Actor.dataModels) for actor.system.* — the two registries are
    // independent. Using LootPF2e as the base means pf2e's own actor internals
    // (allowedItemTypes: physical, canAct: false, etc.) work correctly.

    const LootPF2e = CONFIG.PF2E?.Actor?.documentClasses?.loot;
    if (LootPF2e) {
      CONFIG.PF2E.Actor.documentClasses["pick-up-stix.interactiveItem"] = LootPF2e;
    } else {
      console.warn(
        "pick-up-stix | pf2e: LootPF2e not found in CONFIG.PF2E.Actor.documentClasses — " +
        "actor creation will fail. This likely indicates a pf2e version mismatch (target: 8.x)."
      );
    }
  }

  capabilities = {
    /** pf2e stores an unidentified image at system.identification.unidentified.img. */
    hasUnidentifiedItemImage: true,
    /** pf2e has no drop-item hook; the adapter wraps _handleDroppedItem via libWrapper. */
    hasItemDropSheetHook: false,
    /** pf2e has no item-context-menu hook; extension deferred to Phase 7. */
    hasItemContextMenuHook: false,
    /** pf2e has no window-style ContainerSheet; Phase 7 provides a custom view. */
    hasNativeContainerWindow: false,
    /** pf2e has no createWithContents equivalent; the adapter walks manually. */
    hasNativeDeepCreate: false,
    /** pf2e renders toggle-identified controls natively on every inventory row. */
    hasNativeInventoryIdentify: true
  };

  /**
   * CSS class names for controls injected into pf2e AppV1 item sheet headers
   * and inventory rows. pf2e AppV1 sheets use the standard Foundry AppV1
   * `.header-button` class for window-header controls.
   *
   * @returns {{ stateToggle: string, configButton: string, rowControl: string }}
   */
  get cssClasses() {
    return {
      /** Standard AppV1 header button class used by pf2e item sheets. */
      stateToggle: "header-button",
      /** Standard AppV1 header button class used by pf2e item sheets. */
      configButton: "header-button",
      /** pf2e inventory row control class. */
      rowControl: "item-control"
    };
  }

  // containerItemType and defaultLootItemType come from Pf2eContainer (assigned below).
}

// Assign sub-module methods directly onto the prototype so that `this` inside
// each method correctly refers to the Pf2eAdapter instance.
Object.assign(Pf2eAdapter.prototype, Pf2eIdentification);
Object.assign(Pf2eAdapter.prototype, Pf2eContainer);
Object.assign(Pf2eAdapter.prototype, Pf2eSheets);
Object.assign(Pf2eAdapter.prototype, Pf2eHooks);
