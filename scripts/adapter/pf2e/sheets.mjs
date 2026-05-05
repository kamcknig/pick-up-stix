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
    const { default: Pf2eInteractiveItemConfigSheet } = await import("./configSheet.mjs");
    const sheet = Pf2eInteractiveItemConfigSheet.forActor(actor);
    sheet.render(true, options);
    return sheet;
  }
};
