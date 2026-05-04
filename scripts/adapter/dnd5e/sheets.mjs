/**
 * dnd5e sheet-delegation methods for the SystemAdapter contract.
 * dnd5e ships a window-style ContainerSheet and ItemSheet5e; this adapter
 * delegates to each via the live item's `.sheet` reference exactly as the
 * original core code did before the adapter layer was introduced.
 *
 * These methods are mixed into `Dnd5eAdapter` in `dnd5e/index.mjs`.
 */
export const Dnd5eSheets = {

  /**
   * Open the dnd5e ContainerSheet for an interactive container actor. Delegates
   * to `actor.system.containerItem.sheet` so dnd5e resolves the correct sheet
   * class for the registered item type.
   *
   * @param {Actor} actor
   * @param {object} [options]
   * @returns {Promise<Application|null>}
   */
  async renderContainerView(actor, options = {}) {
    const item = actor.system.containerItem;
    if (!item) return null;
    return item.sheet.render({ force: true, ...options });
  },

  /**
   * Open the dnd5e ItemSheet5e for an item-mode actor. Delegates to
   * `actor.items.contents[0].sheet` — item-mode actors carry exactly one
   * embedded item.
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
   * sheet or item sheet depending on whether the actor is in container mode.
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
