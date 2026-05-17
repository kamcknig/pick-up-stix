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
    // dnd5e's ItemSheet5e (and therefore ContainerSheet) defaults to
    // window.resizable=false. Interactive container sheets need to be
    // resizable so GMs can grow the window to see the full contents
    // list. Patch the cached sheet instance's options before rendering.
    const sheet = item.sheet;
    if (sheet?.options?.window) sheet.options.window.resizable = true;
    return sheet.render({ force: true, ...options });
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
  },

  /**
   * Open the dnd5e GM config sheet (ApplicationV2). The concrete class is
   * imported lazily so that the dnd5e adapter file does not pull the sheet
   * module at module-evaluation time on systems where the adapter is unused.
   *
   * @param {Actor} actor
   * @param {object} [options]
   * @returns {Promise<Application|null>}
   */
  async renderConfigSheet(actor, options = {}) {
    // Coerce the legacy boolean "force" form into a V2 options object so the
    // spread below doesn't silently drop the request.
    if (typeof options !== "object" || options === null) options = {};
    const { default: Dnd5eInteractiveItemConfigSheet } = await import("./configSheet.mjs");
    const sheet = Dnd5eInteractiveItemConfigSheet.forActor(actor);
    await sheet.render({ force: true, ...options });
    return sheet;
  }
};
