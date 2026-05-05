/**
 * dnd5e hook-registration methods for the SystemAdapter contract.
 * Each `register*` method subscribes to the dnd5e- or Foundry-core hook
 * that provides the relevant event and routes it through the system-agnostic
 * callback supplied by core code.
 *
 * These methods are mixed into `Dnd5eAdapter` in `dnd5e/index.mjs`.
 */
export const Dnd5eHooks = {

  /**
   * Subscribe to `dnd5e.getItemContextOptions` and forward to the supplied
   * `extender`, which receives `(item, menuItems)` and may push new entries.
   *
   * @param {(item: Item, menuItems: object[]) => void} extender
   */
  registerItemContextMenu(extender) {
    Hooks.on("dnd5e.getItemContextOptions", (item, menuItems) => extender(item, menuItems));
  },

  /**
   * Subscribe to `dnd5e.dropItemSheetData` and forward to the supplied
   * `callback`. The hook fires before dnd5e processes the drop; returning
   * `false` from the callback cancels dnd5e's native handling.
   *
   * The callback receives `{ actor, item, sheet, data }` where `item` is the
   * container item (whose actor is the interactive container actor).
   *
   * @param {(ctx: {actor: Actor, item: Item, sheet: Application, data: object}) => boolean|undefined} callback
   */
  registerContainerDropGate(callback) {
    Hooks.on("dnd5e.dropItemSheetData", (item, sheet, data) => {
      const actor = item.actor;
      return callback({ actor, item, sheet, data });
    });
  },

  /**
   * Subscribe to `renderItemSheet5e` and forward to the supplied
   * `injectHeaderControls` handler, which receives `{ app, html }`.
   *
   * @param {object} handlers
   * @param {(ctx: {app: Application, html: HTMLElement}) => void} [handlers.injectHeaderControls]
   */
  registerItemSheetHooks({ injectHeaderControls }) {
    Hooks.on("renderItemSheet5e", (app, html) => injectHeaderControls?.({ app, html }));
  },

  /**
   * Subscribe to `renderContainerSheet` four times, each with one of the
   * supplied decorator callbacks. Each callback receives `{ actor, app, html }`.
   *
   * Four separate subscriptions are used (rather than one combined handler) so
   * the individual concerns remain independent and can be debugged in isolation.
   *
   * @param {object} handlers
   * @param {(ctx: {actor: Actor, app: Application, html: HTMLElement}) => void} [handlers.injectHeaderControls]
   * @param {(ctx: {actor: Actor, app: Application, html: HTMLElement}) => void} [handlers.maybeHideContents]
   * @param {(ctx: {actor: Actor, app: Application, html: HTMLElement}) => void} [handlers.installActorDropListener]
   * @param {(ctx: {actor: Actor, app: Application, html: HTMLElement}) => void} [handlers.injectItemRowControls]
   */
  registerContainerViewHooks({ injectHeaderControls, maybeHideContents, installActorDropListener, injectItemRowControls, injectContentsTab }) {
    Hooks.on("renderContainerSheet", (app, html) => injectHeaderControls?.({ actor: app.item?.actor, app, html }));
    Hooks.on("renderContainerSheet", (app, html) => maybeHideContents?.({ actor: app.item?.actor, app, html }));
    Hooks.on("renderContainerSheet", (app, html) => installActorDropListener?.({ actor: app.item?.actor, app, html }));
    Hooks.on("renderContainerSheet", (app, html) => injectItemRowControls?.({ actor: app.item?.actor, app, html }));
    Hooks.on("renderContainerSheet", (app, html) => injectContentsTab?.({ actor: app.item?.actor, app, html }));
  },

  /**
   * Subscribe to the three actor-sheet render hooks that dnd5e fires when an
   * actor sheet is rendered, and forward each to the supplied `callback`.
   * The callback receives `(app, html)` as supplied by the hook.
   *
   * @param {(app: Application, html: HTMLElement) => void} callback
   */
  registerActorInventoryHooks(callback) {
    Hooks.on("renderActorSheet", callback);
    Hooks.on("renderCharacterActorSheet", callback);
    Hooks.on("renderNPCActorSheet", callback);
  }
};
