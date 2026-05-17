import { dbg } from "../../utils/debugLog.mjs";

/**
 * Sheet delegation mixin for the generic adapter.
 *
 * Each method lazy-imports the corresponding custom sheet class. The imports
 * execute only when a sheet is actually opened, so the adapter package loads
 * cleanly even before the target files exist (Phases 4-6). If a file is
 * absent, the dynamic import rejects and the error surfaces at open-time
 * rather than at module init.
 */
export const GenericSheets = {
  /**
   * Open (or focus) the generic container view for the given actor.
   *
   * @param {Actor} actor
   * @param {object} [options]
   * @returns {Promise<Application>}
   */
  async renderContainerView(actor, options = {}) {
    if (typeof options !== "object" || options === null) options = {};
    dbg("generic-sheets:renderContainerView", { actorName: actor?.name });
    const { default: GenericInteractiveContainerView } = await import("./containerView.mjs");
    const sheet = GenericInteractiveContainerView.forActor(actor);
    await sheet.render({ force: true, ...options });
    return sheet;
  },

  /**
   * Open (or focus) the generic item view for the given actor.
   *
   * @param {Actor} actor
   * @param {object} [options]
   * @returns {Promise<Application>}
   */
  async renderItemView(actor, options = {}) {
    if (typeof options !== "object" || options === null) options = {};
    dbg("generic-sheets:renderItemView", { actorName: actor?.name });
    const { default: GenericInteractiveItemView } = await import("./itemView.mjs");
    const sheet = GenericInteractiveItemView.forActor(actor);
    await sheet.render({ force: true, ...options });
    return sheet;
  },

  /**
   * Open the appropriate embedded view (container or item) based on the
   * actor's current mode.
   *
   * @param {Actor} actor
   * @param {object} [options]
   * @returns {Promise<Application>}
   */
  async renderEmbeddedSheet(actor, options = {}) {
    return this.isInteractiveContainer(actor)
      ? this.renderContainerView(actor, options)
      : this.renderItemView(actor, options);
  },

  /**
   * Open (or focus) the generic GM config sheet for the given actor.
   *
   * @param {Actor} actor
   * @param {object} [options]
   * @returns {Promise<Application>}
   */
  async renderConfigSheet(actor, options = {}) {
    if (typeof options !== "object" || options === null) options = {};
    dbg("generic-sheets:renderConfigSheet", { actorName: actor?.name });
    const { default: GenericInteractiveItemConfigSheet } = await import("./configSheet.mjs");
    const sheet = GenericInteractiveItemConfigSheet.forActor(actor);
    await sheet.render({ force: true, ...options });
    return sheet;
  }
};
