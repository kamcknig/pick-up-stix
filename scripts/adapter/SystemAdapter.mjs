import { NotImplementedError } from "./NotImplementedError.mjs";

/**
 * Abstract base class describing every system-specific surface pick-up-stix
 * needs to address. One concrete subclass per supported system, located under
 * `scripts/adapter/<systemId>/index.mjs`.
 *
 * Methods marked with a call to `_abstract()` throw `NotImplementedError` if a
 * subclass forgets to override them. Capability flags default to `false` / `null`
 * (the safest value). Each adapter subclass overrides only what its system
 * supports, keeping core code free of `game.system.id` branches.
 *
 * @abstract
 */
export default class SystemAdapter {

  // === Identity ==============================================================

  /** @type {string|null} Foundry system id this adapter handles, e.g. "dnd5e" or "pf2e". */
  static SYSTEM_ID = null;

  // === Capability flags ======================================================
  // Capability flags express *feature presence*, not system identity.
  // Core code branches on these, never on game.system.id.

  capabilities = {
    /** System exposes a per-item "unidentified image" data field. */
    hasUnidentifiedItemImage: false,
    /** System fires a hook before container-sheet drops we can intercept. */
    hasItemDropSheetHook: false,
    /** System fires a hook to extend item context menus. */
    hasItemContextMenuHook: false,
    /** System ships a window-style ContainerSheet (dnd5e). False on pf2e
     *  where containers render inline on the actor sheet. */
    hasNativeContainerWindow: false,
    /** System exposes Item5e.createWithContents-style deep-create static. */
    hasNativeDeepCreate: false
  };

  // === Item type vocabulary ==================================================
  // Subclasses must define `containerItemType` and `defaultLootItemType` as
  // plain string prototype properties (e.g. via an Object.assign mixin or a
  // class getter override). They are intentionally absent from this base class
  // so that Object.assign-based mixins can write them onto the subclass
  // prototype without fighting a getter-only accessor.

  /**
   * True if `item` is the system's container type.
   *
   * @param {Item} item
   * @returns {boolean}
   */
  isContainerItem(item) {
    return item?.type === this.containerItemType;
  }

  // === Container parent reference ============================================

  /**
   * Read the parent-container id from a live Item document.
   *
   * @abstract
   * @param {Item} item
   * @returns {string|null}
   */
  getItemContainerId(item) { _abstract("getItemContainerId"); }

  /**
   * Write the parent-container id onto raw item data prior to create/update.
   *
   * @abstract
   * @param {object} itemData - Plain item data object (not a live document).
   * @param {string} containerId - Id of the parent container item.
   */
  setItemContainerId(itemData, containerId) { _abstract("setItemContainerId"); }

  // === Identification ========================================================

  /**
   * True if the item is currently identified.
   *
   * @abstract
   * @param {Item} item
   * @returns {boolean}
   */
  isItemIdentified(item) { _abstract("isItemIdentified"); }

  /**
   * Persist a new identification status on an existing item.
   *
   * @abstract
   * @param {Item} item
   * @param {boolean} isIdentified
   * @returns {Promise<Item>}
   */
  async setItemIdentified(item, isIdentified) { _abstract("setItemIdentified"); }

  /**
   * Return the unidentified name on the item (or null).
   *
   * @abstract
   * @param {Item} item
   * @returns {string|null}
   */
  getItemUnidentifiedName(item) { _abstract("getItemUnidentifiedName"); }

  /**
   * Return the unidentified description (HTML string) on the item (or null).
   *
   * @abstract
   * @param {Item} item
   * @returns {string|null}
   */
  getItemUnidentifiedDescription(item) { _abstract("getItemUnidentifiedDescription"); }

  /**
   * Return the unidentified image path on the item (or null). Returns null on
   * systems whose data model has no equivalent (e.g. dnd5e).
   *
   * @param {Item} item
   * @returns {string|null}
   */
  getItemUnidentifiedImage(item) { return null; }

  /**
   * Build the partial update payload that mirrors the actor's identification
   * state into its embedded item. Returns `{}` if no fields apply.
   *
   * @abstract
   * @param {Actor} actor - The interactive actor whose system fields changed.
   * @param {object} changes - The `system` slice of an Actor#update changeset.
   * @returns {object} A flat update object suitable for `item.update(...)`.
   */
  buildItemIdentificationUpdate(actor, changes) { _abstract("buildItemIdentificationUpdate"); }

  /**
   * Stamp identification status onto raw item data prior to `createDocuments`.
   * Used when initialising a freshly-dropped item.
   *
   * @abstract
   * @param {object} itemData - Plain item data object (mutated in-place).
   * @param {boolean} isIdentified
   * @returns {object} The mutated itemData.
   */
  stampNewItemIdentified(itemData, isIdentified) { _abstract("stampNewItemIdentified"); }

  // === Sheet delegation ======================================================

