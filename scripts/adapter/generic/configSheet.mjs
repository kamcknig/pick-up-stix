/**
 * GenericInteractiveItemConfigSheet — ApplicationV2 GM config dialog for
 * pick-up-stix interactive object actors on generic (unsupported) systems.
 *
 * All interactive-object state is read from and written to
 * `flags["pick-up-stix"].interactive` via `adapter.getInteractiveData` /
 * `adapter.setInteractiveData`. The actor's `system.*` data and
 * `actor.items` are never accessed.
 *
 * Per-actor singleton cached in `#instances`; abandoned-actor cleanup
 * in `close()` mirrors the dnd5e/pf2e config sheets.
 */

import { getAdapter } from "../index.mjs";
import { createStateToggleButton } from "../../utils/domButtons.mjs";
import { dbg } from "../../utils/debugLog.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const ActorSheetV2 = foundry.applications.sheets.ActorSheetV2;
const MODULE_ID = "pick-up-stix";

/**
 * Generic GM-only config sheet for `pick-up-stix.interactiveItem` actors on
 * systems that have no dedicated adapter. All data lives in actor flags.
 */
export default class GenericInteractiveItemConfigSheet
  extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** Per-actor singleton cache so repeat opens reuse the existing window. */
  static #instances = new Map();

  /**
   * Form-field name (e.g. `data.description`) currently being edited via a
   * prose-mirror editor. Null when no editor is active — in that case the
   * sheet shows the collapsible display cards instead.
   * @type {string|null}
   */
  #editingDescriptionTarget = null;

  /** Map of `data.*` field name → whether its display card is expanded. */
  #expandedSections = {};

  /**
   * Resolve the config sheet for a given actor, creating one on first call
   * and returning the cached instance on subsequent calls.
   *
   * @param {Actor} actor
   * @returns {GenericInteractiveItemConfigSheet}
   */
  static forActor(actor) {
    const key = actor.uuid;
    let sheet = GenericInteractiveItemConfigSheet.#instances.get(key);
    if (!sheet) {
      sheet = new GenericInteractiveItemConfigSheet({ document: actor });
      GenericInteractiveItemConfigSheet.#instances.set(key, sheet);
    }
    return sheet;
  }

  static DEFAULT_OPTIONS = {
    classes: ["pick-up-stix", "interactive-item-sheet", "sheet", "standard-form"],
    position: { width: 740, height: "auto" },
    window: { resizable: true },
    form: {
      submitOnChange: true,
      handler: GenericInteractiveItemConfigSheet.#onSubmit
    },
    actions: {
      editActorImage: GenericInteractiveItemConfigSheet.#onEditActorImage,
      toggleOpen: GenericInteractiveItemConfigSheet.#onToggleOpen,
      toggleLock: GenericInteractiveItemConfigSheet.#onToggleLock,
      editDescription: GenericInteractiveItemConfigSheet.#onEditDescription,
      toggleCollapsed: GenericInteractiveItemConfigSheet.#onToggleCollapsed,
      openItemSheet: GenericInteractiveItemConfigSheet.#onOpenItemSheet,
      openContainerSheet: GenericInteractiveItemConfigSheet.#onOpenContainerSheet
    }
  };

  static PARTS = {
    config: { template: "modules/pick-up-stix/templates/item-config-generic.hbs" }
  };

  get title() {
    const adapter = getAdapter();
    return `${game.i18n.localize("INTERACTIVE_ITEMS.Sheet.Configure")}: ${adapter.getInteractiveDisplayName(this.actor)}`;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const adapter = getAdapter();
    const data = adapter.getInteractiveData(this.actor);
    Object.assign(context, data, {
      actor: this.actor,
      isEditable: this.isEditable,
      needsMode: data.mode == null,
      // Item-mode actors with no itemData yet show the drop prompt (mirrors
      // the dnd5e/pf2e config sheets' `needsItem` UX — drop an item onto
      // the sheet to populate name/img/description/quantity).
      needsItem: data.mode === "item" && !data.itemData,
      isContainer: data.mode === "container",
      isItem: data.mode === "item"
    });

    // Description editor state — collapsible cards by default; the clicked
    // card swaps to a `<prose-mirror compact>` editor IN PLACE so the layout
    // doesn't reflow. Per-card editing flags rather than a single switch at
    // the top of the form, otherwise editing the bottom card would move its
    // editor up to the first card's slot.
    context.expanded = this.#expandedSections;
    context.descriptionEnriched = !!data.description;
    context.limitedDescriptionEnriched = !!data.limitedDescription;
    context.editingDescription = this.#editingDescriptionTarget === "data.description";
    context.editingLimitedDescription = this.#editingDescriptionTarget === "data.limitedDescription";
    return context;
  }

  /**
   * Wire prose-mirror save events to clear the editing target and re-render
   * the card view. Runs on every paint because V2 re-binds listeners on
   * re-render.
   */
  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelectorAll("prose-mirror").forEach(editor => {
      editor.addEventListener("save", () => {
        this.#editingDescriptionTarget = null;
        this.render();
      });
    });

    // Inject the GM-only window-header toggles (lock, open/close-for-containers)
    // so they're available alongside the close button on every render.
    if (this.isEditable) {
      const header = this.element.querySelector(".window-header");
      if (header) this.#injectHeaderToggles(header);
    }
  }

  /**
   * Inject Lock and (containers only) Open/Close toggles into the config
   * window's own header. Mirrors the dnd5e config sheet's
   * `#injectHeaderToggles` but reads state via the adapter so the buttons
   * reflect the flag-backed values rather than `actor.system.*`. Identify
   * is intentionally omitted — generic mode has supportsIdentification:false.
   */
  #injectHeaderToggles(header) {
    header.querySelectorAll(".ii-config-toggle").forEach(el => el.remove());

    const adapter = getAdapter();
    const isContainer = adapter.isInteractiveContainer(this.actor);
    const isOpen = adapter.isInteractiveOpen(this.actor);
    const isLocked = adapter.isInteractiveLocked(this.actor);
    const buttons = [];

    if (isContainer) {
      buttons.push(createStateToggleButton({
        extraClass: "ii-config-toggle",
        active: isOpen,
        iconOn: "fa-box-open",
        iconOff: "fa-box",
        labelOnKey: "INTERACTIVE_ITEMS.Sheet.StateOpened",
        labelOffKey: "INTERACTIVE_ITEMS.Sheet.StateClosed",
        action: "toggleOpen"
      }));
    }

    buttons.push(createStateToggleButton({
      extraClass: "ii-config-toggle",
      active: isLocked,
      iconOn: "fa-lock",
      iconOff: "fa-lock-open",
      labelOnKey: "INTERACTIVE_ITEMS.Sheet.StateLocked",
      labelOffKey: "INTERACTIVE_ITEMS.Sheet.StateUnlocked",
      action: "toggleLock"
    }));

    const title = header.querySelector(".window-title");
    if (title) title.after(...buttons);
    else header.prepend(...buttons);
  }

  /**
   * Open the player-facing item view sheet for an item-mode interactive.
   * Closes the config sheet first so only one view is open at a time.
   */
  static async #onOpenItemSheet(_event, _target) {
    dbg("generic-config:openItemSheet", { actorId: this.actor?.id });
    await this.close();
    await getAdapter().renderItemView(this.actor);
  }

  /**
   * Open the player-facing container view sheet for a container-mode interactive.
   * Closes the config sheet first so only one view is open at a time.
   */
  static async #onOpenContainerSheet(_event, _target) {
    dbg("generic-config:openContainerSheet", { actorId: this.actor?.id });
    await this.close();
    await getAdapter().renderContainerView(this.actor);
  }

  /**
   * Allow drag-and-drop onto the sheet — used by the empty item-mode state
   * so the GM can drag a sidebar item to populate the wrapped item data.
   */
  _canDragDrop(_selector) {
    return true;
  }

  /**
   * Drop handler. Accepts an Item drag from sidebar / compendium / character
   * sheet and writes a snapshot of its name/img/description/quantity into the
   * actor's `flags["pick-up-stix"].interactive.itemData` blob. Also syncs the
   * actor's `name` / `img` / prototype-token texture so the placed token
   * matches the dropped item.
   *
   * Mirrors the dnd5e/pf2e config sheet `_onDrop` shape but reads/writes via
   * the adapter's flag-based API rather than embedded `actor.items`.
   */
  async _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    dbg("generic-config:_onDrop", { dataType: data?.type, uuid: data?.uuid });
    if (data?.type !== "Item") return;

    const item = await fromUuid(data.uuid);
    if (!item) return;

    const adapter = getAdapter();
    if (!adapter.isPhysicalItem(item)) {
      ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NotPhysical"));
      return;
    }
    if (!game.user.isGM) return;

    // Extract data via the most common system paths. Both
    // `system.description.value` (dnd5e/pf2e shape) and `system.description`
    // (some generic systems) are checked. Missing description = empty string.
    const description = item.system?.description?.value
      ?? item.system?.description
      ?? "";
    const quantity = Number.isFinite(item.system?.quantity) ? item.system.quantity : 1;

    // Sync actor + prototype token so the placed token visually matches.
    await this.actor.update({
      name: item.name,
      img: item.img,
      "prototypeToken.name": item.name,
      "prototypeToken.texture.src": item.img
    });

    // Persist the flag-blob snapshot. Top-level name/img/description mirror
    // the actor so the rest of the module's display logic (limited dialog,
    // item view) reads the right values too.
    await adapter.setInteractiveData(this.actor, {
      name: item.name,
      img: item.img,
      description,
      itemData: { name: item.name, img: item.img, description, quantity }
    });

    ui.notifications.info(
      game.i18n.format("INTERACTIVE_ITEMS.Notify.Deposited", { name: item.name })
    );
  }

  /**
   * Form submit handler. Expands `data.*` key paths from the form fields
   * and persists them to the flag blob.
   *
   * @param {Event} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   */
  static async #onSubmit(event, form, formData) {
    const expanded = foundry.utils.expandObject(formData.object);
    const partial = expanded.data ?? {};
    dbg("generic-config:submit", { actorId: this.actor?.id, keys: Object.keys(partial) });

    // Order matters: write the flag data FIRST so the updateActor hook
    // (which fires from the subsequent actor.update below) reads the fresh
    // `data.name` when computing the prototype-token nameplate via
    // getInteractiveDisplayName. With the old order, the hook ran against
    // a stale `data.name` and the prototype token always lagged one save
    // behind, so newly-placed tokens picked up the prior name.
    await getAdapter().setInteractiveData(this.actor, partial);

    // Mirror `data.name` to `actor.name` so the existing updateActor hook
    // syncs the prototype-token name and any placed tokens' nameplates.
    if (partial.name && partial.name !== this.actor.name) {
      await this.actor.update({ name: partial.name });
    }

    // When editing a token-bound (synthetic) actor's config sheet, the
    // synthetic's name update writes to the token's delta but doesn't touch
    // the TokenDocument's own `name` field — that's what the nameplate
    // reads. Mirror the rename onto the token doc too so the hover label
    // updates without needing a re-place. The base-actor edit path doesn't
    // need this (it goes through the updateActor name-sync hook for all
    // placed tokens).
    const tokenDoc = this.actor.token;
    if (tokenDoc && partial.name && tokenDoc.name !== partial.name) {
      await tokenDoc.update({ name: partial.name });
    }
  }

  /**
   * Open a FilePicker to choose a new actor image and synchronise it to both
   * the flag blob and the actor's prototype token texture.
   *
   * @param {Event} event
   * @param {HTMLElement} _target
   */
  static async #onEditActorImage(event, _target) {
    event.preventDefault();
    dbg("generic-config:editActorImage", { actorId: this.actor?.id });
    const adapter = getAdapter();
    const data = adapter.getInteractiveData(this.actor);
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current: data.img || this.actor.img,
      callback: async (path) => {
        await adapter.setInteractiveData(this.actor, { img: path });
        await this.actor.update({ img: path, "prototypeToken.texture.src": path });
        this.render();
      }
    });
    fp.render(true);
  }

  /**
   * Toggle the container's open/closed state in the flag blob.
   *
   * @param {Event} _event
   * @param {HTMLElement} _target
   */
  static async #onToggleOpen(_event, _target) {
    const adapter = getAdapter();
    const data = adapter.getInteractiveData(this.actor);
    dbg("generic-config:toggleOpen", { actorId: this.actor?.id, wasOpen: data.isOpen });
    await adapter.setInteractiveData(this.actor, { isOpen: !data.isOpen });
  }

  /**
   * Toggle the container's locked state in the flag blob.
   *
   * @param {Event} _event
   * @param {HTMLElement} _target
   */
  static async #onToggleLock(_event, _target) {
    const adapter = getAdapter();
    const data = adapter.getInteractiveData(this.actor);
    dbg("generic-config:toggleLock", { actorId: this.actor?.id, wasLocked: data.isLocked });
    await adapter.setInteractiveData(this.actor, { isLocked: !data.isLocked });
  }

  /**
   * Enter description-editor mode for the targeted field (the card's
   * `data-target` attribute, e.g. `data.description`). Re-renders so the
   * template swaps the card for the prose-mirror editor.
   */
  static #onEditDescription(event, target) {
    event.stopPropagation();
    this.#editingDescriptionTarget = target.dataset.target;
    this.render();
  }

  /**
   * Toggle a description card's expanded/collapsed state. Persisted in
   * `#expandedSections` so the choice survives re-renders. Clicks inside the
   * already-expanded content area are ignored so editing controls don't
   * collapse the card under the cursor.
   */
  static #onToggleCollapsed(event, target) {
    if (event.target.closest(".collapsible-content")) return;
    const expandId = target.dataset.expandId;
    if (expandId) this.#expandedSections[expandId] = !this.#expandedSections[expandId];
    target.classList.toggle("collapsed");
  }

  async close(options = {}) {
    dbg("generic-config:close", { actorName: this.actor?.name, actorId: this.actor?.id });
    // Remove from cache before awaiting super.close so a re-open during close
    // always creates a fresh instance.
    GenericInteractiveItemConfigSheet.#instances.delete(this.actor?.uuid);
    const result = await super.close(options);

    // Abandoned-actor cleanup: if the actor was created via the kind-picker
    // (createKindConfirmed flag set) but the GM closed the sheet before a mode
    // was assigned, delete the blank actor. Mirrors the dnd5e/pf2e config sheets.
    const actor = this.actor;
    if (actor && game.actors.has(actor.id) && !actor.token && game.user.isGM) {
      const data = getAdapter().getInteractiveData(actor);
      if (actor.getFlag(MODULE_ID, "createKindConfirmed") && data.mode == null) {
        dbg("generic-config:close", "deleting abandoned actor with no mode", { actorId: actor.id });
        await actor.delete();
      }
    }
    return result;
  }
}
