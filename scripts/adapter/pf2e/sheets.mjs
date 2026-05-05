/**
 * pf2e sheet-delegation methods for the SystemAdapter contract.
 *
 * pf2e ships per-type item sheets (WeaponSheetPF2e, EquipmentSheetPF2e, etc.)
 * but has no window-style ContainerSheet equivalent — containers render inline
 * on actor sheets. A dedicated ContainerView application for pf2e is planned
 * for Phase 7; until then `renderContainerView` returns a placeholder warning.
 *
 * These methods are mixed into `Pf2eAdapter` in `pf2e/index.mjs`.
 */
export const Pf2eSheets = {

  /**
   * Render the container view for an interactive container actor.
   *
   * Phase 7 builds the dedicated pf2e ContainerView application. Until then
   * this method warns and returns null so that Phase 1–5 dnd5e regression
   * testing remains clean and the empty code path is explicit rather than
   * silently broken.
   *
   * @param {Actor} _actor
   * @param {object} [_options]
   * @returns {Promise<null>}
   */
  async renderContainerView(_actor, _options = {}) {
    ui.notifications.warn("Container view for pf2e is not yet wired (Phase 7).");
    return null;
  },

  /**
   * Open the pf2e per-type item sheet for an item-mode interactive actor.
   * Item-mode actors carry exactly one embedded item; `item.sheet` resolves to
   * the sheet class registered by pf2e for that item type (e.g. WeaponSheetPF2e
   * for "weapon", EquipmentSheetPF2e for "equipment", ContainerSheetPF2e for
   * "backpack", etc.).
   *
   * @param {Actor} actor
   * @param {object} [options]
   * @returns {Promise<Application|null>}
   */
  async renderItemView(actor, options = {}) {
    const item = actor.items.contents[0];
    if (!item) return null;
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
  }
};
