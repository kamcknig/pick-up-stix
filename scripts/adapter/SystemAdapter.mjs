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
    hasNativeDeepCreate: false,
    /** System already renders identify/mystify controls on inventory rows (pf2e). */
    hasNativeInventoryIdentify: false,
    /**
     * System has a native identification concept (identified/mystified items
     * with separate display data). When false, core code suppresses all
     * identify UI surfaces (HUD button, header toggle, row controls, context
     * menu entries, config sheet identify-related fields) and treats every
     * item as permanently identified.
     */
    supportsIdentification: false
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

  /**
   * True if `item` is a "physical" item the module is willing to wrap as an
   * interactive object. dnd5e checks for `quantity` on `system`; pf2e checks
   * the system's PHYSICAL_ITEM_TYPES set.
   *
   * @abstract
   * @param {Item} item
   * @returns {boolean}
   */
  isPhysicalItem(item) { _abstract("isPhysicalItem"); }

  /**
   * Read the current quantity (stack size) of a physical item. Returns 1
   * for items that don't have a quantity field (e.g. spells, features).
   *
   * Both dnd5e and pf2e store the value at `system.quantity` as a plain
   * number, so the default implementation works for both. Subclasses
   * override only if their system uses a different path.
   *
   * @param {Item} item
   * @returns {number}
   */
  getItemQuantity(item) {
    const q = item?.system?.quantity;
    return Number.isFinite(q) ? q : 1;
  }

  /**
   * Write the quantity (stack size) onto raw item data prior to
   * createDocuments. Mirrors `getItemQuantity` — the default writes to
   * `system.quantity`, which both supported systems use.
   *
   * @param {object} itemData - Plain item data object (mutated in-place).
   * @param {number} quantity
   */
  setItemDataQuantity(itemData, quantity) {
    itemData.system = itemData.system ?? {};
    itemData.system.quantity = quantity;
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
   * Build a partial item update that synchronises the embedded item's
   * source-level fields (e.g. `name`) with the current identification state.
   *
   * Some systems display data-prepared values everywhere (dnd5e: item.name in
   * the sheet header swaps automatically), and need no source sync.
   * Others bind sheet inputs to the source (pf2e: the name input reads
   * `item._source.name`), and require an explicit name update so the input
   * reflects the identification state.
   *
   * @param {Actor} actor - The interactive actor (whose name holds the
   *                        identified display name and whose
   *                        `system.unidentifiedName` holds the mystified one).
   * @param {boolean} isIdentified - The post-change identification state.
   * @returns {object} A flat update object for `item.update(...)`. Empty when
   *                   the system needs no source sync.
   */
  buildEmbeddedItemSourceUpdate(actor, isIdentified) { return {}; }

  /**
   * Inverse of `buildEmbeddedItemSourceUpdate` and
   * `buildItemIdentificationUpdate`: when the GM edits the embedded item
   * via its native sheet, return the matching actor update so the wrapping
   * interactive actor stays the source of truth.
   *
   * For pf2e this routes:
   *   - the main sheet "Name" input (`_source.name`)
   *   - the Mystification tab "Display Details" name input
   *     (`system.identification.unidentified.name`)
   *   - the Mystification tab description editor
   *     (`system.identification.unidentified.data.description.value`)
   *
   * Systems that route their sheet edits through their own field paths
   * internally (dnd5e) should return `{}`.
   *
   * @param {Item} item - The embedded item that was just updated.
   * @param {object} changes - The raw changeset from the updateItem hook.
   * @param {Actor} actor - The wrapping interactive actor (item.actor).
   * @returns {object} A flat update object for `actor.update(...)`.
   */
  parseEmbeddedItemChanges(item, changes, actor) { return {}; }

  /**
   * Returns true if the `updateItem` hook changeset contains an identification
   * state change for this system. Used to decide whether the `updateItem` hook
   * should trigger actor/token sync.
   *
   * @param {Item} item
   * @param {object} changes - The raw changes object passed by the `updateItem` hook.
   * @returns {boolean}
   */
  isIdentificationChange(item, changes) { return false; }

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

  /**
   * Return the icon/label configuration for the identify toggle button, driven
   * by the current identification state. Subclasses override to provide system-
   * appropriate icons and localization keys (e.g. pf2e uses a question-mark
   * icon and its own "Mystify" / "Identify" labels).
   *
   * @param {boolean} isIdentified - Current identification state of the item.
   * @returns {{ iconOn: string, iconFamilyOn: string, labelOnKey: string,
   *             iconOff: string, iconFamilyOff: string, labelOffKey: string }}
   */
  getIdentifyButtonConfig(isIdentified) {
    return {
      iconOn: "fa-wand-sparkles",
      iconFamilyOn: "fa-solid",
      labelOnKey: "INTERACTIVE_ITEMS.Sheet.StateIdentified",
      iconOff: "fa-wand-sparkles",
      iconFamilyOff: "fa-solid",
      labelOffKey: "INTERACTIVE_ITEMS.Sheet.StateUnidentified"
    };
  }

  /**
   * Perform the system-appropriate "toggle identification" action for an item.
   * dnd5e simply flips `system.identified`. pf2e opens the native
   * `IdentifyItemPopup` (when unidentified) or calls
   * `item.setIdentificationStatus("unidentified")` (when identified).
   *
   * @abstract
   * @param {Item} item - The live embedded Item document to act on.
   * @returns {Promise<void>}
   */
  async performIdentifyToggle(item) { _abstract("performIdentifyToggle"); }

  /**
   * Flatten a list of items (and any nested contents) into plain data objects
   * ready for `Item.createDocuments`. Applies `transformAll` to each data
   * object when provided; returning `null` from the callback drops that item.
   *
   * dnd5e delegates to `Item5e.createWithContents`; pf2e walks `system.contents`
   * manually (the same logic as `createItemsWithContents` but without creating).
   *
   * @param {Item[]|object[]} items
   * @param {object} [options]
   * @param {(itemData: object) => object|null} [options.transformAll]
   * @returns {Promise<object[]>}
   */
  async flattenItemsForCreate(items, options = {}) { _abstract("flattenItemsForCreate"); }

  // === Dispatcher data accessors ============================================
  // Default implementations read from `actor.system` (the model-backed path
  // used by dnd5e and pf2e). The generic adapter overrides all five to read
  // from `flags["pick-up-stix"].interactive` instead.

  /**
   * True if the actor is in container mode.
   *
   * Model-backed adapters (dnd5e, pf2e) rely on the `InteractiveItemModel`
   * getter `actor.system.isContainer`; flag-backed adapters (generic) read
   * the equivalent flag. The default therefore covers both existing adapters
   * with no override required.
   *
   * @param {Actor} actor
   * @returns {boolean}
   */
  isInteractiveContainer(actor) {
    return !!actor?.system?.isContainer;
  }

  /**
   * True if the actor has an embedded item available to render.
   *
   * Model-backed adapters check `actor.items.size > 0` (the embedded-items
   * collection); flag-backed adapters check whether
   * `flags["pick-up-stix"].interactive` contains populated item data (or, for
   * containers, whether the flag array is present at all since containers
   * always render the container view).
   *
   * @param {Actor} actor
   * @returns {boolean}
   */
  hasInteractiveEmbeddedItem(actor) {
    return actor?.items?.size > 0;
  }

  /**
   * Human-readable display name for an interactive actor, identification-aware.
   *
   * Model-backed adapters delegate to `system.resolveTokenName()` which handles
   * the identified/unidentified name swap. Flag-backed adapters read the name
   * directly from `flags["pick-up-stix"].interactive`.
   *
   * @param {Actor} actor
   * @returns {string}
   */
  getInteractiveDisplayName(actor) {
    return actor?.system?.resolveTokenName?.() ?? actor?.name ?? "";
  }

  /**
   * Title used for the out-of-range limited-view dialog.
   *
   * Model-backed adapters read `actor.system.limitedDisplayName` (a model
   * field that falls back to `actor.name`). Flag-backed adapters read the
   * equivalent flag. dnd5e and pf2e require no override.
   *
   * @param {Actor} actor
   * @returns {string}
   */
  getInteractiveLimitedName(actor) {
    return actor?.system?.limitedDisplayName ?? actor?.name ?? "";
  }

  /**
   * Body HTML used for the out-of-range limited-view dialog.
   *
   * Model-backed adapters read `actor.system.limitedDisplayDescription` (a
   * model HTML field). Flag-backed adapters read the equivalent flag. dnd5e
   * and pf2e require no override.
   *
   * @param {Actor} actor
   * @returns {string}
   */
  getInteractiveLimitedDescription(actor) {
    return actor?.system?.limitedDisplayDescription ?? "";
  }

  /**
   * Current open/closed state of an interactive container actor. Model-backed
   * adapters read `actor.system.isOpen`; flag-backed adapters read the
   * equivalent flag. Defaults to `false` for non-container actors.
   *
   * @param {Actor} actor
   * @returns {boolean}
   */
  isInteractiveOpen(actor) {
    return !!actor?.system?.isOpen;
  }

  /**
   * Current locked state of an interactive actor. Model-backed adapters read
   * `actor.system.isLocked`; flag-backed adapters read the equivalent flag.
   *
   * @param {Actor} actor
   * @returns {boolean}
   */
  isInteractiveLocked(actor) {
    return !!actor?.system?.isLocked;
  }

  /**
   * Persist a new open/closed state on a container actor. Model-backed
   * adapters write to `actor.system.isOpen` directly; flag-backed adapters
   * update the equivalent flag via setInteractiveData (or equivalent).
   *
   * @param {Actor} actor
   * @param {boolean} isOpen
   * @returns {Promise<void>}
   */
  async setInteractiveOpenState(actor, isOpen) {
    await actor.update({ "system.isOpen": !!isOpen });
  }

  /**
   * Persist a new locked state on an actor. Model-backed adapters write to
   * `actor.system.isLocked` directly; flag-backed adapters update the
   * equivalent flag. When unlocking an already-open container, callers are
   * responsible for any related open-state side effects — this method only
   * touches the locked field.
   *
   * @param {Actor} actor
   * @param {boolean} isLocked
   * @returns {Promise<void>}
   */
  async setInteractiveLockedState(actor, isLocked) {
    await actor.update({ "system.isLocked": !!isLocked });
  }

  /**
   * Resolve the user-facing "locked" message for an actor. Model-backed
   * adapters delegate to `actor.system.lockedDisplayMessage` (a model getter
   * that falls back to a localized default). Flag-backed adapters read the
   * configured message from flags, falling back to the same localized default.
   *
   * @param {Actor} actor
   * @returns {string}
   */
  getInteractiveLockedMessage(actor) {
    return actor?.system?.lockedDisplayMessage
      ?? game.i18n.localize("INTERACTIVE_ITEMS.Notify.Locked");
  }

  /**
   * Optional alternate image used when a container actor is in the open
   * state. Model-backed adapters read `actor.system.openImage`; flag-backed
   * adapters read the equivalent flag. Returns null when no open image is
   * configured (in which case callers fall back to the actor's default img).
   *
   * @param {Actor} actor
   * @returns {string|null}
   */
  getInteractiveOpenImage(actor) {
    return actor?.system?.openImage ?? null;
  }

  // === Light emission =========================================================

  /**
   * Read the configured emitted-light data and on/off state for an interactive
   * actor. Model-backed adapters (dnd5e, pf2e) read from `actor.system.emittedLight`
   * and `actor.system.lightActive`. The flag-backed generic adapter overrides this
   * to read from the equivalent flag blob.
   *
   * `light` may be a zeroed-out default object when nothing has been configured;
   * callers should treat `(dim ?? 0) <= 0 && (bright ?? 0) <= 0` as "no emission".
   *
   * @param {Actor} actor
   * @returns {{ light: object, active: boolean }}
   */
  getInteractiveLightData(actor) {
    return {
      light: actor?.system?.emittedLight?.toObject?.() ?? actor?.system?.emittedLight ?? {},
      active: !!actor?.system?.lightActive
    };
  }

  /**
   * Persist a partial update to the actor's emitted-light data and/or active
   * flag. Model-backed adapters write to `actor.system.emittedLight` /
   * `actor.system.lightActive`; the generic adapter overrides this to write
   * the equivalent flag blob.
   *
   * @param {Actor} actor
   * @param {object} partial
   * @param {object}  [partial.light]  - Partial LightData-shape object; merged into existing emittedLight.
   * @param {boolean} [partial.active] - New on/off state.
   * @returns {Promise<Actor>}
   */
  async setInteractiveLightData(actor, partial) {
    const update = {};
    if (partial.light !== undefined) update["system.emittedLight"] = partial.light;
    if (partial.active !== undefined) update["system.lightActive"] = !!partial.active;
    return actor.update(update);
  }

  /**
   * Read the carried-light data persisted onto an inventory item's flag payload
   * (`flags["pick-up-stix"].tokenState.system.emittedLight` / `.lightActive`).
   * Used by the carried-lights pipeline to decide whether a token should emit
   * an additional synthetic source for this item.
   *
   * The default implementation is system-agnostic — every adapter stores
   * `tokenState` identically, so no subclass override is needed.
   *
   * @param {Item} item
   * @returns {{ light: object|null, active: boolean }}
   */
  getItemCarriedLightData(item) {
    const sys = item?.flags?.["pick-up-stix"]?.tokenState?.system;
    return {
      light: sys?.emittedLight ?? null,
      active: !!sys?.lightActive
    };
  }

  /**
   * Toggle the carried-light active flag on an inventory item. The change
   * propagates to the carried-lights pipeline via the `updateItem` hook.
   * No adapter override is needed — the `tokenState` flag path is uniform
   * across all systems.
   *
   * @param {Item} item
   * @param {boolean} active
   * @returns {Promise<Item>}
   */
  async setItemCarriedLightActive(item, active) {
    return item.update({ "flags.pick-up-stix.tokenState.system.lightActive": !!active });
  }

  // === Sheet delegation ======================================================

  /**
   * Render the embedded item's "real" view for an interactive container actor.
   * dnd5e opens the native ContainerSheet; pf2e opens the embedded backpack
   * item's native ContainerSheetPF2e.
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

  /**
   * Render the GM-only configuration sheet for an interactive object actor.
   * Each adapter ships its own sheet implementation matching the active
   * system's UI conventions: dnd5e uses an ApplicationV2 sheet (consistent
   * with dnd5e's own actor/item sheets); pf2e uses an ApplicationV1 sheet
   * (consistent with pf2e's actor/item sheets).
   *
   * @abstract
   * @param {Actor} actor
   * @param {object} [options]
   * @returns {Promise<Application|null>}
   */
  async renderConfigSheet(actor, options) { _abstract("renderConfigSheet"); }

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
   * `headerElementType` selects the DOM element kind used for header buttons:
   *   - `"button"` for ApplicationV2 sheets (dnd5e), styled by Foundry's
   *     `.header-control` CSS.
   *   - `"a"` for ApplicationV1 sheets (pf2e), where the system stylesheet
   *     targets `<a class="header-button">`.
   *
   * @returns {{ stateToggle: string, configButton: string, rowControl: string,
   *             headerElementType: "button"|"a" }}
   */
  get cssClasses() {
    return {
      stateToggle: "header-control pseudo-header-control state-toggle",
      configButton: "header-control-button",
      rowControl: "",
      headerElementType: "button"
    };
  }

  /**
   * Selector for the system's own identify-toggle button injected into item
   * and container sheet headers, if the system provides one. When present,
   * the unified header-controls decorator skips emitting its own identify
   * toggle and relocates the system's button into the module's canonical
   * slot (between Lock and Configure) so the two don't appear duplicated.
   *
   * Return `null` when the system has no header-level identify control —
   * the module will inject its own toggle in that case.
   *
   * @returns {string|null}
   */
  get nativeIdentifyHeaderSelector() {
    return null;
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
