/**
 * pf2e sheet-delegation methods for the SystemAdapter contract.
 *
 * pf2e ships per-type item sheets (WeaponSheetPF2e, EquipmentSheetPF2e, etc.).
 * For container actors, `renderContainerView` opens the embedded backpack item's
 * native pf2e sheet (ContainerSheetPF2e), consistent with pf2e's own AppV1
 * conventions.
 *
 * These methods are mixed into `Pf2eAdapter` in `pf2e/index.mjs`.
 */

import { dbg } from "../../utils/debugLog.mjs";

export const Pf2eSheets = {

  /**
   * Open the pf2e ContainerSheetPF2e for an interactive container actor.
   *
   * pf2e has no standalone window-style container view — containers are shown
   * inline on actor sheets. We open the embedded backpack item's own native
   * pf2e sheet, which follows pf2e's AppV1 conventions and gives GMs/players
   * the familiar pf2e item sheet UX.
   *
   * @param {Actor} actor - The interactive container actor.
   * @param {object} [options] - Options forwarded to `item.sheet.render(...)`.
   * @returns {Promise<Application|null>}
   */
  async renderContainerView(actor, options = {}) {
    // InteractiveItemSheet.render(options) may receive a boolean force flag from
    // callers using the AppV2 render(true) pattern — normalize to a plain object.
    if (typeof options !== "object" || options === null) options = {};
    const containerItem = actor.system?.containerItem;
    if (!containerItem) return null;
    dbg("pf2e-sheets:renderContainerView", { actorName: actor?.name, containerItemId: containerItem?.id });
    return containerItem.sheet.render({ force: true, ...options });
  },

  /**
   * Open the pf2e per-type item sheet for an item-mode interactive actor.
   *
   * Item-mode actors carry exactly one embedded item. `item.sheet` resolves to
   * the sheet class registered by pf2e for that item type (e.g. WeaponSheetPF2e
   * for "weapon", EquipmentSheetPF2e for "equipment", ContainerSheetPF2e for
   * "backpack", etc.).
   *
   * @param {Actor} actor
   * @param {object} [options]
   * @returns {Promise<Application|null>}
   */
  async renderItemView(actor, options = {}) {
    if (typeof options !== "object" || options === null) options = {};
    const item = actor.items.contents[0];
    if (!item) return null;
    dbg("pf2e-sheets:renderItemView", { actorName: actor?.name, itemType: item.type });
    return item.sheet.render({ force: true, ...options });
  },

  /**
   * Convenience wrapper used by limited-dialog promotion: opens the container
   * view or item sheet depending on whether the actor is in container mode.
   *
   * @param {Actor} actor
   * @param {object} [options]
   * @returns {Promise<Application|null>}
   */
  async renderEmbeddedSheet(actor, options = {}) {
    return actor.system.isContainer
      ? this.renderContainerView(actor, options)
      : this.renderItemView(actor, options);
  },

  /**
   * Open the pf2e GM config sheet (ApplicationV1). pf2e's own actor and item
   * sheets are V1; the config dialog follows the same convention. The sheet
   * class is imported lazily so the adapter file remains cheap to evaluate.
   *
   * @param {Actor} actor
   * @param {object} [options]
   * @returns {Promise<Application|null>}
   */
  async renderConfigSheet(actor, options = {}) {
    // V1 sheet.render signature is (force, options) where options is an object
    // Foundry mutates (e.g. options.editable). Coerce defensively in case the
    // caller forwarded a boolean from the legacy AppV1 force flag.
    if (typeof options !== "object" || options === null) options = {};
    const { default: Pf2eInteractiveItemConfigSheet } = await import("./configSheet.mjs");
    const sheet = Pf2eInteractiveItemConfigSheet.forActor(actor);
    sheet.render(true, options);
    return sheet;
  },

  /**
   * Register the pf2e vendor sheet for the `pick-up-stix.vendor` sub-type.
   *
   * pf2e does not export ActorSheetPF2e, so we resolve it at runtime as the
   * direct superclass of the registered LootSheetPF2e (LootSheetPF2e extends
   * ActorSheetPF2e), then hand it to the factory (the class must `extends` a
   * runtime value). pf2e registers its sheets during init; if the registry
   * isn't populated yet when this runs, defer to `setup`.
   */
  async registerVendorSheet() {
    const resolveBase = () => {
      const lootEntry = Object.values(CONFIG.Actor.sheetClasses?.loot ?? {})
        .find(s => s?.cls?.name === "LootSheetPF2e");
      const base = lootEntry?.cls ? Object.getPrototypeOf(lootEntry.cls) : null;
      return (base && base.name === "ActorSheetPF2e") ? base : null;
    };

    const tryRegister = async () => {
      const ActorSheetPF2e = resolveBase();
      if (!ActorSheetPF2e) return false;
      const { definePf2eVendorSheet } = await import("./vendorSheet.mjs");
      const Pf2eVendorSheet = definePf2eVendorSheet(ActorSheetPF2e);
      dbg("pf2e-sheets:registerVendorSheet", "registering Pf2eVendorSheet for pick-up-stix.vendor");
      foundry.documents.collections.Actors.registerSheet("pick-up-stix", Pf2eVendorSheet, {
        types: ["pick-up-stix.vendor"],
        makeDefault: true,
        label: "Vendor Sheet"
      });
      // The vendor sheet reuses pf2e's native inventory partials. pf2e preloads
      // them, but register explicitly so our template's `{{> (resolvePath ...)}}`
      // can never race an unloaded partial.
      try {
        await foundry.applications.handlebars.loadTemplates([
          "systems/pf2e/templates/actors/partials/coinage.hbs",
          "systems/pf2e/templates/actors/partials/inventory-header.hbs",
          "systems/pf2e/templates/actors/partials/inventory.hbs",
          "systems/pf2e/templates/actors/partials/encumbrance.hbs",
          "systems/pf2e/templates/actors/partials/item-line.hbs"
        ]);
      } catch (err) {
        console.warn("pick-up-stix | pf2e: failed preloading inventory partials", err);
      }
      return true;
    };

    // pf2e registers LootSheetPF2e in Hooks.once("setup"), but sheet
    // registrations made before `game.ready` are queued to a pending list and
    // only flushed into CONFIG.Actor.sheetClasses afterward — so LootSheetPF2e
    // (and thus ActorSheetPF2e, its superclass) isn't resolvable until `ready`.
    // Try eagerly, then fall back to `ready` where the registry is populated.
    if (await tryRegister()) return;
    Hooks.once("ready", async () => {
      if (!(await tryRegister())) {
        console.warn(
          "pick-up-stix | pf2e: ActorSheetPF2e not resolvable at ready — the vendor falls " +
          "back to Foundry's default sheet. (pf2e version mismatch? target 8.x)"
        );
      }
    });
  }
};
