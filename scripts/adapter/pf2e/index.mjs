import SystemAdapter from "../SystemAdapter.mjs";
import Pf2eInteractiveItemModel from "./model.mjs";
import { Pf2eIdentification } from "./identification.mjs";
import { Pf2eContainer } from "./container.mjs";
import { Pf2eSheets } from "./sheets.mjs";
import { Pf2eHooks } from "./hooks.mjs";
import Pf2eVendorModel from "./vendorModel.mjs";
import { buildPf2eCurrencyConverter } from "./currency.mjs";
import { Pf2ePurchase } from "./purchase.mjs";

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
 * - pf2e has no window-style actor ContainerSheet; the adapter opens the
 *   embedded backpack item's native ContainerSheetPF2e instead.
 * - pf2e has no `Item5e.createWithContents` equivalent; the adapter walks
 *   `system.contents` manually in `createItemsWithContents`.
 */
export default class Pf2eAdapter extends SystemAdapter {

  /** @type {string} */
  static SYSTEM_ID = "pf2e";

  #currency = null;

  /** pf2e currency converter (cp base), built lazily from fixed ratios and cached. */
  get currency() {
    return (this.#currency ??= buildPf2eCurrencyConverter());
  }

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
      // Vendor reuses the same LootPF2e base (allowedItemTypes: physical,
      // canAct: false) so the closed ActorProxyPF2e registry accepts it.
      CONFIG.PF2E.Actor.documentClasses["pick-up-stix.vendor"] = LootPF2e;
      // Vendor system data is our pf2e-aware model, overriding the base
      // VendorModel registered in core init moments earlier.
      CONFIG.Actor.dataModels["pick-up-stix.vendor"] = Pf2eVendorModel;
      // pf2e's ActorPF2e.createDialog strips module sub-types from the Create
      // Actor dialog; re-inject the vendor type so GMs can create one from the UI.
      this.#patchActorCreateDialogForVendor(LootPF2e);
    } else {
      console.warn(
        "pick-up-stix | pf2e: LootPF2e not found in CONFIG.PF2E.Actor.documentClasses — " +
        "actor creation will fail. This likely indicates a pf2e version mismatch (target: 8.x)."
      );
    }
  }

  /**
   * pf2e's ActorPF2e.createDialog (pf2e.mjs ~:36813) hard-replaces the Create
   * Actor dialog's type list with its own ACTOR_TYPES, hiding every module
   * sub-type — so "Vendor" never appears (unlike dnd5e, which does not filter).
   * It only falls back to ACTOR_TYPES when `options.types` is absent, so we wrap
   * it to inject the vendor type (NOT interactiveItem — those are created via the
   * Token HUD / item drops, never this dialog).
   *
   * Patched directly on ActorPF2e (LootPF2e's direct superclass — pf2e does not
   * export ActorPF2e) with the original preserved and `this` forwarded, so the
   * ActorProxyPF2e construct trap still selects LootPF2e for our sub-type.
   * Mirrors the direct-patch approach used for `_handleDroppedItem` in hooks.mjs.
   * Idempotency-guarded against re-init.
   *
   * @param {Function} LootPF2e - The resolved LootPF2e class (extends ActorPF2e).
   */
  #patchActorCreateDialogForVendor(LootPF2e) {
    let ActorPF2e = LootPF2e ?? null;
    while (ActorPF2e && ActorPF2e.name !== "ActorPF2e") ActorPF2e = Object.getPrototypeOf(ActorPF2e);
    if (!ActorPF2e || ActorPF2e.name !== "ActorPF2e" || typeof ActorPF2e.createDialog !== "function") {
      console.warn(
        "pick-up-stix | pf2e: ActorPF2e.createDialog not found; the 'Vendor' type will be " +
        "absent from the Create Actor dialog. Create vendors via macro/console instead."
      );
      return;
    }
    if (ActorPF2e.createDialog.pickUpStixVendorPatched) return;

    const VENDOR_TYPE = "pick-up-stix.vendor";
    const _original = ActorPF2e.createDialog;
    const patched = function (data = {}, createOptions = {}, options = {}) {
      // Only build a type list when the caller didn't pass one (the sidebar
      // "Create Actor" button passes none → pf2e would force ACTOR_TYPES and
      // drop our sub-type). Exclude interactiveItem (dotted module sub-types).
      if (!options.types) {
        const pf2eTypes = Object.keys(CONFIG.PF2E?.Actor?.documentClasses ?? {})
          .filter((t) => !t.includes("."));
        options.types = [...pf2eTypes, VENDOR_TYPE];
      } else if (!options.types.includes(VENDOR_TYPE)) {
        options.types = [...options.types, VENDOR_TYPE];
      }
      return _original.call(this, data, createOptions, options);
    };
    patched.pickUpStixVendorPatched = true;
    ActorPF2e.createDialog = patched;
  }

  capabilities = {
    /** pf2e stores an unidentified image at system.identification.unidentified.img. */
    hasUnidentifiedItemImage: true,
    /** pf2e has no drop-item hook; the adapter wraps _handleDroppedItem via libWrapper. */
    hasItemDropSheetHook: false,
    /** pf2e has no item-context-menu hook; extension deferred to Phase 7. */
    hasItemContextMenuHook: false,
    /** pf2e has no window-style actor ContainerSheet; the embedded backpack item's ContainerSheetPF2e is opened instead. */
    hasNativeContainerWindow: false,
    /** pf2e has no createWithContents equivalent; the adapter walks manually. */
    hasNativeDeepCreate: false,
    /** pf2e renders toggle-identified controls natively on every inventory row. */
    hasNativeInventoryIdentify: true,
    /** pf2e supports identified/unidentified item states. */
    supportsIdentification: true
  };

  /**
   * CSS class names for controls injected into pf2e AppV1 item sheet headers
   * and inventory rows. pf2e AppV1 sheets use `<a class="header-button">` for
   * window-header controls — `headerElementType: "a"` tells the shared button
   * factory to produce anchors instead of `<button>` elements.
   *
   * @returns {{ stateToggle: string, configButton: string, rowControl: string,
   *             headerElementType: "button"|"a" }}
   */
  get cssClasses() {
    return {
      stateToggle: "header-button",
      configButton: "header-button",
      rowControl: "item-control",
      headerElementType: "a"
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
Object.assign(Pf2eAdapter.prototype, Pf2ePurchase);