  /**
   * Render the embedded item's "real" view for an interactive container actor.
   * dnd5e opens the native ContainerSheet; pf2e opens the pick-up-stix-owned
   * PfContainerView (see Phase 6).
   *
   * @abstract
   * @param {Actor} actor
   * @param {object} [options]
   * @returns {Promise<Application|null>}
   */
  async renderContainerView(actor, options) { _abstract("renderContainerView"); }

  /**
   * Render the embedded item's "real" view for an item-mode actor.
   * dnd5e opens ItemSheet5e; pf2e opens the per-type *SheetPF2e.
   *
   * @abstract
   * @param {Actor} actor
   * @param {object} [options]
   * @returns {Promise<Application|null>}
   */
  async renderItemView(actor, options) { _abstract("renderItemView"); }

  // === Hook registration =====================================================
  // Each `register*` is a one-shot called from init. Inside, the adapter
  // calls Hooks.on(...) with whatever hook name(s) make sense for its system,
  // wrapping a system-agnostic callback supplied by core.

  /**
   * Register handlers for "an interactive container's contents view was
   * rendered". Core supplies one or more callbacks; adapter subscribes to the
   * appropriate hook(s).
   *
   * Each callback receives `{ actor, app, html }` (system-agnostic).
   *
   * @abstract
   * @param {object} handlers
   * @param {(ctx: {actor: Actor, app: Application, html: HTMLElement}) => void} [handlers.injectHeaderControls]
   * @param {(ctx: {actor: Actor, app: Application, html: HTMLElement}) => void} [handlers.maybeHideContents]
   * @param {(ctx: {actor: Actor, app: Application, html: HTMLElement}) => void} [handlers.installActorDropListener]
   * @param {(ctx: {actor: Actor, app: Application, html: HTMLElement}) => void} [handlers.injectItemRowControls]
   */
  registerContainerViewHooks(handlers) { _abstract("registerContainerViewHooks"); }

  /**
   * Register a header-button injection hook for the embedded item-mode sheet.
   * The supplied callback receives `{ actor, app, html }`.
   *
   * @abstract
   * @param {object} handlers
   * @param {(ctx: {app: Application, html: HTMLElement}) => void} [handlers.injectHeaderControls]
   */
  registerItemSheetHooks(handlers) { _abstract("registerItemSheetHooks"); }

  /**
   * Register a "wand icon on inventory rows" injection on actor sheets that
   * display character/NPC inventories. Callback signature: `(app, html) => void`.
   *
   * @abstract
   * @param {(app: Application, html: HTMLElement) => void} callback
   */
  registerActorInventoryHooks(callback) { _abstract("registerActorInventoryHooks"); }

  /**
   * Register a drop-into-container intercept used to gate deposits on
   * proximity / open / lock state. Callback signature:
   * `({ actor, item, sheet, data }) => boolean | undefined`
   * (returning false cancels). On systems without a drop hook (pf2e) the
   * adapter installs a `_onDrop` override or equivalent intercept and routes
   * through the same callback.
   *
   * @abstract
   * @param {(ctx: {actor: Actor, item: Item|null, sheet: Application, data: object}) => boolean|undefined} callback
   */
  registerContainerDropGate(callback) { _abstract("registerContainerDropGate"); }

  /**
   * Register an item-context-menu extension. The supplied `extender` is called
   * with `(item, menuItems)` where it may push entries. On systems without a
   * hook (pf2e) the adapter overrides the relevant sheet's context-option
   * builder and forwards.
   *
   * @abstract
   * @param {(item: Item, menuItems: object[]) => void} extender
   */
  registerItemContextMenu(extender) { _abstract("registerItemContextMenu"); }

  // === Deep create ===========================================================

  /**
   * Create a top-level item plus its nested container contents on `parent`.
   * Equivalent to dnd5e `Item5e.createWithContents`. On systems lacking a
   * native helper, walks `system.contents` manually, stamps the container
   * parent field on each child, and calls `createDocuments`.
   *
   * @abstract
   * @param {object[]|Item[]} items - Items to create (may be plain data or live documents).
   * @param {object} [options] - Options forwarded to `createDocuments`. May include `parent`.
   * @returns {Promise<Item[]>}
   */
  async createItemsWithContents(items, options) { _abstract("createItemsWithContents"); }

  // === CSS class constants ===================================================

  /**
   * CSS class names the module should use when injecting controls into the
   * native sheet header. Different systems use different classes; the adapter
   * picks values that compose with the system's stylesheet.
   *
   * @returns {{ stateToggle: string, configButton: string, rowControl: string }}
   */
  get cssClasses() {
    return {
      stateToggle: "header-control",
      configButton: "header-control-button",
      rowControl: ""
    };
  }
}

/**
 * Internal helper that throws `NotImplementedError` for abstract method stubs.
 *
 * @param {string} [methodName]
 */
function _abstract(methodName) {
  throw new NotImplementedError(methodName);
}
